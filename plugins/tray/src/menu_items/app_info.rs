use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_misc::MiscPluginExt;

use super::MenuItemHandler;

pub struct AppInfo;

impl MenuItemHandler for AppInfo {
    const ID: &'static str = "syntheo_app_info";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let title = about_title(&app.package_info().name);
        let item = MenuItem::with_id(app, Self::ID, title, true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        let app_name = app.package_info().name.clone();
        let app_version = app.package_info().version.to_string();
        let app_commit = app.misc().get_git_hash();

        let message = about_message(&app_name, &app_version, &app_commit);

        let app_clone = app.clone();

        app.dialog()
            .message(&message)
            .title(about_title(&app_name))
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Copier".to_string(),
                "Annuler".to_string(),
            ))
            .show(move |result| {
                if result {
                    let _ = app_clone.clipboard().write_text(&message);
                }
            });
    }
}

fn about_title(app_name: &str) -> String {
    format!("À propos de {app_name}")
}

fn about_message(app_name: &str, app_version: &str, app_commit: &str) -> String {
    format!("- Application : {app_name}\n- Version : {app_version}\n- SHA :\n  {app_commit}")
}

#[cfg(test)]
mod tests {
    use super::{about_message, about_title};

    #[test]
    fn about_dialog_is_in_french() {
        assert_eq!(about_title("Syntheo"), "À propos de Syntheo");
        assert_eq!(
            about_message("Syntheo", "0.5.5", "abc123"),
            "- Application : Syntheo\n- Version : 0.5.5\n- SHA :\n  abc123"
        );
    }
}
