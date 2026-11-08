use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_misc::MiscPluginExt;

use super::MenuItemHandler;
use crate::locale::{Label, NativeLocale, fill_template};

pub struct AppInfo;

impl MenuItemHandler for AppInfo {
    const ID: &'static str = "syntheo_app_info";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let title = about_title(NativeLocale::current(), &app.package_info().name);
        let item = MenuItem::with_id(app, Self::ID, title, true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        let app_name = app.package_info().name.clone();
        let app_version = app.package_info().version.to_string();
        let app_commit = app.misc().get_git_hash();

        let locale = NativeLocale::current();
        let message = about_message(locale, &app_name, &app_version, &app_commit);

        let app_clone = app.clone();

        app.dialog()
            .message(&message)
            .title(about_title(locale, &app_name))
            .buttons(MessageDialogButtons::OkCancelCustom(
                Label::Copy.text_in(locale).to_string(),
                Label::Cancel.text_in(locale).to_string(),
            ))
            .show(move |result| {
                if result {
                    let _ = app_clone.clipboard().write_text(&message);
                }
            });
    }
}

fn about_title(locale: NativeLocale, app_name: &str) -> String {
    fill_template(Label::AboutTitle.text_in(locale), &[("app", app_name)])
}

fn about_message(
    locale: NativeLocale,
    app_name: &str,
    app_version: &str,
    app_commit: &str,
) -> String {
    fill_template(
        Label::AboutMessage.text_in(locale),
        &[
            ("app", app_name),
            ("version", app_version),
            ("commit", app_commit),
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::{NativeLocale, about_message, about_title};

    #[test]
    fn about_dialog_is_in_french() {
        assert_eq!(
            about_title(NativeLocale::Fr, "Syntheo"),
            "À propos de Syntheo"
        );
        assert_eq!(
            about_message(NativeLocale::Fr, "Syntheo", "0.5.5", "abc123"),
            "- Application : Syntheo\n- Version : 0.5.5\n- SHA :\n  abc123"
        );
    }

    #[test]
    fn about_dialog_follows_english() {
        assert_eq!(about_title(NativeLocale::En, "Syntheo"), "About Syntheo");
        assert_eq!(
            about_message(NativeLocale::En, "Syntheo", "0.5.5", "abc123"),
            "- Application: Syntheo\n- Version: 0.5.5\n- SHA:\n  abc123"
        );
    }
}
