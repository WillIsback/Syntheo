use tauri::Wry;

mod commands;
mod generated_summary;
mod session_content;

pub use syntheo_template_app::Template;

const PLUGIN_NAME: &str = "template";

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::summary_length_policy,
            commands::dominant_language,
            commands::prepare_generated_summary,
            commands::compose_generated_summary,
            commands::save_generated_summary::<Wry>,
            commands::save_generated_title::<Wry>,
            commands::apply_session_content_corrections::<Wry>,
            commands::render::<Wry>,
            commands::get_template_source::<Wry>,
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
