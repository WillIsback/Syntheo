use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};

use super::MenuItemHandler;

/// Libellé du menu natif. Il doit rester identique à la traduction française
/// de « Report a Bug » dans le catalogue Lingui de l'application (issue 400).
const LABEL: &str = "Signaler un bug";

pub struct HelpReportBug;

impl MenuItemHandler for HelpReportBug {
    const ID: &'static str = "syntheo_help_report_bug";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(app, Self::ID, LABEL, true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(_app: &AppHandle<tauri::Wry>) {
        let _ = open::that("https://github.com/WillIsback/syntheo-desktop/issues");
    }
}

#[cfg(test)]
mod tests {
    use super::LABEL;

    const FR_CATALOG: &str =
        include_str!("../../../../apps/desktop/src/i18n/locales/fr/messages.po");

    fn fr_translation(msgid: &str) -> Option<&'static str> {
        let needle = format!("msgid \"{msgid}\"\n");
        let start = FR_CATALOG.find(&needle)? + needle.len();
        let line = FR_CATALOG[start..].lines().next()?;
        line.strip_prefix("msgstr \"")?.strip_suffix('"')
    }

    #[test]
    fn label_is_signaler_un_bug() {
        assert_eq!(LABEL, "Signaler un bug");
    }

    #[test]
    fn label_matches_app_catalog() {
        assert_eq!(fr_translation("Report a Bug"), Some(LABEL));
    }
}
