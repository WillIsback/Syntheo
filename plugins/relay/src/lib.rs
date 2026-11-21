mod access;
mod commands;
mod relay;
mod server;

use std::net::SocketAddr;

use tauri::{AppHandle, Manager, Runtime};

const PLUGIN_NAME: &str = "relay";
const DEFAULT_PORT: u16 = 1423;
/// Fichier du jeton d'amorçage, dans le dossier de données de l'application.
pub const TOKEN_FILE_NAME: &str = "relay-token";

/// Relay actif par défaut en build de debug ; dans une build release avec
/// devtools (alpha), seulement avec `SYNTHEO_RELAY=1` (issue 645).
fn relay_enabled(debug_build: bool, env_value: Option<&str>) -> bool {
    debug_build || env_value == Some("1")
}

/// Écoute imposée sur la boucle locale, quel que soit le port.
fn relay_bind_addr(port: u16) -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], port))
}

pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let pending = relay::PendingResults::default();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(tauri::generate_handler![commands::relay_result])
        .setup(move |app, _api| {
            app.manage(pending.clone());
            if !relay_enabled(
                cfg!(debug_assertions),
                std::env::var("SYNTHEO_RELAY").ok().as_deref(),
            ) {
                tracing::info!("[relay] disabled (set SYNTHEO_RELAY=1 to enable)");
                return Ok(());
            }
            let port = std::env::var("RELAY_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(DEFAULT_PORT);

            let token_file = app
                .path()
                .app_data_dir()
                .ok()
                .map(|dir| dir.join(TOKEN_FILE_NAME));
            start_server(app.clone(), port, pending.clone(), token_file);
            Ok(())
        })
        .build()
}

fn start_server<R: Runtime>(
    app: AppHandle<R>,
    port: u16,
    pending: relay::PendingResults,
    token_file: Option<std::path::PathBuf>,
) {
    let addr = relay_bind_addr(port);

    tauri::async_runtime::spawn(async move {
        if let Err(e) = server::run(app, addr, pending, token_file).await {
            tracing::error!("[relay] server failed: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relay_is_opt_in_outside_debug_builds() {
        assert!(relay_enabled(true, None));
        assert!(!relay_enabled(false, None));
        assert!(!relay_enabled(false, Some("0")));
        assert!(!relay_enabled(false, Some("true")));
        assert!(relay_enabled(false, Some("1")));
    }

    #[test]
    fn relay_listens_on_loopback_only() {
        assert!(relay_bind_addr(1423).ip().is_loopback());
        assert_eq!(relay_bind_addr(1423).to_string(), "127.0.0.1:1423");
    }
}
