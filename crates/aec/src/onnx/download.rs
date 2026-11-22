//! Téléchargement des modèles à la demande (feature `download`).

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use syntheo_pinned_fetch::{FetchError, Fetcher, Pinned};

use super::model::{FILES, ModelFile};
use super::store::matches;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Délai maximal sans recevoir d'octet.
const READ_TIMEOUT: Duration = Duration::from_secs(60);

/// Installe dans `dir` les modèles qui manquent ou ne correspondent pas à leur SHA-256.
/// Renvoie `true` si au moins un fichier a été téléchargé. Chaque fichier est écrit à côté
/// puis renommé (`syntheo-pinned-fetch`) : une coupure laisse au pire un `.part`, repris au
/// prochain essai, jamais un modèle tronqué.
pub async fn ensure_models(dir: &Path) -> Result<bool, crate::Error> {
    let mut missing: Vec<&ModelFile> = Vec::new();
    for file in &FILES {
        let installed = tokio::fs::read(dir.join(file.name))
            .await
            .is_ok_and(|bytes| matches(file, &bytes));
        if !installed {
            missing.push(file);
        }
    }
    if missing.is_empty() {
        return Ok(false);
    }

    let fetcher = Fetcher::new(CONNECT_TIMEOUT, READ_TIMEOUT).map_err(|e| fetch_error(e, ""))?;
    let never = AtomicBool::new(false);
    for file in missing {
        let pinned = Pinned {
            size: file.size,
            sha256: file.sha256,
        };
        fetcher
            .fetch(
                &file.url(),
                &dir.join(file.name),
                pinned,
                &never,
                &mut |_| {},
            )
            .await
            .map_err(|e| fetch_error(e, file.name))?;
    }
    Ok(true)
}

fn fetch_error(error: FetchError, name: &'static str) -> crate::Error {
    match error {
        FetchError::Http(error) => crate::Error::Download(error),
        FetchError::Io(error) => crate::Error::Io(error),
        FetchError::Mismatch | FetchError::Insecure | FetchError::Cancelled => {
            crate::Error::ModelChecksum(name)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Réseau requis : `cargo test -p aec --features download -- --ignored ensure_models`.
    #[tokio::test]
    #[ignore = "télécharge les modèles depuis GitHub"]
    async fn ensure_models_downloads_then_reuses_the_pinned_files() {
        let dir = std::env::temp_dir().join(format!("aec-download-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        assert!(ensure_models(&dir).await.unwrap());
        assert!(crate::models_installed(&dir));
        assert!(crate::AEC::new_from_dir(&dir).is_ok());
        assert!(!ensure_models(&dir).await.unwrap());

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
