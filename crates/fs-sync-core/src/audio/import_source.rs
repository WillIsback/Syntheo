//! Ouverture unique d'un enregistrement importé (issue 744, suite de 657).
//!
//! Le chemin d'un import demandé par un agent est validé par la CLI, puis lu
//! plus tard par l'application : entre les deux, le fichier peut être remplacé
//! (fenêtre TOCTOU). Ici le fichier est ouvert **une seule fois** ; toutes les
//! vérifications (type, taille, lien symbolique, chemin réel) portent sur le
//! descripteur ouvert, et c'est ce même descripteur qui est lu.

use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Enregistrement ouvert et validé : `file` est le descripteur vérifié,
/// `path` le chemin canonique qui y mène, `len` sa taille au moment de la
/// vérification.
#[derive(Debug)]
pub struct OpenedImportSource {
    pub file: File,
    pub path: PathBuf,
    pub len: u64,
}

/// Contraintes d'un import. `extensions` vide accepte toute extension.
#[derive(Debug, Clone, Copy)]
pub struct ImportSourceLimits<'a> {
    pub max_len: u64,
    pub extensions: &'a [&'a str],
}

fn invalid(message: &'static str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, message)
}

/// Étapes observables par les tests, pour simuler un remplacement du fichier
/// au pire moment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ImportStage {
    /// Chemin canonique et extension vérifiés, fichier pas encore ouvert.
    PathChecked,
    /// Fichier ouvert et vérifié, contenu pas encore lu.
    Opened,
}

/// Ouvre `source_path` une seule fois et vérifie le fichier **ouvert** :
/// fichier régulier non vide, sous la taille maximale, atteint sans lien
/// symbolique au dernier composant, et toujours désigné par son chemin
/// canonique.
pub fn open_import_source(
    source_path: &Path,
    limits: ImportSourceLimits<'_>,
) -> std::io::Result<OpenedImportSource> {
    open_import_source_observed(source_path, limits, &mut |_| {})
}

pub(crate) fn open_import_source_observed(
    source_path: &Path,
    limits: ImportSourceLimits<'_>,
    observe: &mut dyn FnMut(ImportStage),
) -> std::io::Result<OpenedImportSource> {
    // Le chemin canonique ne contient plus aucun lien symbolique. Sous Unix,
    // l'ouvrir sans suivre de lien refuse un lien posé à sa place
    // entre-temps ; sous Windows, `still_at` refuse le handle s'il mène
    // ailleurs.
    let canonical = std::fs::canonicalize(source_path)?;
    if !limits.extensions.is_empty() {
        let extension = canonical
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !limits.extensions.contains(&extension.as_str()) {
            return Err(invalid("unsupported_recording_format"));
        }
    }
    observe(ImportStage::PathChecked);

    let file = platform::open_once(&canonical)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err(invalid("audio_source_must_be_a_nonempty_file"));
    }
    if metadata.len() > limits.max_len {
        return Err(invalid("audio_source_too_large"));
    }
    // Un dossier parent remplacé par un lien entre la canonicalisation et
    // l'ouverture mènerait ailleurs : le descripteur doit encore désigner
    // le chemin canonique validé.
    if !platform::still_at(&file, &metadata, &canonical)? {
        return Err(invalid("audio_source_changed_during_import"));
    }
    observe(ImportStage::Opened);

    Ok(OpenedImportSource {
        file,
        path: canonical,
        len: metadata.len(),
    })
}

impl OpenedImportSource {
    /// Lit le contenu par le descripteur validé, en mémoire. La taille lue doit
    /// être celle vérifiée à l'ouverture : un fichier tronqué ou allongé
    /// pendant la lecture est refusé.
    pub fn read_to_vec(mut self) -> std::io::Result<Vec<u8>> {
        let expected = usize::try_from(self.len).map_err(|_| invalid("audio_source_too_large"))?;
        let mut data = Vec::new();
        data.try_reserve_exact(expected).map_err(|_| {
            std::io::Error::new(
                std::io::ErrorKind::OutOfMemory,
                "audio_source_out_of_memory",
            )
        })?;
        (&mut self.file).take(self.len).read_to_end(&mut data)?;
        let mut probe = [0_u8; 1];
        if data.len() != expected || self.file.read(&mut probe)? != 0 {
            return Err(invalid("audio_source_changed_during_import"));
        }
        Ok(data)
    }
}

/// Ouvre et lit un enregistrement en une seule ouverture ; renvoie son
/// contenu et son chemin canonique.
pub fn read_import_source(
    source_path: &Path,
    limits: ImportSourceLimits<'_>,
) -> std::io::Result<(Vec<u8>, PathBuf)> {
    read_import_source_observed(source_path, limits, &mut |_| {})
}

pub(crate) fn read_import_source_observed(
    source_path: &Path,
    limits: ImportSourceLimits<'_>,
    observe: &mut dyn FnMut(ImportStage),
) -> std::io::Result<(Vec<u8>, PathBuf)> {
    let opened = open_import_source_observed(source_path, limits, observe)?;
    let path = opened.path.clone();
    Ok((opened.read_to_vec()?, path))
}

#[cfg(unix)]
mod platform {
    use std::fs::{File, Metadata};
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    use std::path::Path;

    /// `O_NOFOLLOW` : un lien symbolique au dernier composant fait échouer
    /// l'ouverture (`ELOOP`). `O_NONBLOCK` : une FIFO posée à la place du
    /// fichier ne bloque pas l'ouverture ; elle est refusée par `fstat`.
    pub(super) fn open_once(path: &Path) -> std::io::Result<File> {
        std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC)
            .open(path)
    }

    /// Le descripteur désigne-t-il encore le chemin canonique validé ? Sous
    /// Linux, `/proc/self/fd` donne le chemin réel du descripteur, sans course.
    /// Ailleurs (ou sans `/proc`), le chemin est recanonicalisé et doit mener
    /// au même fichier (même périphérique, même inode).
    pub(super) fn still_at(file: &File, opened: &Metadata, path: &Path) -> std::io::Result<bool> {
        #[cfg(any(target_os = "linux", target_os = "android"))]
        {
            use std::os::fd::AsRawFd;
            let link = std::path::PathBuf::from(format!("/proc/self/fd/{}", file.as_raw_fd()));
            if let Ok(real) = std::fs::read_link(link) {
                return Ok(real == path);
            }
        }
        #[cfg(not(any(target_os = "linux", target_os = "android")))]
        let _ = file;
        let resolved = match std::fs::canonicalize(path) {
            Ok(resolved) => resolved,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error),
        };
        if resolved != path {
            return Ok(false);
        }
        let current = std::fs::metadata(&resolved)?;
        Ok(current.is_file() && current.dev() == opened.dev() && current.ino() == opened.ino())
    }
}

#[cfg(windows)]
mod platform {
    use std::ffi::OsString;
    use std::fs::{File, Metadata};
    use std::os::windows::ffi::OsStringExt;
    use std::os::windows::io::AsRawHandle;
    use std::path::{Path, PathBuf};

    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{FILE_NAME_NORMALIZED, GetFinalPathNameByHandleW};

    /// Ouverture ordinaire, sans `FILE_FLAG_OPEN_REPARSE_POINT` : beaucoup de
    /// points d'analyse ne sont pas des liens (fichiers OneDrive « à la
    /// demande », déduplication…) et doivent être ouverts normalement, pour
    /// que le pilote les rapatrie. Un lien symbolique ou une jonction posé à
    /// la place du fichier ou d'un dossier parent est suivi ici, mais le handle
    /// mène alors à un autre chemin final : `still_at` refuse l'ouverture.
    pub(super) fn open_once(path: &Path) -> std::io::Result<File> {
        std::fs::OpenOptions::new().read(true).open(path)
    }

    /// Chemin final du handle ouvert, comparé au chemin canonique validé
    /// (insensible à la casse, comme le système de fichiers).
    pub(super) fn still_at(file: &File, _opened: &Metadata, path: &Path) -> std::io::Result<bool> {
        let final_path = final_path(file)?;
        Ok(final_path.to_string_lossy().to_lowercase() == path.to_string_lossy().to_lowercase())
    }

    fn final_path(file: &File) -> std::io::Result<PathBuf> {
        let handle = HANDLE(file.as_raw_handle());
        let mut buffer = vec![0_u16; 1024];
        loop {
            // SAFETY : handle ouvert pendant l'appel, tampon de la taille annoncée.
            let len =
                unsafe { GetFinalPathNameByHandleW(handle, &mut buffer, FILE_NAME_NORMALIZED) }
                    as usize;
            if len == 0 {
                return Err(std::io::Error::last_os_error());
            }
            if len < buffer.len() {
                buffer.truncate(len);
                return Ok(PathBuf::from(OsString::from_wide(&buffer)));
            }
            buffer.resize(len + 1, 0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use assert_fs::TempDir;

    const LIMITS: ImportSourceLimits<'static> = ImportSourceLimits {
        max_len: 1024,
        extensions: &["wav"],
    };

    #[test]
    fn reads_the_validated_recording() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("meeting.wav");
        std::fs::write(&path, b"validated audio").unwrap();

        let (data, canonical) = read_import_source(&path, LIMITS).unwrap();

        assert_eq!(data, b"validated audio");
        assert_eq!(canonical, std::fs::canonicalize(&path).unwrap());
    }

    #[test]
    fn refuses_wrong_extension_empty_oversized_and_directories() {
        let temp = TempDir::new().unwrap();
        let text = temp.path().join("notes.txt");
        std::fs::write(&text, b"text").unwrap();
        assert!(read_import_source(&text, LIMITS).is_err());

        let empty = temp.path().join("empty.wav");
        std::fs::write(&empty, b"").unwrap();
        assert!(read_import_source(&empty, LIMITS).is_err());

        let large = temp.path().join("large.wav");
        std::fs::write(&large, vec![0_u8; 2048]).unwrap();
        assert!(read_import_source(&large, LIMITS).is_err());

        let dir = temp.path().join("folder.wav");
        std::fs::create_dir(&dir).unwrap();
        assert!(read_import_source(&dir, LIMITS).is_err());
    }

    /// Fichier remplacé (renommage atomique) après l'ouverture et avant la
    /// lecture : c'est le contenu validé qui est lu, pas le remplaçant.
    #[test]
    fn a_file_replaced_after_validation_is_not_read() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("meeting.wav");
        std::fs::write(&path, b"validated audio").unwrap();
        let other = temp.path().join("other.bin");
        std::fs::write(&other, b"other content!!").unwrap();

        let (data, _) = read_import_source_observed(&path, LIMITS, &mut |stage| {
            if stage == ImportStage::Opened {
                std::fs::rename(&other, &path).unwrap();
            }
        })
        .unwrap();

        assert_eq!(data, b"validated audio");
    }

    /// Lien symbolique posé à la place du fichier après la vérification du
    /// chemin et avant l'ouverture : l'import échoue au lieu de suivre le lien.
    #[cfg(unix)]
    #[test]
    fn a_symlink_swapped_in_before_opening_is_refused() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("meeting.wav");
        std::fs::write(&path, b"validated audio").unwrap();
        let secret = temp.path().join("secret.bin");
        std::fs::write(&secret, b"secret content!").unwrap();

        let result = read_import_source_observed(&path, LIMITS, &mut |stage| {
            if stage == ImportStage::PathChecked {
                std::fs::remove_file(&path).unwrap();
                std::os::unix::fs::symlink(&secret, &path).unwrap();
            }
        });

        assert!(result.is_err(), "the swapped-in link must not be followed");
    }

    /// Lien symbolique posé à la place du fichier après l'ouverture : le
    /// descripteur validé reste celui qui est lu.
    #[cfg(unix)]
    #[test]
    fn a_symlink_swapped_in_after_opening_is_not_followed() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("meeting.wav");
        std::fs::write(&path, b"validated audio").unwrap();
        let secret = temp.path().join("secret.bin");
        std::fs::write(&secret, b"secret content!").unwrap();

        let (data, _) = read_import_source_observed(&path, LIMITS, &mut |stage| {
            if stage == ImportStage::Opened {
                std::fs::remove_file(&path).unwrap();
                std::os::unix::fs::symlink(&secret, &path).unwrap();
            }
        })
        .unwrap();

        assert_eq!(data, b"validated audio");
    }

    /// Windows : lien symbolique posé à la place du fichier entre la
    /// vérification du chemin et l'ouverture. Le handle suit le lien mais son
    /// chemin final n'est plus le chemin validé : refus. Ignoré si le compte
    /// n'a pas le droit de créer un lien symbolique (mode développeur absent).
    #[cfg(windows)]
    #[test]
    fn a_symlink_swapped_in_before_opening_is_refused_on_windows() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("meeting.wav");
        std::fs::write(&path, b"validated audio").unwrap();
        let secret = temp.path().join("secret.wav");
        std::fs::write(&secret, b"secret content!").unwrap();
        let mut linked = true;

        let result = read_import_source_observed(&path, LIMITS, &mut |stage| {
            if stage == ImportStage::PathChecked {
                std::fs::remove_file(&path).unwrap();
                linked = std::os::windows::fs::symlink_file(&secret, &path).is_ok();
                if !linked {
                    std::fs::write(&path, b"validated audio").unwrap();
                }
            }
        });

        if linked {
            assert!(result.is_err(), "the swapped-in link must not be read");
        } else {
            eprintln!("ignoré : lien impossible (droit de créer un lien symbolique absent)");
        }
    }

    /// Windows : crée une jonction `link` vers le dossier `target`. Une
    /// jonction ne demande aucun privilège, contrairement à un lien symbolique.
    #[cfg(windows)]
    fn junction(link: &std::path::Path, target: &std::path::Path) {
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "mklink /J: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// Windows : dossier parent remplacé par une jonction entre la
    /// vérification du chemin et l'ouverture. Le handle suit la jonction, mais
    /// son chemin final n'est plus le chemin validé : refus.
    #[cfg(windows)]
    #[test]
    fn a_parent_directory_swapped_for_a_junction_is_refused_on_windows() {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("recordings");
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join("meeting.wav"), b"validated audio").unwrap();
        let elsewhere = temp.path().join("elsewhere");
        std::fs::create_dir(&elsewhere).unwrap();
        std::fs::write(elsewhere.join("meeting.wav"), b"other content!!").unwrap();

        let result = read_import_source_observed(&dir.join("meeting.wav"), LIMITS, &mut |stage| {
            if stage == ImportStage::PathChecked {
                std::fs::rename(&dir, temp.path().join("moved")).unwrap();
                junction(&dir, &elsewhere);
            }
        });

        let error = result.expect_err("the junction must not redirect the read");
        assert_eq!(error.to_string(), "audio_source_changed_during_import");
    }

    /// Windows : un chemin qui traverse une jonction déjà en place est
    /// accepté et lu depuis sa cible réelle.
    #[cfg(windows)]
    #[test]
    fn a_path_through_an_existing_junction_is_accepted_on_windows() {
        let temp = TempDir::new().unwrap();
        let real = temp.path().join("real");
        std::fs::create_dir(&real).unwrap();
        std::fs::write(real.join("meeting.wav"), b"validated audio").unwrap();
        let alias = temp.path().join("alias");
        junction(&alias, &real);

        let (data, canonical) = read_import_source(&alias.join("meeting.wav"), LIMITS).unwrap();

        assert_eq!(data, b"validated audio");
        assert_eq!(
            canonical,
            std::fs::canonicalize(real.join("meeting.wav")).unwrap()
        );
    }

    /// Windows : le même fichier atteint par le partage administratif local,
    /// en chemin UNC court (`\\localhost\C$\…`) et long (`\\?\UNC\…`), est
    /// accepté. Ignoré si le partage administratif n'est pas joignable.
    #[cfg(windows)]
    #[test]
    fn unc_paths_to_a_local_file_are_accepted_on_windows() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("meeting.wav");
        std::fs::write(&path, b"validated audio").unwrap();
        let plain = path.to_string_lossy().into_owned();
        let (drive, rest) = (&plain[..1], &plain[3..]);
        let short = std::path::PathBuf::from(format!(r"\\localhost\{drive}$\{rest}"));
        let long = std::path::PathBuf::from(format!(r"\\?\UNC\localhost\{drive}$\{rest}"));

        if let Err(error) = std::fs::metadata(&short) {
            eprintln!(
                "ignoré : partage administratif \\\\localhost\\{drive}$ injoignable ({error})"
            );
            return;
        }
        for candidate in [&short, &long] {
            let (data, _) = read_import_source(candidate, LIMITS)
                .unwrap_or_else(|error| panic!("{}: {error}", candidate.display()));
            assert_eq!(data, b"validated audio", "{}", candidate.display());
        }
    }

    /// Dossier parent remplacé par un lien entre la vérification du chemin et
    /// l'ouverture : le descripteur ne désigne plus le chemin validé, refus.
    #[cfg(unix)]
    #[test]
    fn a_parent_directory_swapped_for_a_link_is_refused() {
        let temp = TempDir::new().unwrap();
        let dir = temp.path().join("recordings");
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join("meeting.wav"), b"validated audio").unwrap();
        let elsewhere = temp.path().join("elsewhere");
        std::fs::create_dir(&elsewhere).unwrap();
        std::fs::write(elsewhere.join("meeting.wav"), b"other content!!").unwrap();

        let result = read_import_source_observed(&dir.join("meeting.wav"), LIMITS, &mut |stage| {
            if stage == ImportStage::PathChecked {
                std::fs::rename(&dir, temp.path().join("moved")).unwrap();
                std::os::unix::fs::symlink(&elsewhere, &dir).unwrap();
            }
        });

        assert!(
            result.is_err(),
            "the parent link must not redirect the read"
        );
    }
}
