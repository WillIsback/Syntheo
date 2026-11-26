use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};

/// Chemin de l'amorçage : `/__relay/bootstrap?token=…` pose le cookie de
/// session puis renvoie vers l'interface.
pub(crate) const BOOTSTRAP_PATH: &str = "/__relay/bootstrap";

/// Préfixe du sous-protocole WebSocket qui porte le secret du canal de
/// commandes (issue 664) : `syntheo-relay.<secret>`.
pub(crate) const WS_PROTOCOL_PREFIX: &str = "syntheo-relay.";

// Accès au relay (issue 645). Le jeton d'amorçage est remis hors bande : écrit
// dans un fichier lisible par le seul utilisateur et affiché en console, jamais
// déduit d'en-têtes de requête. Il ne sert qu'une fois ; le suivant le
// remplace aussitôt. Le cookie de session n'est posé que par cet amorçage,
// jamais sur une réponse transmise depuis le serveur de développement.
//
// Issue 664 : un cookie n'est pas isolé par port (RFC 6265), une page d'un
// autre port de la boucle locale ouverte par l'utilisateur le reçoit aussi.
// Il ne sert donc qu'aux pages ; le canal de commandes (`/ws`) exige un
// second secret, remis dans le fragment de l'URL de retour de l'amorçage
// (jamais envoyé à un serveur, gardé par port dans `sessionStorage`) et
// présenté en sous-protocole WebSocket.
#[derive(Clone)]
pub(crate) struct RelayAccess {
    port: u16,
    secret: String,
    session: String,
    bootstrap: Arc<Mutex<String>>,
    token_file: Option<PathBuf>,
}

impl RelayAccess {
    pub(crate) fn new(port: u16, token_file: Option<PathBuf>) -> Self {
        let access = Self {
            port,
            secret: uuid::Uuid::new_v4().to_string(),
            session: uuid::Uuid::new_v4().simple().to_string(),
            bootstrap: Arc::new(Mutex::new(String::new())),
            token_file,
        };
        access.rotate_bootstrap();
        access
    }

    /// URL d'amorçage du jeton courant.
    pub(crate) fn bootstrap_url(&self) -> String {
        let token = self.bootstrap.lock().map(|t| t.clone()).unwrap_or_default();
        format!(
            "http://127.0.0.1:{}{BOOTSTRAP_PATH}?token={token}",
            self.port
        )
    }

    /// Nouveau jeton à usage unique : fichier réécrit et URL affichée en console
    /// (stderr, pas dans app.log).
    fn rotate_bootstrap(&self) {
        if let Ok(mut token) = self.bootstrap.lock() {
            *token = uuid::Uuid::new_v4().simple().to_string();
        }
        let url = self.bootstrap_url();
        if let Some(path) = &self.token_file
            && let Err(error) = write_private_file(path, &format!("{url}\n"))
        {
            tracing::warn!(%error, "[relay] bootstrap token file not written");
        }
        eprintln!("[relay] open {url} to connect a browser (single use)");
    }

    /// Consomme le jeton s'il est exact, en temps constant.
    fn consume_bootstrap(&self, candidate: &str) -> bool {
        let matches = self
            .bootstrap
            .lock()
            .map(|token| constant_time_eq(token.as_bytes(), candidate.as_bytes()))
            .unwrap_or(false);
        if matches {
            self.rotate_bootstrap();
        }
        matches
    }

    fn host(&self, headers: &HeaderMap) -> Option<String> {
        let host = headers.get(header::HOST)?.to_str().ok()?;
        [
            format!("localhost:{}", self.port),
            format!("127.0.0.1:{}", self.port),
        ]
        .into_iter()
        .find(|allowed| allowed == host)
    }

    /// Sous-protocole attendu sur `/ws`.
    pub(crate) fn ws_protocol(&self) -> String {
        format!("{WS_PROTOCOL_PREFIX}{}", self.session)
    }

    fn ws_authenticated(&self, headers: &HeaderMap) -> bool {
        let expected = self.ws_protocol();
        headers
            .get_all(header::SEC_WEBSOCKET_PROTOCOL)
            .iter()
            .any(|value| {
                value.to_str().is_ok_and(|protocols| {
                    protocols.split(',').any(|protocol| {
                        constant_time_eq(protocol.trim().as_bytes(), expected.as_bytes())
                    })
                })
            })
    }

    fn cookie_name(&self) -> String {
        format!("syntheo-relay-{}", self.port)
    }

    fn authenticated(&self, headers: &HeaderMap) -> bool {
        let expected = format!("{}={}", self.cookie_name(), self.secret);
        headers.get_all(header::COOKIE).iter().any(|value| {
            value.to_str().is_ok_and(|cookies| {
                cookies
                    .split(';')
                    .any(|cookie| constant_time_eq(cookie.trim().as_bytes(), expected.as_bytes()))
            })
        })
    }
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

/// Fichier lisible par le seul utilisateur (0600 sous Unix ; sous Windows, le
/// dossier de données de l'utilisateur n'est pas lisible par les autres
/// comptes).
fn write_private_file(path: &std::path::Path, content: &str) -> std::io::Result<()> {
    use std::io::Write;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(content.as_bytes())
}

fn query_token(req: &Request) -> Option<String> {
    req.uri()
        .query()?
        .split('&')
        .find_map(|pair| pair.strip_prefix("token=").map(str::to_string))
}

pub(crate) async fn authorize(
    State(access): State<RelayAccess>,
    req: Request,
    next: Next,
) -> Response {
    let Some(host) = access.host(req.headers()) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let origin = req.headers().get(header::ORIGIN);
    let same_origin = origin.is_some_and(|origin| {
        origin
            .to_str()
            .is_ok_and(|value| value == format!("http://{host}"))
    });
    if (origin.is_some() && !same_origin)
        || req
            .headers()
            .get("sec-fetch-site")
            .is_some_and(|site| site == "cross-site")
    {
        return StatusCode::FORBIDDEN.into_response();
    }

    let path = req.uri().path().to_string();
    if path == BOOTSTRAP_PATH {
        let Some(token) = query_token(&req) else {
            return StatusCode::FORBIDDEN.into_response();
        };
        if !access.consume_bootstrap(&token) {
            return StatusCode::FORBIDDEN.into_response();
        }
        return (
            StatusCode::SEE_OTHER,
            [
                (
                    header::LOCATION,
                    format!("/#relay-session={}", access.session),
                ),
                (
                    header::SET_COOKIE,
                    format!(
                        "{}={}; HttpOnly; SameSite=Strict; Path=/",
                        access.cookie_name(),
                        access.secret
                    ),
                ),
                (header::CACHE_CONTROL, "no-store".to_string()),
                (header::REFERRER_POLICY, "no-referrer".to_string()),
            ],
        )
            .into_response();
    }
    if path == "/ws" {
        // Canal de commandes : secret de session en sous-protocole et origine
        // exacte ; le cookie, partagé entre les ports, n'y suffit pas.
        if !same_origin || !access.ws_authenticated(req.headers()) {
            return StatusCode::FORBIDDEN.into_response();
        }
    } else if path != "/health" && !access.authenticated(req.headers()) {
        return StatusCode::FORBIDDEN.into_response();
    }

    let mut response = next.run(req).await;
    // Vite's development CORS policy must not expose this proxy to websites,
    // and a proxied response never sets a cookie.
    response
        .headers_mut()
        .remove(header::ACCESS_CONTROL_ALLOW_ORIGIN);
    response
        .headers_mut()
        .remove(header::ACCESS_CONTROL_ALLOW_CREDENTIALS);
    response.headers_mut().remove(header::SET_COOKIE);
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert(header::REFERRER_POLICY, "no-referrer".parse().unwrap());
    response
        .headers_mut()
        .insert("x-frame-options", "DENY".parse().unwrap());
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, body::Body, routing::get};
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::{Message, client::IntoClientRequest};
    use tower::ServiceExt;

    fn token_of(access: &RelayAccess) -> String {
        access.bootstrap.lock().unwrap().clone()
    }

    fn router(access: RelayAccess) -> Router {
        Router::new()
            .route(
                "/",
                get(|| async {
                    // Amont non authentifié (serveur de développement ou
                    // processus qui occupe le port) : jamais de cookie relayé.
                    (
                        [
                            (header::CONTENT_TYPE, "text/html"),
                            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
                            (header::SET_COOKIE, "syntheo-relay-1423=planted"),
                        ],
                        "<html></html>",
                    )
                }),
            )
            .route("/ws", get(|| async { "accepted" }))
            .route("/health", get(|| async { "ok" }))
            .route(BOOTSTRAP_PATH, get(|| async { "" }))
            .layer(axum::middleware::from_fn_with_state(access, authorize))
    }

    async fn get_with(router: &Router, uri: &str, headers: &[(&str, &str)]) -> Response {
        let mut request = Request::builder()
            .uri(uri)
            .header(header::HOST, "127.0.0.1:1423");
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        router
            .clone()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    // Issue 645 : les en-têtes Sec-Fetch d'un client quelconque ne suffisent
    // plus ; une réponse transmise ne pose jamais de cookie.
    #[tokio::test]
    async fn forged_navigation_headers_get_no_credential() {
        let access = RelayAccess::new(1423, None);
        let router = router(access);
        let response = get_with(
            &router,
            "/",
            &[
                ("sec-fetch-site", "none"),
                ("sec-fetch-mode", "navigate"),
                ("sec-fetch-dest", "document"),
            ],
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
    }

    #[tokio::test]
    async fn bootstrap_token_is_single_use_and_sets_the_session_cookie() {
        let dir = std::env::temp_dir().join(format!("relay-test-{}", uuid::Uuid::new_v4()));
        let file = dir.join(crate::TOKEN_FILE_NAME);
        let access = RelayAccess::new(1423, Some(file.clone()));
        let first = token_of(&access);
        assert_eq!(
            std::fs::read_to_string(&file).unwrap().trim(),
            format!("http://127.0.0.1:1423{BOOTSTRAP_PATH}?token={first}")
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&file).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        let router = router(access.clone());

        let wrong = get_with(&router, &format!("{BOOTSTRAP_PATH}?token=guess"), &[]).await;
        assert_eq!(wrong.status(), StatusCode::FORBIDDEN);
        assert!(!wrong.headers().contains_key(header::SET_COOKIE));

        let ok = get_with(&router, &format!("{BOOTSTRAP_PATH}?token={first}"), &[]).await;
        assert_eq!(ok.status(), StatusCode::SEE_OTHER);
        assert_eq!(
            ok.headers()[header::LOCATION],
            format!("/#relay-session={}", access.session)
        );
        let cookie = format!("{}={}", access.cookie_name(), access.secret);
        assert_eq!(
            ok.headers()[header::SET_COOKIE],
            format!("{cookie}; HttpOnly; SameSite=Strict; Path=/")
        );

        // Usage unique : le même jeton est refusé, le fichier porte le suivant.
        let replay = get_with(&router, &format!("{BOOTSTRAP_PATH}?token={first}"), &[]).await;
        assert_eq!(replay.status(), StatusCode::FORBIDDEN);
        let second = token_of(&access);
        assert_ne!(first, second);
        assert!(std::fs::read_to_string(&file).unwrap().contains(&second));

        // Avec le cookie, l'interface est servie, sans cookie relayé.
        let page = get_with(&router, "/", &[("cookie", cookie.as_str())]).await;
        assert_eq!(page.status(), StatusCode::OK);
        assert!(!page.headers().contains_key(header::SET_COOKIE));
        assert!(
            !page
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN)
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    // Issue 664 : le canal de commandes exige le secret de session en
    // sous-protocole et l'origine exacte. Le cookie, qu'une page d'un autre
    // port de la boucle locale reçoit aussi, ne suffit pas.
    #[tokio::test]
    async fn websocket_requires_the_session_protocol_and_its_exact_origin() {
        let access = RelayAccess::new(1423, None);
        let cookie = format!("{}={}", access.cookie_name(), access.secret);
        let protocol = access.ws_protocol();
        let router = router(access);
        let both = format!("chat, {protocol}");
        for (origin, credentials, expected) in [
            ("http://127.0.0.1:1423", vec![], StatusCode::FORBIDDEN),
            (
                "http://127.0.0.1:1423",
                vec![("cookie", cookie.as_str())],
                StatusCode::FORBIDDEN,
            ),
            (
                "https://attacker.example",
                vec![("sec-websocket-protocol", protocol.as_str())],
                StatusCode::FORBIDDEN,
            ),
            (
                "",
                vec![("sec-websocket-protocol", protocol.as_str())],
                StatusCode::FORBIDDEN,
            ),
            (
                "http://127.0.0.1:1423",
                vec![("sec-websocket-protocol", "syntheo-relay.forged")],
                StatusCode::FORBIDDEN,
            ),
            (
                "http://127.0.0.1:1423",
                vec![("sec-websocket-protocol", protocol.as_str())],
                StatusCode::OK,
            ),
            (
                "http://127.0.0.1:1423",
                vec![("sec-websocket-protocol", both.as_str())],
                StatusCode::OK,
            ),
        ] {
            let mut headers = credentials.clone();
            if !origin.is_empty() {
                headers.push(("origin", origin));
            }
            let response = get_with(&router, "/ws", &headers).await;
            assert_eq!(response.status(), expected, "{origin} {credentials:?}");
        }
        let wrong_host = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/ws")
                    .header(header::HOST, "attacker.example:1423")
                    .header(header::ORIGIN, "http://attacker.example:1423")
                    .header(header::SEC_WEBSOCKET_PROTOCOL, protocol.as_str())
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(wrong_host.status(), StatusCode::FORBIDDEN);
        assert_eq!(
            get_with(&router, "/health", &[]).await.status(),
            StatusCode::OK
        );
        // Sans jeton, aucune page : le secret du canal n'ouvre pas les pages.
        let page = get_with(
            &router,
            "/",
            &[("sec-websocket-protocol", protocol.as_str())],
        )
        .await;
        assert_eq!(page.status(), StatusCode::FORBIDDEN);
        let restarted = RelayAccess::new(1423, None);
        assert!(!restarted.ws_authenticated(&HeaderMap::from_iter([(
            header::SEC_WEBSOCKET_PROTOCOL,
            protocol.parse().unwrap()
        )])));
    }

    #[tokio::test]
    async fn websocket_connects_with_the_session_protocol() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let access = RelayAccess::new(addr.port(), None);
        let protocol = access.ws_protocol();
        let echoed = protocol.clone();
        let router = Router::new()
            .route(
                "/ws",
                get(|ws: axum::extract::ws::WebSocketUpgrade| async move {
                    ws.protocols([echoed]).on_upgrade(|mut socket| async move {
                        if let Some(Ok(message)) = socket.recv().await {
                            socket.send(message).await.unwrap();
                        }
                    })
                }),
            )
            .layer(axum::middleware::from_fn_with_state(access, authorize));
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        let mut request = format!("ws://{addr}/ws").into_client_request().unwrap();
        request
            .headers_mut()
            .insert(header::SEC_WEBSOCKET_PROTOCOL, protocol.parse().unwrap());
        request
            .headers_mut()
            .insert(header::ORIGIN, "https://attacker.example".parse().unwrap());
        let error = tokio_tungstenite::connect_async(request.clone())
            .await
            .unwrap_err();
        assert!(
            matches!(error, tokio_tungstenite::tungstenite::Error::Http(response) if response.status() == StatusCode::FORBIDDEN)
        );
        request
            .headers_mut()
            .insert(header::ORIGIN, format!("http://{addr}").parse().unwrap());
        let (mut socket, response) = tokio_tungstenite::connect_async(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::SWITCHING_PROTOCOLS);
        assert_eq!(
            response.headers()[header::SEC_WEBSOCKET_PROTOCOL],
            protocol.as_str()
        );
        socket
            .send(Message::Text("authenticated".into()))
            .await
            .unwrap();
        assert_eq!(
            socket.next().await.unwrap().unwrap(),
            Message::Text("authenticated".into())
        );
        server.abort();
    }
}
