use std::str::FromStr;

mod commands;
mod error;
mod events;
mod ext;
mod handler;

pub use error::*;
pub use events::*;
pub use ext::*;

const PLUGIN_NAME: &str = "notification";

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::show_notification::<tauri::Wry>,
            commands::clear_notifications::<tauri::Wry>,
        ])
        .events(tauri_specta::collect_events![NotificationEvent])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            specta_builder.mount_events(app);
            handler::init(app.clone());
            Ok(())
        })
        .on_event(|app, event| match event {
            tauri::RunEvent::MainEventsCleared => {}
            tauri::RunEvent::Ready => {}
            tauri::RunEvent::WindowEvent { label, event, .. } => {
                if let Ok(tauri_plugin_windows::AppWindow::Main) =
                    tauri_plugin_windows::AppWindow::from_str(label.as_ref())
                    && let tauri::WindowEvent::Focused(true) = event
                    && let Err(error) = app.notification().clear()
                {
                    tracing::warn!(%error, "failed_to_clear_notifications");
                }
            }
            _ => {}
        })
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
