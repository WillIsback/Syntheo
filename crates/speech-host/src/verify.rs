//! Vérification avant chaque lancement (issue 683) : les fichiers du
//! compagnon et les modèles doivent correspondre aux tailles et empreintes
//! compilées dans l'application.
//!
//! On exécute exactement ce qui a été haché :
//! - les fichiers du compagnon (binaire, et sous Windows le runtime Visual
//!   C++) sont copiés dans un dossier privé neuf par lancement (Linux : 0700 ;
//!   Windows : ACL limitée au propriétaire, posée à la création), hachés
//!   depuis la copie, puis exécutés depuis elle ;
//! - les modèles ne sont pas copiés. Linux : chaque modèle est ouvert, haché
//!   depuis son descripteur, et le module en hérite ; le dossier privé
//!   l'expose par un lien `/proc/self/fd/N`. Windows : chaque modèle et
//!   chaque dossier de son chemin sont ouverts sans partage en écriture ni en
//!   suppression, points de réanalyse refusés, chemin final vérifié.
//!
//! Le tout vit aussi longtemps que le processus (`Staging`).

use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::companion::{Companion, binary_name};
use crate::models::ModelFile;

#[derive(Debug, PartialEq, Eq)]
pub enum VerifyError {
    /// Compagnon absent de l'application (construction sans lui), ou fichier
    /// manquant, lien, ou de mauvaise taille.
    CompanionMissing,
    /// Fichier du compagnon différent de son empreinte compilée.
    CompanionAltered,
    /// Modèle absent, pas un fichier ordinaire, ou de mauvaise taille.
    ModelsMissing,
    /// Modèle différent de son empreinte.
    ModelsAltered,
    /// Chemin final inattendu (Windows).
    UnsafePath,
    /// Erreur d'entrée-sortie (disque plein…) : passagère, pas un refus.
    Io,
}

impl VerifyError {
    /// Code stable pour l'interface (messages traduits côté interface).
    pub fn code(&self) -> &'static str {
        match self {
            Self::CompanionMissing => "companion_missing",
            Self::CompanionAltered => "companion_altered",
            Self::ModelsMissing => "models_missing",
            Self::ModelsAltered | Self::UnsafePath => "models_altered",
            Self::Io => "io",
        }
    }
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::CompanionMissing => "the on-device program is missing or incomplete",
            Self::CompanionAltered => "the on-device program does not match its checksum",
            Self::ModelsMissing => "on-device models are missing or incomplete",
            Self::ModelsAltered => "an on-device model does not match its checksum",
            Self::UnsafePath => "an on-device model is not where it should be",
            Self::Io => "the on-device program could not be prepared (input/output error)",
        })
    }
}

/// Compagnon et modèles vérifiés : chemins à utiliser pour le lancement, et
/// garde des objets vérifiés.
#[derive(Debug)]
pub struct Verified {
    pub binary: PathBuf,
    pub models: PathBuf,
    pub staging: Staging,
}

/// Garde des objets vérifiés (voir le module) : le dossier privé, supprimé à
/// la libération, et les fichiers ouverts.
#[derive(Debug, Default)]
pub struct Staging {
    dir: Option<PathBuf>,
    handles: Vec<std::fs::File>,
}

impl Staging {
    /// Descripteurs que le module doit hériter (Linux).
    #[cfg(unix)]
    pub fn inherited_fds(&self) -> Vec<i32> {
        use std::os::fd::AsRawFd;
        self.handles.iter().map(AsRawFd::as_raw_fd).collect()
    }
}

impl Drop for Staging {
    fn drop(&mut self) {
        self.handles.clear();
        if let Some(dir) = self.dir.take() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}

fn io(_: std::io::Error) -> VerifyError {
    VerifyError::Io
}

/// Ouverture d'un modèle : absent → refus ; toute autre erreur (descripteurs
/// épuisés, E/S, accès, violation de partage) → passagère.
fn open_error(error: std::io::Error) -> VerifyError {
    if error.kind() == std::io::ErrorKind::NotFound {
        VerifyError::ModelsMissing
    } else {
        VerifyError::Io
    }
}

/// Préfixe des copies privées, dans le dossier de données de la source.
const RUN_PREFIX: &str = ".run-";

/// Supprime les copies privées laissées par un arrêt brutal.
pub fn remove_stale_copies(run_root: &Path) {
    let Ok(entries) = std::fs::read_dir(run_root) else {
        return;
    };
    for entry in entries.flatten() {
        let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
        if is_dir && entry.file_name().to_string_lossy().starts_with(RUN_PREFIX) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

fn sha256_reader(file: &mut impl Read) -> std::io::Result<String> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// Contrôles sans hachage : compagnon présent, modèles présents, ordinaires
/// et à la bonne taille.
pub fn check(
    companion: Option<&Companion>,
    models_dir: &Path,
    models: &[ModelFile],
) -> Result<(), VerifyError> {
    let companion = companion.ok_or(VerifyError::CompanionMissing)?;
    if !companion.present() {
        return Err(VerifyError::CompanionMissing);
    }
    for model in models {
        let metadata = std::fs::symlink_metadata(model.under(models_dir))
            .map_err(|_| VerifyError::ModelsMissing)?;
        if !metadata.is_file() || metadata.len() != model.size {
            return Err(VerifyError::ModelsMissing);
        }
    }
    Ok(())
}

/// Vérifie et prépare le lancement (bloquant : lit et hache chaque fichier).
/// `run_root` : dossier où créer la copie privée.
pub fn verify(
    companion: Option<&Companion>,
    models_dir: &Path,
    models: &[ModelFile],
    run_root: &Path,
) -> Result<Verified, VerifyError> {
    check(companion, models_dir, models)?;
    let companion = companion.ok_or(VerifyError::CompanionMissing)?;
    std::fs::create_dir_all(run_root).map_err(io)?;
    stage(companion, models_dir, models, run_root)
}

/// Dossier privé neuf.
fn private_dir_path(run_root: &Path) -> PathBuf {
    run_root.join(format!("{RUN_PREFIX}{}", uuid::Uuid::new_v4().simple()))
}

#[cfg(not(windows))]
fn stage(
    companion: &Companion,
    models_dir: &Path,
    models: &[ModelFile],
    run_root: &Path,
) -> Result<Verified, VerifyError> {
    use std::os::fd::AsRawFd;
    use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
    let root = private_dir_path(run_root);
    std::fs::DirBuilder::new()
        .mode(0o700)
        .create(&root)
        .map_err(io)?;
    // Supprimé si la vérification échoue.
    let mut staging = Staging {
        dir: Some(root.clone()),
        handles: Vec::new(),
    };
    for file in &companion.files {
        let target = root.join(&file.name);
        std::fs::copy(companion.dir.join(&file.name), &target).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                VerifyError::CompanionMissing
            } else {
                VerifyError::Io
            }
        })?;
        let mode = if file.name == binary_name() {
            0o700
        } else {
            0o600
        };
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(mode)).map_err(io)?;
        let copy = std::fs::read(&target).map_err(io)?;
        if syntheo_image_hash::image_hash(&copy) != file.sha256 {
            return Err(VerifyError::CompanionAltered);
        }
    }
    let models_root = root.join("models");
    for model in models {
        let target = model.under(&models_root);
        if let Some(parent) = target.parent() {
            std::fs::DirBuilder::new()
                .mode(0o700)
                .recursive(true)
                .create(parent)
                .map_err(io)?;
        }
        // Ouvert, haché depuis le descripteur, hérité par le module.
        // O_NONBLOCK : un FIFO posé entre check() et open() ne bloque pas ; il
        // est refusé ci-dessous (pas un fichier ordinaire).
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(model.under(models_dir))
            .map_err(|error| {
                // O_NOFOLLOW sur un lien : ELOOP, un refus.
                if error.raw_os_error() == Some(libc::ELOOP) {
                    VerifyError::ModelsMissing
                } else {
                    open_error(error)
                }
            })?;
        if !file.metadata().map_err(io)?.is_file() {
            return Err(VerifyError::ModelsMissing);
        }
        if sha256_reader(&mut file).map_err(io)? != model.sha256 {
            return Err(VerifyError::ModelsAltered);
        }
        std::os::unix::fs::symlink(format!("/proc/self/fd/{}", file.as_raw_fd()), &target)
            .map_err(io)?;
        staging.handles.push(file);
    }
    Ok(Verified {
        binary: root.join(binary_name()),
        models: models_root,
        staging,
    })
}

#[cfg(windows)]
mod windows_stage {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use std::os::windows::io::AsRawHandle;
    use std::path::{Path, PathBuf};

    use windows::Win32::Foundation::{HANDLE, HLOCAL, LocalFree};
    use windows::Win32::Security::Authorization::{
        ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
    };
    use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
    use windows::Win32::Storage::FileSystem::{
        CreateDirectoryW, FILE_NAME_NORMALIZED, GetFinalPathNameByHandleW,
    };
    use windows::core::PCWSTR;

    use super::VerifyError;

    const FILE_SHARE_READ: u32 = 0x1;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain([0]).collect()
    }

    /// Dossier neuf dont la DACL protégée ne donne accès qu'au propriétaire
    /// (l'utilisateur) et au système, posée à la création.
    pub fn create_private_dir(path: &Path) -> Result<(), VerifyError> {
        let sddl: Vec<u16> = "D:P(A;OICI;FA;;;OW)(A;OICI;FA;;;SY)"
            .encode_utf16()
            .chain([0])
            .collect();
        let mut descriptor = PSECURITY_DESCRIPTOR::default();
        // SAFETY : chaînes terminées par zéro ; descripteur libéré ci-dessous.
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                PCWSTR(sddl.as_ptr()),
                SDDL_REVISION_1,
                &mut descriptor,
                None,
            )
            .map_err(|_| VerifyError::Io)?;
            let attributes = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: descriptor.0,
                bInheritHandle: false.into(),
            };
            let path = wide(path);
            let created = CreateDirectoryW(PCWSTR(path.as_ptr()), Some(&attributes));
            let _ = LocalFree(Some(HLOCAL(descriptor.0)));
            created.map_err(|_| VerifyError::Io)
        }
    }

    /// Ouvre sans partage en écriture ni en suppression ; refuse un point de
    /// réanalyse.
    pub fn open_locked(path: &Path, directory: bool) -> Result<std::fs::File, VerifyError> {
        let mut flags = FILE_FLAG_OPEN_REPARSE_POINT;
        if directory {
            flags |= FILE_FLAG_BACKUP_SEMANTICS;
        }
        let file = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .custom_flags(flags)
            .open(path)
            .map_err(super::open_error)?;
        let metadata = file.metadata().map_err(|_| VerifyError::Io)?;
        let kind_ok = if directory {
            metadata.is_dir()
        } else {
            metadata.is_file()
        };
        if !kind_ok || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(VerifyError::ModelsMissing);
        }
        Ok(file)
    }

    /// Chemin final de l'objet ouvert.
    pub fn final_path(file: &std::fs::File) -> Result<PathBuf, VerifyError> {
        let handle = HANDLE(file.as_raw_handle());
        let mut buffer = vec![0u16; 1024];
        loop {
            // SAFETY : handle ouvert, tampon de la taille annoncée.
            let len =
                unsafe { GetFinalPathNameByHandleW(handle, &mut buffer, FILE_NAME_NORMALIZED) }
                    as usize;
            if len == 0 {
                return Err(VerifyError::Io);
            }
            if len < buffer.len() {
                buffer.truncate(len);
                return Ok(PathBuf::from(std::ffi::OsString::from_wide(&buffer)));
            }
            buffer.resize(len + 1, 0);
        }
    }

    pub fn same_path(a: &Path, b: &Path) -> bool {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    }
}

#[cfg(windows)]
fn stage(
    companion: &Companion,
    models_dir: &Path,
    models: &[ModelFile],
    run_root: &Path,
) -> Result<Verified, VerifyError> {
    use windows_stage::{create_private_dir, final_path, open_locked, same_path};
    let root = private_dir_path(run_root);
    create_private_dir(&root)?;
    let mut staging = Staging {
        dir: Some(root.clone()),
        handles: Vec::new(),
    };
    for file in &companion.files {
        let target = root.join(&file.name);
        std::fs::copy(companion.dir.join(&file.name), &target).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                VerifyError::CompanionMissing
            } else {
                VerifyError::Io
            }
        })?;
        let mut copy = open_locked(&target, false).map_err(|_| VerifyError::Io)?;
        let mut bytes = Vec::new();
        copy.read_to_end(&mut bytes).map_err(io)?;
        if syntheo_image_hash::image_hash(&bytes) != file.sha256 {
            return Err(VerifyError::CompanionAltered);
        }
        staging.handles.push(copy);
    }
    // Le dossier des modèles et chaque dossier du chemin d'un modèle,
    // verrouillés.
    let base = open_locked(models_dir, true)?;
    let base_final = final_path(&base)?;
    staging.handles.push(base);
    let mut locked_dirs = std::collections::BTreeSet::new();
    for model in models {
        let parts: Vec<&str> = model.path.split('/').collect();
        let mut current = String::new();
        for part in &parts[..parts.len() - 1] {
            current = if current.is_empty() {
                (*part).to_owned()
            } else {
                format!("{current}/{part}")
            };
            if locked_dirs.insert(current.clone()) {
                let dir = current
                    .split('/')
                    .fold(models_dir.to_path_buf(), |p, c| p.join(c));
                staging.handles.push(open_locked(&dir, true)?);
            }
        }
    }
    for model in models {
        let mut file = open_locked(&model.under(models_dir), false)?;
        let expected_path = model.under(&base_final);
        if !same_path(&final_path(&file)?, &expected_path) {
            return Err(VerifyError::UnsafePath);
        }
        if sha256_reader(&mut file).map_err(io)? != model.sha256 {
            return Err(VerifyError::ModelsAltered);
        }
        staging.handles.push(file);
    }
    Ok(Verified {
        binary: root.join(binary_name()),
        // Chemin final vérifié du dossier verrouillé, pas le chemin donné.
        models: base_final,
        staging,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ModelFile;

    fn write(dir: &Path, path: &str, content: &[u8]) {
        let full = dir.join(path);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(full, content).unwrap();
    }

    fn model(path: &str, bytes: &[u8]) -> ModelFile {
        ModelFile {
            path: path.to_owned(),
            size: bytes.len() as u64,
            sha256: Sha256::digest(bytes)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect(),
        }
    }

    /// Compagnon, modèles et dossier de lancement.
    struct Setup {
        install: tempfile::TempDir,
        data: tempfile::TempDir,
        companion: Companion,
        models: Vec<ModelFile>,
    }

    impl Setup {
        fn new() -> Self {
            let install = tempfile::tempdir().unwrap();
            write(install.path(), binary_name(), b"binaire");
            let companion = Companion::hashed_now(install.path(), &[binary_name()]).unwrap();
            let data = tempfile::tempdir().unwrap();
            write(
                &data.path().join("models"),
                "nemotron/encoder.onnx",
                b"modele",
            );
            Self {
                install,
                data,
                companion,
                models: vec![model("nemotron/encoder.onnx", b"modele")],
            }
        }

        fn models_dir(&self) -> PathBuf {
            self.data.path().join("models")
        }

        fn verify(&self) -> Result<Verified, VerifyError> {
            verify(
                Some(&self.companion),
                &self.models_dir(),
                &self.models,
                self.data.path(),
            )
        }
    }

    #[test]
    fn an_intact_install_is_accepted() {
        let setup = Setup::new();
        let verified = setup.verify().unwrap();
        assert!(verified.binary.ends_with(binary_name()));
        let private = verified.binary.parent().unwrap().to_path_buf();
        assert_ne!(private, setup.install.path());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&private).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o700);
            // Modifier l'original après la vérification ne touche pas ce qui
            // sera exécuté.
            write(setup.install.path(), binary_name(), b"binairX");
            assert_eq!(std::fs::read(&verified.binary).unwrap(), b"binaire");
            let link = std::fs::read_link(verified.models.join("nemotron/encoder.onnx")).unwrap();
            assert!(
                link.to_string_lossy().starts_with("/proc/self/fd/"),
                "{link:?}"
            );
        }
        drop(verified);
        assert!(!private.exists(), "copie supprimée");
    }

    #[test]
    fn an_altered_companion_or_model_is_refused() {
        let setup = Setup::new();
        write(setup.install.path(), binary_name(), b"binairX");
        assert_eq!(setup.verify().err(), Some(VerifyError::CompanionAltered));
        let setup = Setup::new();
        write(&setup.models_dir(), "nemotron/encoder.onnx", b"modelx");
        assert_eq!(setup.verify().err(), Some(VerifyError::ModelsAltered));
        write(
            &setup.models_dir(),
            "nemotron/encoder.onnx",
            b"modele_altere",
        );
        assert_eq!(setup.verify().err(), Some(VerifyError::ModelsMissing));
        // Rien laissé derrière : aucune copie privée après un refus.
        let leftovers = std::fs::read_dir(setup.data.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(RUN_PREFIX))
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn missing_pieces_are_refused() {
        let setup = Setup::new();
        assert_eq!(
            verify(None, &setup.models_dir(), &setup.models, setup.data.path()).err(),
            Some(VerifyError::CompanionMissing)
        );
        std::fs::remove_file(setup.models_dir().join("nemotron/encoder.onnx")).unwrap();
        assert_eq!(setup.verify().err(), Some(VerifyError::ModelsMissing));
        let setup = Setup::new();
        std::fs::remove_file(setup.install.path().join(binary_name())).unwrap();
        assert_eq!(setup.verify().err(), Some(VerifyError::CompanionMissing));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_model_is_refused() {
        let setup = Setup::new();
        let elsewhere = tempfile::tempdir().unwrap();
        write(elsewhere.path(), "m", b"modele");
        let path = setup.models_dir().join("nemotron/encoder.onnx");
        std::fs::remove_file(&path).unwrap();
        std::os::unix::fs::symlink(elsewhere.path().join("m"), &path).unwrap();
        assert_eq!(setup.verify().err(), Some(VerifyError::ModelsMissing));
    }

    // Une ouverture refusée (ici, droits retirés) est passagère : jamais un
    // refus définitif.
    #[cfg(unix)]
    #[test]
    fn an_unreadable_model_is_a_transient_error() {
        use std::os::unix::fs::PermissionsExt;
        let setup = Setup::new();
        let path = setup.models_dir().join("nemotron/encoder.onnx");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::File::open(&path).is_ok() {
            return; // root : les droits ne s'appliquent pas.
        }
        assert_eq!(setup.verify().err(), Some(VerifyError::Io));
    }

    #[test]
    fn stale_private_copies_are_removed() {
        let setup = Setup::new();
        let stale = setup.data.path().join(format!("{RUN_PREFIX}ancien"));
        std::fs::create_dir_all(&stale).unwrap();
        remove_stale_copies(setup.data.path());
        assert!(!stale.exists());
        assert!(setup.models_dir().exists());
    }
}
