use tauri::{
    AppHandle, Emitter, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_windows::{AppWindow, WindowsPluginExt};

use super::MenuItemHandler;
use crate::locale::Label;

/// Événement reçu par la fenêtre principale : elle ouvre Paramètres › Profil
/// et lance une vérification de mise à jour (issue 593).
pub const CHECK_UPDATES_EVENT: &str = "syntheo://check-for-updates";

pub struct TrayCheckUpdates;

impl MenuItemHandler for TrayCheckUpdates {
    const ID: &'static str = "syntheo_tray_check_updates";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(
            app,
            Self::ID,
            Label::TrayCheckUpdates.text(),
            true,
            None::<&str>,
        )?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        if app.windows().show(AppWindow::Main).is_ok()
            && let Err(e) = app.emit_to("main", CHECK_UPDATES_EVENT, ())
        {
            tracing::warn!("failed_emit_check_updates: {e}");
        }
    }
}
