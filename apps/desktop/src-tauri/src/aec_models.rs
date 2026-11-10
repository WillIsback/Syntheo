//! Modèles d'annulation d'écho (DTLN) téléchargés à la demande (issue 429).
//!
//! Ils ne sont plus embarqués dans le binaire. Au démarrage, l'application indique où ils se
//! trouvent, puis les télécharge en tâche de fond s'ils manquent. Tant qu'ils manquent
//! (premier lancement hors ligne), la capture fonctionne avec le micro brut : l'annulation
//! d'écho reste désactivée, et le journal le dit (`aec_model_unavailable`). Elle se réactive
//! d'elle-même, même en cours de capture, dès que le téléchargement aboutit.
//!
//! L'état du téléchargement est exposé à l'interface (issue 509) : elle prévient quand
//! l'annulation d'écho est inactive faute de modèles et propose de réessayer tout de suite.

use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::Manager;
use tokio::sync::Notify;

/// Délais entre deux essais : rapides d'abord (réseau qui revient), puis toutes les heures.
const RETRY_DELAYS_S: [u64; 4] = [60, 300, 900, 3_600];

/// Où en sont les modèles. `Failed` : le dernier téléchargement a échoué (hors ligne, proxy),
/// l'annulation d'écho est inactive et un nouvel essai est programmé.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum AecModelState {
    Downloading,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AecModelStatus {
    pub state: AecModelState,
}

static STATE: Mutex<AecModelState> = Mutex::new(AecModelState::Downloading);
static RETRY_NOW: LazyLock<Notify> = LazyLock::new(Notify::new);

fn set_state(state: AecModelState) {
    *STATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = state;
}

pub fn status() -> AecModelStatus {
    AecModelStatus {
        state: *STATE
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()),
    }
}

/// Avance l'essai suivant quand le dernier a échoué. Sans effet si les modèles sont prêts ou
/// en cours de téléchargement.
pub fn retry_now() -> AecModelStatus {
    let mut state = STATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if *state == AecModelState::Failed {
        *state = AecModelState::Downloading;
        RETRY_NOW.notify_one();
    }
    AecModelStatus { state: *state }
}

pub fn model_dir(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join("models").join("aec")
}

pub fn install<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let dir = match app.path().app_data_dir() {
        Ok(app_data_dir) => model_dir(app_data_dir),
        Err(error) => {
            tracing::warn!(%error, "aec_model_dir_unavailable");
            set_state(AecModelState::Failed);
            return;
        }
    };
    syntheo_aec::set_model_dir(&dir);
    tauri::async_runtime::spawn(download_with_retry(dir));
}

async fn download_with_retry(dir: PathBuf) {
    let mut attempt = 0_usize;
    loop {
        set_state(AecModelState::Downloading);
        match syntheo_aec::ensure_models(&dir).await {
            Ok(false) => {
                set_state(AecModelState::Ready);
                return;
            }
            Ok(true) => {
                tracing::info!("aec_models_downloaded");
                // Nouvelle génération : une capture ouverte sans modèle les prend aussitôt.
                syntheo_aec::set_model_dir(&dir);
                set_state(AecModelState::Ready);
                return;
            }
            Err(error) => {
                let delay = RETRY_DELAYS_S[attempt.min(RETRY_DELAYS_S.len() - 1)];
                tracing::warn!(
                    %error,
                    retry_in_s = delay,
                    "aec_models_download_failed: echo cancellation stays disabled"
                );
                set_state(AecModelState::Failed);
                // « Réessayer » dans l'interface coupe l'attente.
                let _ =
                    tokio::time::timeout(Duration::from_secs(delay), RETRY_NOW.notified()).await;
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

    #[test]
    fn retry_only_restarts_a_failed_download() {
        set_state(AecModelState::Ready);
        assert_eq!(retry_now().state, AecModelState::Ready);

        set_state(AecModelState::Failed);
        assert_eq!(status().state, AecModelState::Failed);
        assert_eq!(retry_now().state, AecModelState::Downloading);
        assert_eq!(status().state, AecModelState::Downloading);
    }

    #[test]
    fn status_serializes_for_the_frontend() {
        let json = serde_json::to_string(&AecModelStatus {
            state: AecModelState::Failed,
        })
        .unwrap();
        assert_eq!(json, r#"{"state":"failed"}"#);
    }
}
