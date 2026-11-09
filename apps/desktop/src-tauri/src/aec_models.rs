//! Modèles d'annulation d'écho (DTLN) téléchargés à la demande (issue 429).
//!
//! Ils ne sont plus embarqués dans le binaire. Au démarrage, l'application indique où ils se
//! trouvent, puis les télécharge en tâche de fond s'ils manquent. Tant qu'ils manquent
//! (premier lancement hors ligne), la capture fonctionne avec le micro brut : l'annulation
//! d'écho reste désactivée, et le journal le dit (`aec_model_unavailable`). Elle se réactive
//! d'elle-même, même en cours de capture, dès que le téléchargement aboutit.

use std::path::PathBuf;
use std::time::Duration;

use tauri::Manager;

/// Délais entre deux essais : rapides d'abord (réseau qui revient), puis toutes les heures.
const RETRY_DELAYS_S: [u64; 4] = [60, 300, 900, 3_600];

pub fn model_dir(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join("models").join("aec")
}

pub fn install<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let dir = match app.path().app_data_dir() {
        Ok(app_data_dir) => model_dir(app_data_dir),
        Err(error) => {
            tracing::warn!(%error, "aec_model_dir_unavailable");
            return;
        }
    };
    syntheo_aec::set_model_dir(&dir);
    tauri::async_runtime::spawn(download_with_retry(dir));
}

async fn download_with_retry(dir: PathBuf) {
    let mut attempt = 0_usize;
    loop {
        match syntheo_aec::ensure_models(&dir).await {
            Ok(false) => return,
            Ok(true) => {
                tracing::info!("aec_models_downloaded");
                // Nouvelle génération : une capture ouverte sans modèle les prend aussitôt.
                syntheo_aec::set_model_dir(&dir);
                return;
            }
            Err(error) => {
                let delay = RETRY_DELAYS_S[attempt.min(RETRY_DELAYS_S.len() - 1)];
                tracing::warn!(
                    %error,
                    retry_in_s = delay,
                    "aec_models_download_failed: echo cancellation stays disabled"
                );
                tokio::time::sleep(Duration::from_secs(delay)).await;
                attempt += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn models_live_under_the_app_data_dir() {
        assert_eq!(
            model_dir(PathBuf::from("/data/app")),
            PathBuf::from("/data/app/models/aec")
        );
    }
}
