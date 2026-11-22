//! Source « Sur ce poste » (issue 684) : le module `syntheo-speech`, installé
//! dans `<données>/modules/speech`, lancé au début d'une écoute, relancé s'il
//! meurt (nouveau jeton, nouveau port), arrêté à la fin. Un réglage géré
//! (`on_device_transcription_enabled` à false) interdit son chargement : il
//! est lu dans `managed_settings.json` une fois, gardé en mémoire, et jamais
//! dans la base, que la webview peut réécrire.

use std::sync::Arc;

use owhisper_client::{OnDeviceError, OnDeviceErrorKind};
use tauri::Manager;
use tokio::sync::OnceCell;

/// Politique gérée chargée au premier usage ; illisible : module refusé.
#[derive(Default)]
pub struct OnDevicePolicy(OnceCell<bool>);

/// Dossier du module installé.
pub fn module_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("modules").join("speech"))
}

/// Fils ONNX Runtime par session : deux flux partagent les cœurs.
pub fn threads_per_session() -> usize {
    std::thread::available_parallelism().map_or(1, |n| (n.get() / 4).max(1))
}

async fn allowed<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    let Some(policy) = app.try_state::<OnDevicePolicy>() else {
        return false;
    };
    *policy
        .0
        .get_or_init(|| async {
            let Some(pool) = crate::audio_retention::db_pool(app) else {
                return false;
            };
            match syntheo_db_app::load_managed_policy(&pool).await {
                Ok(policy) => policy.on_device_transcription_allowed(),
                Err(_) => false,
            }
        })
        .await
}

/// Cible du lancement en cours, après vérification et lancement au besoin.
pub async fn target<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<owhisper_client::OnDeviceTarget, OnDeviceError> {
    let host = app
        .try_state::<Arc<syntheo_speech_host::SpeechHost>>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| OnDeviceError {
            kind: OnDeviceErrorKind::Unavailable,
            message: "on-device transcription is not available".to_owned(),
        })?;
    let allowed = allowed(app).await;
    host.target(allowed)
        .await
        .map_err(|error| error.to_on_device_error())
}

/// Arrête le module s'il tourne.
pub async fn stop<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(host) = app.try_state::<Arc<syntheo_speech_host::SpeechHost>>() {
        host.inner().clone().stop().await;
    }
}
