//! Téléchargement des modèles à la demande (feature `download`).

use std::path::Path;
use std::time::Duration;

use super::model::{FILES, ModelFile};
use super::store::matches;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(180);

/// Installe dans `dir` les modèles qui manquent ou ne correspondent pas à leur SHA-256.
/// Renvoie `true` si au moins un fichier a été téléchargé. Chaque fichier est écrit à côté
/// puis renommé : une coupure laisse au pire un `.part`, jamais un modèle tronqué.
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

    tokio::fs::create_dir_all(dir).await?;
    let client = reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()?;

    for file in missing {
        let bytes = fetch(&client, file).await?;
        if !matches(file, &bytes) {
            return Err(crate::Error::ModelChecksum(file.name));
        }
        let partial = dir.join(format!("{}.part", file.name));
        tokio::fs::write(&partial, &bytes).await?;
        tokio::fs::rename(&partial, dir.join(file.name)).await?;
    }
    Ok(true)
}

/// Lit la réponse sans jamais dépasser la taille épinglée : un serveur qui enverrait plus est
/// coupé avant d'avoir rempli la mémoire.
async fn fetch(client: &reqwest::Client, file: &ModelFile) -> Result<Vec<u8>, crate::Error> {
    let mut response = client.get(file.url()).send().await?.error_for_status()?;
    let mut bytes = Vec::with_capacity(file.size as usize);
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() as u64 + chunk.len() as u64 > file.size {
            return Err(crate::Error::ModelChecksum(file.name));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
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
