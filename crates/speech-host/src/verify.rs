//! Vérification du module avant chaque lancement : chaque fichier du dossier
//! est listé dans `files.sha256` avec son empreinte SHA-256, et aucun autre
//! fichier n'y est admis (une bibliothèque ajoutée à côté du binaire serait
//! chargée par lui). Avant cette liste, le manifeste signé (`manifest`) est
//! vérifié : `files.sha256` doit lister exactement ses fichiers.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::manifest::{MANIFEST_FILE, SIGNATURE_FILE, verify_manifest};

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
            Self::Manifest(_) => unreachable!(),
        })
    }
}

/// Module vérifié : chemins à utiliser pour le lancement, et garde des objets
/// vérifiés. On exécute exactement ce qui a été haché :
/// - Linux et macOS : une copie privée par lancement (dossier 0700, à côté du
///   module pour profiter d'une copie par référence), hachée depuis la copie
///   et supprimée par `Staging` ;
/// - Windows : les fichiers d'origine, ouverts sans partage en écriture ni en
///   suppression, hachés depuis ces handles, gardés ouverts jusqu'à la mort
///   du processus.
#[derive(Debug)]
pub struct Verified {
    pub dir: PathBuf,
    pub binary: PathBuf,
    pub models: PathBuf,
    pub staging: Staging,
}

/// Garde des objets vérifiés (voir `Verified`).
#[derive(Debug)]
pub enum Staging {
    /// Copie privée, supprimée à la libération.
    Copy(PathBuf),
    /// Handles sans partage en écriture ni en suppression.
    Locked(Vec<std::fs::File>),
}

impl Drop for Staging {
    fn drop(&mut self) {
        if let Self::Copy(dir) = self {
            let _ = std::fs::remove_dir_all(dir);
        }
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
    let list =
        std::fs::read_to_string(dir.join(LIST_FILE)).map_err(|_| VerifyError::InvalidList)?;
    let entries = parse_list(&list)?;
    let sizes =
        verify_manifest(dir, public_key, app_version, &entries).map_err(VerifyError::Manifest)?;
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
    let (root, staging) = stage(dir, &entries)?;
    Ok(Verified {
        binary: root.join(binary_name()),
        models: root.join("models"),
        dir: root,
        staging,
    })
}

/// Copie privée, puis hachage depuis la copie.
#[cfg(not(windows))]
fn stage(
    dir: &Path,
    entries: &BTreeMap<String, String>,
) -> Result<(PathBuf, Staging), VerifyError> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    let name = dir
        .file_name()
        .ok_or(VerifyError::Missing)?
        .to_string_lossy();
    let parent = dir.parent().ok_or(VerifyError::Missing)?;
    let root = parent.join(format!(
        "{name}{RUN_PREFIX}{}",
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::DirBuilder::new()
        .mode(0o700)
        .create(&root)
        .map_err(|_| VerifyError::Missing)?;
    // Supprimée si la vérification échoue.
    let staging = Staging::Copy(root.clone());
    for (path, expected) in entries {
        let target = root.join(path);
        if let Some(parent) = target.parent() {
            std::fs::DirBuilder::new()
                .mode(0o700)
                .recursive(true)
                .create(parent)
                .map_err(|_| VerifyError::Missing)?;
        }
        std::fs::copy(dir.join(path), &target).map_err(|_| VerifyError::Missing)?;
        let mode = if path == binary_name() { 0o700 } else { 0o600 };
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(mode))
            .map_err(|_| VerifyError::Missing)?;
        if &sha256(&target).map_err(|_| VerifyError::Missing)? != expected {
            return Err(VerifyError::Altered);
        }
    }
    Ok((root, staging))
}

/// Handles sans partage en écriture ni en suppression, hachés tels quels.
#[cfg(windows)]
fn stage(
    dir: &Path,
    entries: &BTreeMap<String, String>,
) -> Result<(PathBuf, Staging), VerifyError> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    const FILE_SHARE_READ: u32 = 0x1;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    let mut handles = Vec::with_capacity(entries.len());
    for (path, expected) in entries {
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(dir.join(path))
            .map_err(|_| VerifyError::Missing)?;
        let metadata = file.metadata().map_err(|_| VerifyError::Missing)?;
        if !metadata.is_file() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(VerifyError::Missing);
        }
        if &sha256_reader(&mut file).map_err(|_| VerifyError::Missing)? != expected {
            return Err(VerifyError::Altered);
        }
        handles.push(file);
    }
    Ok((dir.to_path_buf(), Staging::Locked(handles)))
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
            assert_ne!(verified.dir, dir.path());
            let mode = std::fs::metadata(&verified.dir)
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o700);
            // Modifier l'original après la vérification ne touche pas ce qui
            // sera exécuté.
            write(dir.path(), binary_name(), b"binairX");
            assert_eq!(std::fs::read(&verified.binary).unwrap(), b"binaire");
            let copy = verified.dir.clone();
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
