mod commands;
mod error;
mod runtime;

pub use error::{Error, Result};
pub use runtime::{open_app_db, open_app_db_unmigrated};
use tauri::Manager;

const PLUGIN_NAME: &str = "db";

pub type ManagedState = std::sync::Arc<runtime::PluginDbRuntime>;

#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TransactionStatement {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
    #[serde(default)]
    pub expected_rows_affected: Option<u64>,
}

#[derive(Debug, Clone, Copy, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StartupPhase {
    PreparingDatabase,
    MigratingDatabase,
    Ready,
    Failed,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    pub phase: StartupPhase,
    pub migration_current: Option<u32>,
    pub migration_total: Option<u32>,
}

impl StartupStatus {
    fn for_phase(phase: StartupPhase) -> Self {
        Self {
            phase,
            migration_current: None,
            migration_total: None,
        }
    }
}

#[derive(Debug, Clone, Copy, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionIngestApplyResult {
    Applied,
    AlreadyApplied,
    Rejected,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, PartialEq)]
pub struct ExecuteProxyResult {
    rows: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, PartialEq)]
#[serde(tag = "event", content = "data")]
pub enum QueryEvent {
    #[serde(rename = "result")]
    Result(Vec<serde_json::Value>),
    #[serde(rename = "error")]
    Error(String),
}

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::list_meetings,
            commands::get_meeting,
            commands::get_meeting_transcript,
            commands::get_recurring_meeting_history,
            commands::execute,
            commands::execute_transaction,
            commands::execute_proxy,
            commands::apply_session_ingest,
            commands::subscribe::<tauri::Wry>,
            commands::unsubscribe,
            commands::get_startup_status,
            commands::wait_until_ready,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

async fn bootstrap_app_database(
    runtime: &runtime::PluginDbRuntime,
) -> std::result::Result<(), String> {
    runtime
        .ensure_app_schema()
        .await
        .map_err(|error| error.to_string())
}

pub fn close_webview_subscriptions<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    let Some(runtime) = app.try_state::<ManagedState>() else {
        return;
    };
    let subscriptions = runtime.close_webview_subscriptions(label);
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn(async move {
        for subscription_id in subscriptions {
            let _ = runtime.unsubscribe(&subscription_id).await;
        }
    });
}

/// Builds the plugin runtime inside the Tauri async runtime.
///
/// Plugin setup runs synchronously on the main thread from `Builder::build()`,
/// which is not inside a Tokio reactor. `PluginDbRuntime::new` eagerly spawns
/// the live-query dispatcher (via `LiveQueryRuntime::new` -> `tokio::spawn`),
/// so construction must happen with a reactor entered.
fn build_runtime(
    db: std::sync::Arc<syntheo_db_core::Db>,
) -> std::sync::Arc<runtime::PluginDbRuntime> {
    std::sync::Arc::new(tauri::async_runtime::block_on(async {
        runtime::PluginDbRuntime::new(db)
    }))
}

pub fn init<R: tauri::Runtime>(
    db: std::sync::Arc<syntheo_db_core::Db>,
) -> tauri::plugin::TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _| {
            let runtime = build_runtime(std::sync::Arc::clone(&db));
            let startup_runtime = std::sync::Arc::clone(&runtime);
            tauri::async_runtime::spawn(async move {
                let result = bootstrap_app_database(&startup_runtime).await;
                startup_runtime.finish_startup(result);
            });
            app.manage(runtime);
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                close_webview_subscriptions(webview.app_handle(), webview.label());
            }
        })
        .on_event(|app, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Destroyed,
                ..
            } = event
            {
                close_webview_subscriptions(app, label);
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use crate::make_specta_builder;

    #[test]
    fn export_types() {
        const OUTPUT_FILE: &str = "./js/bindings.gen.ts";

        make_specta_builder::<tauri::Wry>()
            .disable_serde_phases()
            .semantic_types(
                specta_typescript::semantic::Configuration::empty().enable_lossless_floats(),
            )
            .dangerously_cast_bigints_to_number()
            .export(specta_typescript::Typescript::default(), OUTPUT_FILE)
            .unwrap();

        let content = std::fs::read_to_string(OUTPUT_FILE).unwrap();
        std::fs::write(OUTPUT_FILE, format!("// @ts-nocheck\n{content}")).unwrap();
    }

    #[test]
    fn runtime_constructs_outside_async_context() {
        // Regression guard for the startup panic: plugin setup builds the
        // runtime from a synchronous (reactor-less) context, and
        // `PluginDbRuntime::new` eagerly spawns the live-query dispatcher.
        let db = tauri::async_runtime::block_on(syntheo_db_core::Db::connect_memory_plain())
            .expect("in-memory database");
        let _runtime = crate::build_runtime(std::sync::Arc::new(db));
    }
}
