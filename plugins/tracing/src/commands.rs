use crate::{Level, TracingPluginExt};

#[tauri::command]
#[specta::specta]
pub async fn do_log<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    level: Level,
    data: Vec<serde_json::Value>,
) -> Result<(), String> {
    app.tracing().do_log(level, data).map_err(|e| e.to_string())
}
