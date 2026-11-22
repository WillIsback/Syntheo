//! Source « Sur ce poste » (issue 684) : le module `syntheo-speech`, installé
//! dans `<données>/modules/speech`, lancé au début d'une écoute, relancé s'il
//! meurt (nouveau jeton, nouveau port), arrêté à la fin. Un réglage géré
//! (`on_device_transcription_enabled` à false) interdit son chargement.

use std::sync::Arc;

use tauri::Manager;

/// Clé du réglage géré qui interdit le module.
pub const ENABLED_SETTING: &str = "on_device_transcription_enabled";

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

/// Le réglage géré autorise le module ; base illisible : refusé.
async fn allowed<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    let Some(pool) = crate::audio_retention::db_pool(app) else {
        return false;
    };
    match syntheo_db_app::get_app_setting_json(&pool, ENABLED_SETTING).await {
        Ok(value) => value.as_deref().map(str::trim) != Some("false"),
        Err(_) => false,
    }
}

/// Cible du lancement en cours, après vérification et lancement au besoin.
pub async fn target<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<owhisper_client::OnDeviceTarget, String> {
    let host = app
        .try_state::<Arc<syntheo_speech_host::SpeechHost>>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "on-device transcription is not available".to_owned())?;
    let allowed = allowed(app).await;
    host.target(allowed)
        .await
        .map_err(|error| error.to_string())
}

/// Arrête le module s'il tourne.
pub async fn stop<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(host) = app.try_state::<Arc<syntheo_speech_host::SpeechHost>>() {
        host.inner().clone().stop().await;
    }
}
