use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

use super::MenuItemHandler;

pub struct TrayQuitCompletely;

impl MenuItemHandler for TrayQuitCompletely {
    const ID: &'static str = "syntheo_tray_quit_completely";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(app, Self::ID, "Quitter complètement…", true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        let app_name = app.package_info().name.clone();
        let app = app.clone();

        app.dialog()
            .message(format!("{} ne tournera plus en arrière-plan.", app_name))
            .title(format!("Quitter complètement {} ?", app_name))
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Quitter".to_string(),
                "Annuler".to_string(),
            ))
            .show(move |confirmed| {
                if confirmed {
                    quit_completely(&app);
                }
            });
    }
}

pub fn quit_completely(app: &AppHandle<tauri::Wry>) {
    // Skip the frontend exit flush so the process terminates immediately.
    syntheo_intercept::set_force_quit();
    app.exit(0);
}
