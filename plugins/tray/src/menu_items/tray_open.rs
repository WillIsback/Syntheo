use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};

use super::MenuItemHandler;
use crate::locale::Label;

pub struct TrayOpen;

impl MenuItemHandler for TrayOpen {
    const ID: &'static str = "syntheo_tray_open";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(
            app,
            Self::ID,
            Label::TrayOpen.fill(&[("app", app.package_info().name.as_str())]),
            true,
            None::<&str>,
        )?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        use tauri_plugin_windows::AppWindow;
        let _ = AppWindow::Main.show(app);
    }
}
