//! Sonde de la transcription sur le poste (issue 682) : caractéristiques
//! statiques et micro-banc de quelques secondes, sans rien télécharger. Le
//! moteur est un paramètre : la décision entre A et B tombe après le banc de
//! l'issue 680.

use tauri::Manager;

use crate::{CaptureState, ListenerPluginExt};

/// Durée du micro-banc : 3 à 5 s, assez pour un débit stable.
const BENCH: std::time::Duration = std::time::Duration::from_secs(4);

/// Sonde le poste pour `engine`. Refusée pendant une écoute ou une
/// finalisation : le micro-banc occupe tous les cœurs et ralentirait la
/// transcription en cours.
#[tauri::command]
#[specta::specta]
pub async fn probe_local_transcription<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    engine: syntheo_speech_probe::Engine,
) -> Result<syntheo_speech_probe::Probe, String> {
    if app.listener().get_capture_state().await != CaptureState::Inactive {
        return Err("capture in progress".to_owned());
    }
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        syntheo_speech_probe::predict::probe(engine, &data_dir, BENCH)
    })
    .await
    .map_err(|_| "probe failed".to_owned())
}
