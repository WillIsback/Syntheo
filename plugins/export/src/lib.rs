mod commands;
mod destination;
mod ext;
mod manifest;
mod print;
pub use destination::ChosenExportPaths;
pub use ext::*;
pub use syntheo_export_core::{
    Error, ExportInput, ExportMetadata, Result, Transcript, TranscriptItem,
};

const PLUGIN_NAME: &str = "export";

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::export::<tauri::Wry>,
            commands::export_text::<tauri::Wry>,
            commands::choose_export_path::<tauri::Wry>,
            commands::print_pdf::<tauri::Wry>,
            commands::cleanup_print_files::<tauri::Wry>,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(|app, _api| {
            use tauri::Manager;
            app.manage(ChosenExportPaths::default());
            // Lancement : les PDF à imprimer de la session précédente ne
            // servent plus (issue 374). Hors du fil principal.
            let app = app.clone();
            std::thread::spawn(move || {
                if let Err(error) = app.export().cleanup_print_files(std::time::Duration::ZERO) {
                    eprintln!("[export] failed to clean print files: {error}");
                }
            });
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn command_manifest_is_single_source() {
        syntheo_specta_export::assert_command_manifest_is_single_source(
            make_specta_builder::<tauri::Wry>(),
            PLUGIN_NAME,
            crate::manifest::COMMANDS,
        );
    }

    #[test]
    fn export_types() {
        syntheo_specta_export::write_bindings(
            make_specta_builder::<tauri::Wry>(),
            "./js/bindings.gen.ts",
        );
    }
}
