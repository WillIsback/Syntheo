#[cfg(target_os = "macos")]
mod bundle_icon;
mod commands;
mod error;
mod ext;
#[cfg(feature = "examples")]
pub mod overlay;
#[cfg(not(feature = "examples"))]
mod overlay;

pub use error::{Error, Result};
pub use ext::*;

const PLUGIN_NAME: &str = "icon";

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::set_dock_icon::<tauri::Wry>,
            commands::set_recording_indicator::<tauri::Wry>,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
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
