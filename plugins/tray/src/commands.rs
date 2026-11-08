use crate::{
    TrayPluginExt,
    schedule::{TrayScheduleEvent, TrayScheduleLabels},
};

#[tauri::command]
#[specta::specta]
pub async fn set_tray_icon_visible(
    app: tauri::AppHandle<tauri::Wry>,
    visible: bool,
) -> Result<(), String> {
    app.tray().set_visible(visible).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_tray_schedule(
    app: tauri::AppHandle<tauri::Wry>,
    events: Vec<TrayScheduleEvent>,
    labels: TrayScheduleLabels,
) -> Result<(), String> {
    app.tray()
        .set_schedule(events, labels)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_tray_recording_title(
    app: tauri::AppHandle<tauri::Wry>,
    title: Option<String>,
) -> Result<(), String> {
    app.tray()
        .set_recording_title(title)
        .map_err(|error| error.to_string())
}

/// Langue d'affichage de l'interface, pour traduire les menus natifs.
#[tauri::command]
#[specta::specta]
pub async fn set_native_menu_locale(
    app: tauri::AppHandle<tauri::Wry>,
    locale: String,
) -> Result<(), String> {
    app.tray()
        .set_locale(&locale)
        .map_err(|error| error.to_string())
}
