//! Vérification du module avant chaque lancement : chaque fichier du dossier
//! est listé dans `files.sha256` avec son empreinte SHA-256, et aucun autre
//! fichier n'y est admis (une bibliothèque ajoutée à côté du binaire serait
//! chargée par lui). Avant cette liste, le manifeste signé (`manifest`) est
//! vérifié : `files.sha256` doit lister exactement ses fichiers.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::manifest::{MANIFEST_FILE, SIGNATURE_FILE};

/// Liste des fichiers : lignes `<sha256>  <chemin relatif>`, séparateur `/`.
pub const LIST_FILE: &str = "files.sha256";
/// Au plus ce nombre de fichiers.
const MAX_FILES: usize = 256;

/// Nom du binaire du module.
pub fn binary_name() -> &'static str {
    if cfg!(windows) {
        "syntheo-speech.exe"
    } else {
        "syntheo-speech"
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum VerifyError {
    /// Pas de liste, ou liste illisible ou mal formée.
    InvalidList,
    /// Chemin absolu, remontée de dossier, ou entrée en double.
    UnsafePath,
    /// Fichier listé absent, ou pas un fichier ordinaire (lien, dossier…).
    Missing,
    /// Empreinte différente : module altéré.
    Altered,
    /// Fichier présent mais non listé.
    Unlisted,
    /// Binaire non listé.
    NoBinary,
    /// Taille différente de celle du manifeste.
    WrongSize,
    /// Manifeste signé absent, invalide ou incompatible.
    Manifest(crate::manifest::ManifestError),
    /// Erreur d'entrée-sortie (disque plein…) : passagère, pas un refus.
    Io,
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Self::Manifest(error) = self {
            return error.fmt(f);
        }
        f.write_str(match self {
            Self::InvalidList => "module file list is missing or invalid",
            Self::UnsafePath => "module file list has an unsafe path",
            Self::Missing => "a module file is missing or not a regular file",
            Self::Altered => "a module file does not match its checksum",
            Self::Unlisted => "the module folder has an unlisted file",
            Self::NoBinary => "the module binary is not listed",
            Self::WrongSize => "a module file does not match its size",
            Self::Io => "the module could not be prepared (input/output error)",
            Self::Manifest(_) => unreachable!(),
        })
    }
}

/// Module vérifié : chemins à utiliser pour le lancement, et garde des objets
/// vérifiés. On exécute exactement ce qui a été haché :
/// - le binaire et ses bibliothèques sont copiés dans un dossier privé neuf
///   par lancement (Linux : 0700 ; Windows : ACL limitée au propriétaire,
///   posée à la création), hachés depuis la copie, puis exécutés depuis elle ;
/// - les modèles ne sont pas copiés. Linux : chaque modèle est ouvert, haché
///   depuis son descripteur, et le module en hérite ; le dossier privé
///   l'expose par un lien `/proc/self/fd/N`. Windows : chaque modèle et
///   chaque dossier de son chemin sont ouverts sans partage en écriture ni en
///   suppression, points de réanalyse refusés, chemin final vérifié.
///
/// Le tout vit aussi longtemps que le processus (`Staging`).
#[derive(Debug)]
pub struct Verified {
    pub binary: PathBuf,
    pub models: PathBuf,
    pub staging: Staging,
}

/// Garde des objets vérifiés (voir `Verified`) : le dossier privé, supprimé
/// à la libération, et les fichiers ouverts.
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

fn is_model(path: &str) -> bool {
    path.starts_with("models/")
}

fn io(_: std::io::Error) -> VerifyError {
    VerifyError::Io
}

/// Ouverture d'un fichier listé : absent → refus ; toute autre erreur
/// (descripteurs épuisés, E/S, accès, violation de partage) → passagère.
fn open_error(error: std::io::Error) -> VerifyError {
    if error.kind() == std::io::ErrorKind::NotFound {
        VerifyError::Missing
    } else {
        VerifyError::Io
    }
}

/// Préfixe des copies privées, à côté du dossier du module.
const RUN_PREFIX: &str = ".speech-run-";

/// Supprime les copies privées laissées par un arrêt brutal.
pub fn remove_stale_copies(dir: &Path) {
    let (Some(parent), Some(name)) = (dir.parent(), dir.file_name()) else {
        return;
    };
    let prefix = format!("{}{RUN_PREFIX}", name.to_string_lossy());
    let Ok(entries) = std::fs::read_dir(parent) else {
        return;
    };
    for entry in entries.flatten() {
        let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
        if is_dir && entry.file_name().to_string_lossy().starts_with(&prefix) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

fn parse_list(text: &str) -> Result<BTreeMap<String, String>, VerifyError> {
    let mut entries = BTreeMap::new();
    for line in text.lines().filter(|l| !l.trim().is_empty()) {
        let (hash, path) = line.split_once("  ").ok_or(VerifyError::InvalidList)?;
        if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(VerifyError::InvalidList);
        }
        let relative = Path::new(path);
        let safe = !path.is_empty()
            && !path.contains('\\')
            && relative
                .components()
                .all(|c| matches!(c, Component::Normal(_)));
        if !safe
            || entries
                .insert(path.to_owned(), hash.to_ascii_lowercase())
                .is_some()
        {
            return Err(VerifyError::UnsafePath);
        }
        if entries.len() > MAX_FILES {
            return Err(VerifyError::InvalidList);
        }
    }
    Ok(entries)
}

#[cfg(any(not(windows), test))]
fn sha256(path: &Path) -> std::io::Result<String> {
    sha256_reader(&mut std::fs::File::open(path)?)
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

/// Tous les fichiers ordinaires du dossier, en chemins relatifs `/` ; un lien
/// ou un fichier spécial est une erreur.
fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) -> Result<(), VerifyError> {
    for entry in std::fs::read_dir(dir).map_err(|_| VerifyError::Missing)? {
        let entry = entry.map_err(|_| VerifyError::Missing)?;
        let kind = entry.file_type().map_err(|_| VerifyError::Missing)?;
        let path = entry.path();
        if kind.is_dir() {
            walk(&path, base, out)?;
        } else if kind.is_file() {
            let relative = path
                .strip_prefix(base)
                .map_err(|_| VerifyError::UnsafePath)?;
            let parts: Vec<String> = relative
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect();
            out.push(parts.join("/"));
        } else {
            // Lien symbolique ou fichier spécial : refusé.
            return Err(VerifyError::Unlisted);
        }
        if out.len() > MAX_FILES + 1 {
            return Err(VerifyError::Unlisted);
        }
    }
    Ok(())
}

/// Fichiers admis hors liste : la liste, le manifeste et sa signature.
fn is_meta(file: &str) -> bool {
    [LIST_FILE, MANIFEST_FILE, SIGNATURE_FILE].contains(&file)
}

/// Vérifie le dossier du module (bloquant : lit et hache chaque fichier) :
/// manifeste signé par `public_key`, compatible avec `app_version`, puis
/// liste fermée des fichiers, tailles et empreintes.
pub fn verify(
    dir: &Path,
    public_key: Option<&str>,
    app_version: &str,
) -> Result<Verified, VerifyError> {
    let entries = check(dir, public_key, app_version)?;
    stage(dir, &entries)
}

/// Contrôles sans hachage : manifeste signé, liste fermée, fichiers
/// ordinaires et tailles. Rend la liste (chemin → empreinte).
pub fn check(
    dir: &Path,
    public_key: Option<&str>,
    app_version: &str,
) -> Result<BTreeMap<String, String>, VerifyError> {
    check_with_floor(
        dir,
        public_key,
        app_version,
        crate::manifest::floor_path(dir).as_deref(),
    )
}

/// `check` avec le plancher anti-retour du module installé (installation).
pub fn check_with_floor(
    dir: &Path,
    public_key: Option<&str>,
    app_version: &str,
    floor: Option<&Path>,
) -> Result<BTreeMap<String, String>, VerifyError> {
    let list =
        std::fs::read_to_string(dir.join(LIST_FILE)).map_err(|_| VerifyError::InvalidList)?;
    let entries = parse_list(&list)?;
    let sizes = crate::manifest::verify_manifest_at(
        dir,
        public_key,
        app_version,
        crate::manifest::MIN_MODULE_VERSION,
        floor,
        &entries,
    )
    .map_err(VerifyError::Manifest)?;
    if !entries.contains_key(binary_name()) {
        return Err(VerifyError::NoBinary);
    }
    let mut present = Vec::new();
    walk(dir, dir, &mut present)?;
    for file in &present {
        if !is_meta(file) && !entries.contains_key(file) {
            return Err(VerifyError::Unlisted);
        }
    }
    for path in entries.keys() {
        let metadata =
            std::fs::symlink_metadata(dir.join(path)).map_err(|_| VerifyError::Missing)?;
        if !metadata.is_file() {
            return Err(VerifyError::Missing);
        }
        if sizes.get(path) != Some(&metadata.len()) {
            return Err(VerifyError::WrongSize);
        }
    }
    Ok(entries)
}

/// Hache les fichiers listés en place (installation : le dossier haché est
/// une copie privée de l'application, pas encore utilisée).
pub fn hash_in_place(dir: &Path, entries: &BTreeMap<String, String>) -> Result<(), VerifyError> {
    for (path, expected) in entries {
        let mut file = std::fs::File::open(dir.join(path)).map_err(|_| VerifyError::Missing)?;
        if &sha256_reader(&mut file).map_err(io)? != expected {
            return Err(VerifyError::Altered);
        }
    }
    Ok(())
}

/// Dossier privé neuf, à côté du module.
fn private_dir_path(dir: &Path) -> Result<PathBuf, VerifyError> {
    let name = dir
        .file_name()
        .ok_or(VerifyError::Missing)?
        .to_string_lossy();
    let parent = dir.parent().ok_or(VerifyError::Missing)?;
    Ok(parent.join(format!(
        "{name}{RUN_PREFIX}{}",
        uuid::Uuid::new_v4().simple()
    )))
}

#[cfg(not(windows))]
fn stage(dir: &Path, entries: &BTreeMap<String, String>) -> Result<Verified, VerifyError> {
    use std::os::fd::AsRawFd;
    use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
    let root = private_dir_path(dir)?;
    std::fs::DirBuilder::new()
        .mode(0o700)
        .create(&root)
        .map_err(io)?;
    // Supprimé si la vérification échoue.
    let mut staging = Staging {
        dir: Some(root.clone()),
        handles: Vec::new(),
    };
    for (path, expected) in entries {
        let target = root.join(path);
        if let Some(parent) = target.parent() {
            std::fs::DirBuilder::new()
                .mode(0o700)
                .recursive(true)
                .create(parent)
                .map_err(io)?;
        }
        if is_model(path) {
            // Ouvert, haché depuis le descripteur, hérité par le module.
            // O_NONBLOCK : un FIFO posé entre walk() et open() ne bloque pas ;
            // il est refusé ci-dessous (pas un fichier ordinaire).
            let mut file = std::fs::OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
                .open(dir.join(path))
                .map_err(|error| {
                    // O_NOFOLLOW sur un lien : ELOOP, un refus.
                    if error.raw_os_error() == Some(libc::ELOOP) {
                        VerifyError::Missing
                    } else {
                        open_error(error)
                    }
                })?;
            if !file.metadata().map_err(io)?.is_file() {
                return Err(VerifyError::Missing);
            }
            if &sha256_reader(&mut file).map_err(io)? != expected {
                return Err(VerifyError::Altered);
            }
            std::os::unix::fs::symlink(format!("/proc/self/fd/{}", file.as_raw_fd()), &target)
                .map_err(io)?;
            staging.handles.push(file);
        } else {
            std::fs::copy(dir.join(path), &target).map_err(io)?;
            let mode = if path == binary_name() { 0o700 } else { 0o600 };
            std::fs::set_permissions(&target, std::fs::Permissions::from_mode(mode)).map_err(io)?;
            if &sha256(&target).map_err(io)? != expected {
                return Err(VerifyError::Altered);
            }
        }
    }
    Ok(Verified {
        binary: root.join(binary_name()),
        models: root.join("models"),
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
            return Err(VerifyError::Missing);
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
fn stage(dir: &Path, entries: &BTreeMap<String, String>) -> Result<Verified, VerifyError> {
    use windows_stage::{create_private_dir, final_path, open_locked, same_path};
    let root = private_dir_path(dir)?;
    create_private_dir(&root)?;
    let mut staging = Staging {
        dir: Some(root.clone()),
        handles: Vec::new(),
    };
    // Le dossier du module et chaque dossier du chemin d'un modèle, verrouillés.
    let base = open_locked(dir, true)?;
    let base_final = final_path(&base)?;
    staging.handles.push(base);
    let mut locked_dirs = std::collections::BTreeSet::new();
    for path in entries.keys().filter(|p| is_model(p)) {
        let mut current = String::new();
        for part in path
            .split('/')
            .collect::<Vec<_>>()
            .iter()
            .rev()
            .skip(1)
            .rev()
        {
            current = if current.is_empty() {
                (*part).to_owned()
            } else {
                format!("{current}/{part}")
            };
            if locked_dirs.insert(current.clone()) {
                staging
                    .handles
                    .push(open_locked(&dir.join(&current), true)?);
            }
        }
    }
    for (path, expected) in entries {
        if is_model(path) {
            let mut file = open_locked(&dir.join(path), false)?;
            let expected_path = base_final.join(path.replace('/', "\\"));
            if !same_path(&final_path(&file)?, &expected_path) {
                return Err(VerifyError::UnsafePath);
            }
            if &sha256_reader(&mut file).map_err(io)? != expected {
                return Err(VerifyError::Altered);
            }
            staging.handles.push(file);
        } else {
            let target = root.join(path.replace('/', "\\"));
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(io)?;
            }
            std::fs::copy(dir.join(path), &target).map_err(io)?;
            let mut file = open_locked(&target, false)?;
            if &sha256_reader(&mut file).map_err(io)? != expected {
                return Err(VerifyError::Altered);
            }
            staging.handles.push(file);
        }
    }
    Ok(Verified {
        binary: root.join(binary_name()),
        // Chemin final vérifié du dossier verrouillé, pas le chemin donné.
        models: base_final.join("models"),
        staging,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, path: &str, content: &[u8]) {
        let full = dir.join(path);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(full, content).unwrap();
    }

    use crate::test_signing::{TestKey, current_manifest};

    /// Module complet et signé ; rend la clé publique.
    fn module(dir: &Path) -> String {
        write(dir, binary_name(), b"binaire");
        write(dir, "models/nemotron/encoder.onnx", b"modele");
        let key = TestKey::new();
        key.sign_module(
            dir,
            &current_manifest(
                dir,
                &[binary_name()],
                &["models/nemotron/encoder.onnx"],
                "0.8.0",
            ),
        );
        key.public()
    }

    fn check(dir: &Path, key: &str) -> Result<Verified, VerifyError> {
        verify(dir, Some(key), "0.8.0")
    }

    #[test]
    fn an_intact_module_is_accepted() {
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        let verified = check(dir.path(), &key).unwrap();
        assert!(verified.binary.ends_with(binary_name()));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            // Copie privée : ni le dossier du module, ni lisible par d'autres.
            let private = verified.binary.parent().unwrap().to_path_buf();
            assert_ne!(private, dir.path());
            let mode = std::fs::metadata(&private).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o700);
            // Modifier l'original après la vérification ne touche pas ce qui
            // sera exécuté.
            write(dir.path(), binary_name(), b"binairX");
            assert_eq!(std::fs::read(&verified.binary).unwrap(), b"binaire");
            // Le modèle est exposé par un lien vers le descripteur vérifié.
            let link = std::fs::read_link(verified.models.join("nemotron/encoder.onnx")).unwrap();
            assert!(
                link.to_string_lossy().starts_with("/proc/self/fd/"),
                "{link:?}"
            );
            let copy = private.clone();
            drop(verified);
            assert!(!copy.exists(), "copie supprimée");
        }
    }

    #[test]
    fn an_altered_module_or_model_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        write(dir.path(), "models/nemotron/encoder.onnx", b"modele_altere");
        assert_eq!(check(dir.path(), &key).err(), Some(VerifyError::WrongSize));
        write(dir.path(), "models/nemotron/encoder.onnx", b"modelx");
        assert_eq!(check(dir.path(), &key).err(), Some(VerifyError::Altered));
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        write(dir.path(), binary_name(), b"binairX");
        assert_eq!(check(dir.path(), &key).err(), Some(VerifyError::Altered));
    }

    #[test]
    fn an_unlisted_file_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        write(dir.path(), "evil.dll", b"x");
        assert_eq!(check(dir.path(), &key).err(), Some(VerifyError::Unlisted));
    }

    #[test]
    fn a_missing_file_or_unsafe_list_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        std::fs::remove_file(dir.path().join("models/nemotron/encoder.onnx")).unwrap();
        assert_eq!(check(dir.path(), &key).err(), Some(VerifyError::Missing));
        let hash = "a".repeat(64);
        for bad in [
            format!("{hash}  ../evil"),
            format!("{hash}  /etc/passwd"),
            format!("{hash}  a\\b"),
            "court  x".to_owned(),
        ] {
            assert!(parse_list(&bad).is_err(), "{bad}");
        }
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(check(dir.path(), "x").err(), Some(VerifyError::InvalidList));
    }

    // Une ouverture refusée (ici, droits retirés) est passagère : jamais un
    // module refusé.
    #[cfg(unix)]
    #[test]
    fn an_unreadable_model_is_a_transient_error() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        let model = dir.path().join("models/nemotron/encoder.onnx");
        std::fs::set_permissions(&model, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::File::open(&model).is_ok() {
            return; // root : les droits ne s'appliquent pas.
        }
        assert_eq!(check(dir.path(), &key).err(), Some(VerifyError::Io));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        std::os::unix::fs::symlink("/etc/hostname", dir.path().join("lien")).unwrap();
        assert_eq!(check(dir.path(), &key).err(), Some(VerifyError::Unlisted));
    }

    #[test]
    fn the_manifest_is_checked_before_the_list() {
        use crate::manifest::ManifestError;
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        // Autre clé : refus, même si tout le reste est intact.
        let other = TestKey::new().public();
        assert_eq!(
            check(dir.path(), &other).err(),
            Some(VerifyError::Manifest(ManifestError::BadSignature))
        );
        // Application trop ancienne.
        assert_eq!(
            verify(dir.path(), Some(&key), "0.7.9").err(),
            Some(VerifyError::Manifest(ManifestError::AppTooOld))
        );
        // Manifeste modifié après signature.
        let manifest = dir.path().join(MANIFEST_FILE);
        let text = std::fs::read_to_string(&manifest).unwrap();
        std::fs::write(&manifest, text.replace("0.8.0", "0.1.0")).unwrap();
        assert_eq!(
            check(dir.path(), &key).err(),
            Some(VerifyError::Manifest(ManifestError::BadSignature))
        );
        // Liste qui ne correspond pas au manifeste (fichier ajouté aux deux
        // côtés de la liste, mais pas au manifeste signé).
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        write(dir.path(), "extra.dll", b"x");
        let mut list = std::fs::read_to_string(dir.path().join(LIST_FILE)).unwrap();
        list.push_str(&format!(
            "{}  extra.dll\n",
            sha256(&dir.path().join("extra.dll")).unwrap()
        ));
        write(dir.path(), LIST_FILE, list.as_bytes());
        assert_eq!(
            check(dir.path(), &key).err(),
            Some(VerifyError::Manifest(ManifestError::ListMismatch))
        );
        // Sans signature : refus.
        let dir = tempfile::tempdir().unwrap();
        let key = module(dir.path());
        std::fs::remove_file(dir.path().join(SIGNATURE_FILE)).unwrap();
        assert_eq!(
            check(dir.path(), &key).err(),
            Some(VerifyError::Manifest(ManifestError::Missing))
        );
    }

    #[test]
    fn a_manifest_for_another_target_is_refused() {
        use crate::manifest::ManifestError;
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), binary_name(), b"binaire");
        let key = TestKey::new();
        let manifest = current_manifest(dir.path(), &[binary_name()], &[], "0.8.0")
            .replace(crate::manifest::current_target(), "aarch64-apple-darwin");
        key.sign_module(dir.path(), &manifest);
        assert_eq!(
            check(dir.path(), &key.public()).err(),
            Some(VerifyError::Manifest(ManifestError::Incompatible))
        );
    }
}
