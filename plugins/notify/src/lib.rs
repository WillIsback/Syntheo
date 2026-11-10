mod error;
mod events;
mod ext;
mod path;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use notify::RecommendedWatcher;
use notify_debouncer_full::{Debouncer, RecommendedCache};
use tauri::Manager;

pub use error::*;
pub use events::*;
pub use ext::*;

const PLUGIN_NAME: &str = "notify";

pub struct WatcherState {
    pub(crate) debouncer: Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>,
    pub(crate) own_writes: Arc<Mutex<HashMap<String, Instant>>>,
}

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .events(tauri_specta::collect_events![FileChanged,])
}

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            specta_builder.mount_events(app);

            app.manage(WatcherState {
                debouncer: Mutex::new(None),
                own_writes: Arc::new(Mutex::new(HashMap::new())),
            });

            Ok(())
        })
        .on_webview_ready(|webview| {
            if let Err(e) = webview.app_handle().notify().start() {
                tracing::error!("failed_to_start_watcher: {}", e);
            }
        })
        .on_drop(|app| {
            if let Err(e) = app.notify().stop() {
                tracing::error!("failed_to_stop_watcher: {}", e);
            }
        })
        .build()
}
