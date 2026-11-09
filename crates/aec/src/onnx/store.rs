//! Emplacement des modèles installés et vérification de leur contenu.

use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::sync::atomic::{AtomicU64, Ordering};

use sha2::{Digest, Sha256};

use super::model::{FILES, ModelFile};

static MODEL_DIR: RwLock<Option<PathBuf>> = RwLock::new(None);
static MODEL_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Indique où chercher les modèles. À rappeler après un téléchargement réussi : la génération
/// change, et une capture ouverte sans annulation d'écho peut alors la réactiver.
pub fn set_model_dir(dir: impl Into<PathBuf>) {
    let dir = dir.into();
    *MODEL_DIR
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(dir);
    MODEL_GENERATION.fetch_add(1, Ordering::AcqRel);
}

/// Change à chaque appel de [`set_model_dir`].
pub fn model_generation() -> u64 {
    MODEL_GENERATION.load(Ordering::Acquire)
}

pub(crate) fn model_dir() -> Option<PathBuf> {
    MODEL_DIR
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

/// Modèles du dépôt, pour les tests, benchmarks et exemples. Le binaire publié ne lit jamais
/// ce chemin de compilation de lui-même.
pub fn source_model_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("data")
        .join("models")
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn matches(file: &ModelFile, bytes: &[u8]) -> bool {
    bytes.len() as u64 == file.size && sha256_hex(bytes) == file.sha256
}

/// Lit un modèle et refuse un fichier absent, tronqué ou altéré.
pub(crate) fn read_verified(dir: &Path, file: &ModelFile) -> Result<Vec<u8>, crate::Error> {
    let path = dir.join(file.name);
    let bytes = std::fs::read(&path)
        .map_err(|error| crate::Error::ModelUnavailable(format!("{}: {error}", path.display())))?;
    if !matches(file, &bytes) {
        return Err(crate::Error::ModelChecksum(file.name));
    }
    Ok(bytes)
}

/// Dit si tous les modèles de la variante compilée sont présents et intacts.
pub fn models_installed(dir: &Path) -> bool {
    FILES.iter().all(|file| read_verified(dir, file).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pinned_hashes_match_the_repository_models() {
        for file in &FILES {
            let bytes = std::fs::read(source_model_dir().join(file.name)).unwrap();
            assert!(matches(file, &bytes), "{} ne correspond plus", file.name);
        }
        assert!(models_installed(&source_model_dir()));
    }

    #[test]
    fn a_missing_or_altered_model_is_refused() {
        let dir = std::env::temp_dir().join(format!("aec-store-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(!models_installed(&dir));

        let file = &FILES[0];
        let mut bytes = std::fs::read(source_model_dir().join(file.name)).unwrap();
        bytes[100] ^= 0xff;
        std::fs::write(dir.join(file.name), &bytes).unwrap();
        assert!(matches!(
            read_verified(&dir, file),
            Err(crate::Error::ModelChecksum(_))
        ));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn urls_are_pinned_to_a_commit() {
        for file in &FILES {
            let url = file.url();
            assert!(url.starts_with("https://raw.githubusercontent.com/WillIsback/"));
            assert!(url.contains(super::super::model::MODEL_SOURCE_COMMIT));
            assert!(url.ends_with(file.name));
        }
    }
}
