use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

use super::MenuItemHandler;
use crate::locale::Label;

pub struct TrayQuitCompletely;

impl MenuItemHandler for TrayQuitCompletely {
    const ID: &'static str = "syntheo_tray_quit_completely";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(
            app,
            Self::ID,
            Label::TrayQuitCompletely.text(),
            true,
            None::<&str>,
        )?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        let app_name = app.package_info().name.clone();
        let app = app.clone();

        app.dialog()
            .message(Label::QuitCompletelyMessage.fill(&[("app", &app_name)]))
            .title(Label::QuitCompletelyTitle.fill(&[("app", &app_name)]))
            .buttons(MessageDialogButtons::OkCancelCustom(
                Label::Quit.text().to_string(),
                Label::Cancel.text().to_string(),
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
