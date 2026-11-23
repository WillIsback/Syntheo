mod assistant;
mod commands;
mod error;
mod ext;
mod guidance;
mod models;

pub use error::*;
pub use ext::*;
pub use guidance::{PermissionGuidance, SettingsGuidance};
pub use models::*;

const PLUGIN_NAME: &str = "permissions";

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::open_permission::<tauri::Wry>,
            commands::check_permission::<tauri::Wry>,
            commands::request_permission::<tauri::Wry>,
            commands::reset_permission::<tauri::Wry>,
            commands::permission_guidance::<tauri::Wry>,
            commands::close_permission_assistant::<tauri::Wry>,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |_app, _api| Ok(()))
        .build()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn export_types() {
        syntheo_specta_export::write_bindings(
            make_specta_builder::<tauri::Wry>(),
            "./js/bindings.gen.ts",
        );
    }
}
