mod commands;
mod ext;
#[cfg(target_os = "linux")]
mod linux_frames;
mod locale;
mod macos_position;
mod menu_items;
mod schedule;
mod tray_icon;

pub use ext::*;
pub use menu_items::{SyntheoMenuItem, quit_completely};

const PLUGIN_NAME: &str = "syntheo-tray";

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::<tauri::Wry>::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .build()
}

fn make_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::set_tray_icon_visible,
            commands::set_tray_recording_title,
            commands::set_native_menu_locale,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn export_types() {
        syntheo_specta_export::write_bindings(make_specta_builder(), "./js/bindings.gen.ts");
    }
}
