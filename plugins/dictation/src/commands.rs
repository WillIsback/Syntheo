use std::sync::Arc;

use tauri::Manager;

use crate::recorder::{RecordedAudio, Recorder};

#[tauri::command]
#[specta::specta]
pub(crate) async fn capture_target() -> Result<String, String> {
    crate::insertion::capture().await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn insert_text(target: String, text: String) -> Result<(), String> {
    if text.contains('\0') {
        return Err("Dictation text contains an unsupported NUL character".into());
    }
    if text.is_empty() || text.len() > 100_000 {
        return Err("Dictation text is empty or too long".into());
    }
    crate::insertion::insert(target, text).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn start_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    microphone_device: Option<String>,
    owner: String,
) -> Result<(), String> {
    let audio = app
        .state::<Arc<dyn syntheo_audio::AudioProvider>>()
        .inner()
        .clone();
    app.state::<Recorder>()
        .start(audio, microphone_device, owner)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn stop_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    owner: String,
) -> Result<RecordedAudio, String> {
    app.state::<Recorder>()
        .stop(&owner)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn cancel_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    owner: String,
) -> Result<(), String> {
    app.state::<Recorder>()
        .cancel(&owner)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn start_system_recording<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    microphone_device: Option<String>,
    owner: String,
    preview: Option<crate::preview::PreviewConfig>,
    updates: tauri::ipc::Channel<crate::preview::RecordingUpdate>,
) -> Result<(), String> {
    let audio = app
        .state::<Arc<dyn syntheo_audio::AudioProvider>>()
        .inner()
        .clone();
    app.state::<Recorder>()
        .start_with_feedback(audio, microphone_device, owner, preview, Some(updates))
        .map_err(|error| error.to_string())
}
