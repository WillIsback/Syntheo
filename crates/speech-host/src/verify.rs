//! Vérification du module avant chaque lancement : chaque fichier du dossier
//! est listé dans `files.sha256` avec son empreinte SHA-256, et aucun autre
//! fichier n'y est admis (une bibliothèque ajoutée à côté du binaire serait
//! chargée par lui). Le manifeste signé viendra avec l'issue 683 ; ce fichier
//! en sera alors la liste vérifiée.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

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
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::InvalidList => "module file list is missing or invalid",
            Self::UnsafePath => "module file list has an unsafe path",
            Self::Missing => "a module file is missing or not a regular file",
            Self::Altered => "a module file does not match its checksum",
            Self::Unlisted => "the module folder has an unlisted file",
            Self::NoBinary => "the module binary is not listed",
        })
    }
}

/// Module vérifié : chemins à utiliser pour le lancement.
#[derive(Debug, Clone)]
pub struct Verified {
    pub dir: PathBuf,
    pub binary: PathBuf,
    pub models: PathBuf,
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

fn sha256(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
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

/// Vérifie le dossier du module (bloquant : lit et hache chaque fichier).
pub fn verify(dir: &Path) -> Result<Verified, VerifyError> {
    let list =
        std::fs::read_to_string(dir.join(LIST_FILE)).map_err(|_| VerifyError::InvalidList)?;
    let entries = parse_list(&list)?;
    if !entries.contains_key(binary_name()) {
        return Err(VerifyError::NoBinary);
    }
    let mut present = Vec::new();
    walk(dir, dir, &mut present)?;
    for file in &present {
        if file != LIST_FILE && !entries.contains_key(file) {
            return Err(VerifyError::Unlisted);
        }
    }
    for (path, expected) in &entries {
        let full = dir.join(path);
        let metadata = std::fs::symlink_metadata(&full).map_err(|_| VerifyError::Missing)?;
        if !metadata.is_file() {
            return Err(VerifyError::Missing);
        }
        if &sha256(&full).map_err(|_| VerifyError::Missing)? != expected {
            return Err(VerifyError::Altered);
        }
    }
    Ok(Verified {
        dir: dir.to_path_buf(),
        binary: dir.join(binary_name()),
        models: dir.join("models"),
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

    fn module(dir: &Path) {
        write(dir, binary_name(), b"binaire");
        write(dir, "models/nemotron/encoder.onnx", b"modele");
        let list = [binary_name(), "models/nemotron/encoder.onnx"]
            .iter()
            .map(|p| format!("{}  {p}\n", sha256(&dir.join(p)).unwrap()))
            .collect::<String>();
        write(dir, LIST_FILE, list.as_bytes());
    }

    #[test]
    fn an_intact_module_is_accepted() {
        let dir = tempfile::tempdir().unwrap();
        module(dir.path());
        let verified = verify(dir.path()).unwrap();
        assert_eq!(verified.binary, dir.path().join(binary_name()));
    }

    #[test]
    fn an_altered_module_or_model_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        module(dir.path());
        write(dir.path(), "models/nemotron/encoder.onnx", b"modele altere");
        assert_eq!(verify(dir.path()).err(), Some(VerifyError::Altered));
        let dir = tempfile::tempdir().unwrap();
        module(dir.path());
        write(dir.path(), binary_name(), b"autre binaire");
        assert_eq!(verify(dir.path()).err(), Some(VerifyError::Altered));
    }

    #[test]
    fn an_unlisted_file_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        module(dir.path());
        write(dir.path(), "evil.dll", b"x");
        assert_eq!(verify(dir.path()).err(), Some(VerifyError::Unlisted));
    }

    #[test]
    fn a_missing_file_or_unsafe_list_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        module(dir.path());
        std::fs::remove_file(dir.path().join("models/nemotron/encoder.onnx")).unwrap();
        assert_eq!(verify(dir.path()).err(), Some(VerifyError::Missing));
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
        assert_eq!(verify(dir.path()).err(), Some(VerifyError::InvalidList));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        module(dir.path());
        std::os::unix::fs::symlink("/etc/hostname", dir.path().join("lien")).unwrap();
        assert_eq!(verify(dir.path()).err(), Some(VerifyError::Unlisted));
    }
}
