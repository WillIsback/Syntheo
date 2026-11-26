use std::{net::SocketAddr, sync::Arc};

use crate::access::{RelayAccess, authorize};
use axum::{
    Router,
    extract::{State, ws::WebSocketUpgrade},
    response::{IntoResponse, Response},
    routing::get,
};
use tauri::{AppHandle, Runtime};

use crate::relay::PendingResults;

struct AppState<R: Runtime> {
    app: AppHandle<R>,
    pending: PendingResults,
    /// Sous-protocole renvoyé à la poignée de main de `/ws` (issue 664).
    ws_protocol: String,
}

/// Port du serveur de développement Vite.
const DEV_SERVER_PORT: u16 = 1422;

pub async fn run<R: Runtime>(
    app: AppHandle<R>,
    addr: SocketAddr,
    pending: PendingResults,
    token_file: Option<std::path::PathBuf>,
) -> Result<(), std::io::Error> {
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let local_addr = listener.local_addr()?;
    let access = RelayAccess::new(local_addr.port(), token_file);
    let state = Arc::new(AppState {
        app,
        pending,
        ws_protocol: access.ws_protocol(),
    });

    let router = Router::new()
        .route("/ws", get(ws_upgrade::<R>))
        .route("/health", get(|| async { "ok" }))
        .route(crate::access::BOOTSTRAP_PATH, get(|| async { "" }))
        .fallback(get(proxy_to_vite))
        .layer(axum::middleware::from_fn_with_state(access, authorize))
        .with_state(state);

    tracing::info!("[relay] listening on http://{local_addr}");

    axum::serve(listener, router).await?;
    Ok(())
}

async fn ws_upgrade<R: Runtime>(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState<R>>>,
) -> impl IntoResponse {
    let app = state.app.clone();
    let pending = state.pending.clone();
    ws.protocols([state.ws_protocol.clone()])
        .on_upgrade(move |socket| crate::relay::handle_ws(socket, app, pending))
}

/// Pages de l'interface : seulement le serveur de développement d'une build
/// de debug, et sous Linux seulement s'il appartient au même utilisateur
/// (issue 664). Dans une alpha, aucun Vite ne tourne : le port 1422 est libre
/// et un autre compte pourrait y servir une page qui s'exécuterait dans
/// l'origine du relay. Rien n'est donc servi hors debug ; le relay y reste
/// pilotable par `/ws`.
async fn proxy_to_vite(req: axum::extract::Request) -> Response {
    if !cfg!(debug_assertions) {
        return (
            axum::http::StatusCode::NOT_FOUND,
            "The relay serves no page in this build; drive it through /ws.",
        )
            .into_response();
    }
    if !dev_server_owned_by_current_user(DEV_SERVER_PORT) {
        tracing::warn!("[relay] dev server port is not owned by this user");
        return (
            axum::http::StatusCode::BAD_GATEWAY,
            "The development server is not owned by this user.",
        )
            .into_response();
    }
    let path = req.uri().path();
    let query = req
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let url = format!("http://127.0.0.1:{DEV_SERVER_PORT}{path}{query}");

    match do_proxy(&url).await {
        Ok(resp) => resp,
        Err(e) => {
            tracing::warn!("[relay] proxy error for {path}: {e}");
            (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("proxy error: {e}"),
            )
                .into_response()
        }
    }
}

async fn do_proxy(url: &str) -> Result<Response, String> {
    let resp = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = axum::http::StatusCode::from_u16(resp.status().as_u16())
        .unwrap_or(axum::http::StatusCode::INTERNAL_SERVER_ERROR);

    let mut builder = axum::http::Response::builder().status(status);
    for (key, value) in resp.headers() {
        builder = builder.header(key, value);
    }

    builder
        .body(axum::body::Body::from_stream(resp.bytes_stream()))
        .map_err(|e| e.to_string())
}

/// Le serveur qui écoute sur `port` appartient-il à l'utilisateur courant ?
/// Sous Linux, d'après `/proc/net/tcp` et `tcp6` ; ailleurs (postes de
/// développement macOS et Windows), sans vérification.
fn dev_server_owned_by_current_user(port: u16) -> bool {
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::MetadataExt;
        let Ok(uid) = std::fs::metadata("/proc/self").map(|meta| meta.uid()) else {
            return false;
        };
        let owners: Vec<u32> = ["/proc/net/tcp", "/proc/net/tcp6"]
            .iter()
            .filter_map(|path| std::fs::read_to_string(path).ok())
            .flat_map(|table| listener_uids(&table, port))
            .collect();
        !owners.is_empty() && owners.iter().all(|owner| *owner == uid)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = port;
        true
    }
}

/// Propriétaires des sockets en écoute (état `0A`) sur `port`, dans une table
/// au format de `/proc/net/tcp`.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn listener_uids(table: &str, port: u16) -> Vec<u32> {
    let wanted = format!("{port:04X}");
    table
        .lines()
        .skip(1)
        .filter_map(|line| {
            let fields: Vec<&str> = line.split_whitespace().collect();
            let local_port = fields.get(1)?.rsplit(':').next()?;
            let listening = *fields.get(3)? == "0A";
            (listening && local_port.eq_ignore_ascii_case(&wanted))
                .then(|| fields.get(7)?.parse().ok())
                .flatten()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::listener_uids;

    // Issue 664 : seul un serveur de développement de l'utilisateur courant
    // est relayé. Extrait de /proc/net/tcp : 1422 = 0x058E.
    #[test]
    fn reads_the_owner_of_a_listening_socket() {
        let table = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:058E 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 41234 1 0000000000000000 100 0 0 10 0
   1: 0100007F:058E 0100007F:D431 01 00000000:00000000 00:00000000 00000000  1001        0 41235 1 0000000000000000 20 4 30 10 -1
   2: 0100007F:058F 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1002        0 41236 1 0000000000000000 100 0 0 10 0
";
        assert_eq!(listener_uids(table, 1422), vec![1000]);
        assert_eq!(listener_uids(table, 1423), vec![1002]);
        assert!(listener_uids(table, 8080).is_empty());
    }
}
