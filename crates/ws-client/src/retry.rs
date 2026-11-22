use std::fmt;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use backon::{ConstantBuilder, Retryable};
use tokio_tungstenite::tungstenite::http::{HeaderMap, HeaderValue};
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};

pub type WebSocketRetryCallback = Arc<dyn Fn(WebSocketRetryEvent) + Send + Sync>;

/// Authentification mutuelle par preuves, sans secret transmis (module
/// `syntheo-speech` sur le poste, issues 681 et 684). À chaque tentative :
/// - la connexion TCP est ouverte d'abord, pour connaître le port source ;
/// - un nonce frais part dans `nonce_header`, avec la preuve du client
///   `client_proof(nonce, port source, port serveur)` dans
///   `client_proof_header` ;
/// - la réponse doit porter dans `proof_header` une preuve que
///   `verify_server(nonce, port source, port serveur, preuve)` accepte.
///
/// Sinon la connexion est fermée avant tout envoi, sans nouvelle tentative :
/// un autre processus a pu prendre le port. Réservé à `ws://` sur la boucle
/// locale.
/// `(nonce, port source, port serveur)` → preuve du client.
pub type ClientProofFn = Arc<dyn Fn(&str, u16, u16) -> String + Send + Sync>;
/// `(nonce, port source, port serveur, preuve reçue)` → preuve du serveur valide.
pub type VerifyServerFn = Arc<dyn Fn(&str, u16, u16, &str) -> bool + Send + Sync>;

#[derive(Clone)]
pub struct PeerProof {
    pub nonce_header: &'static str,
    pub client_proof_header: &'static str,
    pub proof_header: &'static str,
    pub client_proof: ClientProofFn,
    pub verify_server: VerifyServerFn,
}

impl fmt::Debug for PeerProof {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PeerProof")
            .field("nonce_header", &self.nonce_header)
            .field("client_proof_header", &self.client_proof_header)
            .field("proof_header", &self.proof_header)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone)]
pub struct WebSocketConnectPolicy {
    pub connect_timeout: std::time::Duration,
    pub max_attempts: usize,
    pub retry_delay: std::time::Duration,
}

impl Default for WebSocketConnectPolicy {
    fn default() -> Self {
        Self {
            connect_timeout: std::time::Duration::from_secs(5),
            max_attempts: 3,
            retry_delay: std::time::Duration::from_millis(750),
        }
    }
}

#[derive(Debug, Clone)]
pub struct WebSocketRetryEvent {
    pub attempt: usize,
    pub max_attempts: usize,
    pub error: String,
}

pub(crate) async fn connect_with_retry(
    request: tokio_tungstenite::tungstenite::ClientRequestBuilder,
    policy: &WebSocketConnectPolicy,
    on_retry: Option<&WebSocketRetryCallback>,
    peer_proof: Option<&PeerProof>,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    crate::Error,
> {
    let max_attempts = policy.max_attempts.max(1);
    if max_attempts == 1 {
        return try_connect(request, policy.connect_timeout, 1, max_attempts, peer_proof).await;
    }

    let attempts_made = Arc::new(AtomicUsize::new(0));
    let attempts_ref = attempts_made.clone();

    let result = (|| {
        let request = request.clone();
        let attempts_ref = attempts_ref.clone();
        async move {
            let attempt = attempts_ref.fetch_add(1, Ordering::SeqCst) + 1;
            try_connect(
                request,
                policy.connect_timeout,
                attempt,
                max_attempts,
                peer_proof,
            )
            .await
        }
    })
    .retry(
        ConstantBuilder::default()
            .with_delay(policy.retry_delay)
            .with_max_times(max_attempts - 1),
    )
    .when(|e: &crate::Error| e.is_retryable_connect_error())
    .adjust(|e: &crate::Error, dur| {
        if let crate::Error::ConnectFailed {
            retry_after_secs: Some(secs),
            ..
        } = e
        {
            Some(std::time::Duration::from_secs(*secs))
        } else {
            dur
        }
    })
    .notify(|e: &crate::Error, dur| {
        let attempt = attempts_ref.load(Ordering::SeqCst);
        tracing::warn!(
            attempt,
            max_attempts,
            delay_ms = dur.as_millis() as u64,
            "ws_connect_retry: {:?}",
            e
        );
        if let Some(callback) = on_retry {
            callback(WebSocketRetryEvent {
                attempt: attempt + 1,
                max_attempts,
                error: e.to_string(),
            });
        }
    })
    .await;

    match result {
        Ok(stream) => Ok(stream),
        Err(error @ crate::Error::ConnectRetriesExhausted { .. }) => Err(error),
        Err(error) if !error.is_retryable_connect_error() => Err(error),
        Err(error) => {
            let attempts = attempts_made.load(Ordering::SeqCst);
            let retry_after_secs = error.retry_after_secs();
            Err(crate::Error::connect_retries_exhausted(
                attempts,
                error.to_string(),
                retry_after_secs,
            ))
        }
    }
}

async fn try_connect(
    req: tokio_tungstenite::tungstenite::ClientRequestBuilder,
    timeout: std::time::Duration,
    attempt: usize,
    max_attempts: usize,
    peer_proof: Option<&PeerProof>,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    crate::Error,
> {
    let mut req = req
        .into_client_request()
        .map_err(|error| crate::Error::invalid_request(error.to_string()))?;

    // AWS WAF and similar firewalls reject WebSocket upgrades without a User-Agent.
    if !req.headers().contains_key("user-agent") {
        req.headers_mut().insert(
            "user-agent",
            tokio_tungstenite::tungstenite::http::HeaderValue::from_static("ws-client/0.1.0"),
        );
    }

    let redacted_request = format!("{:?}", RedactedRequest(&req));

    tracing::info!(
        attempt,
        max_attempts,
        request = %redacted_request,
        "connect_async"
    );

    let connect_result = match peer_proof {
        None => tokio::time::timeout(timeout, connect_async(req))
            .await
            .map(|result| result.map_err(ProofConnectError::Connect)),
        Some(proof) => tokio::time::timeout(timeout, connect_with_proof(req, proof)).await,
    };
    let (ws_stream, _) = match connect_result {
        Ok(Ok(stream)) => stream,
        Ok(Err(ProofConnectError::Rejected)) => {
            tracing::warn!(attempt, max_attempts, "peer_proof_rejected");
            return Err(crate::Error::PeerAuthenticationFailed);
        }
        Ok(Err(ProofConnectError::Connect(error))) => {
            tracing::warn!(
                attempt,
                max_attempts,
                request = %redacted_request,
                error = %error,
                "connect_async_failed"
            );
            return Err(crate::Error::connect_failed(attempt, max_attempts, &error));
        }
        Ok(Err(ProofConnectError::Invalid(message))) => {
            return Err(crate::Error::invalid_request(message));
        }
        Err(_) => return Err(crate::Error::connect_timeout(attempt, max_attempts)),
    };

    Ok(ws_stream)
}

type ClientStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
type ClientResponse = tokio_tungstenite::tungstenite::handshake::client::Response;

enum ProofConnectError {
    Rejected,
    Invalid(String),
    Connect(tokio_tungstenite::tungstenite::Error),
}

impl From<tokio_tungstenite::tungstenite::Error> for ProofConnectError {
    fn from(error: tokio_tungstenite::tungstenite::Error) -> Self {
        Self::Connect(error)
    }
}

/// Handshake avec preuves (voir `PeerProof`) : `ws://` sur la boucle locale
/// seulement ; rien n'est envoyé après le handshake si la preuve du serveur
/// manque ou est fausse.
async fn connect_with_proof(
    mut req: tokio_tungstenite::tungstenite::handshake::client::Request,
    proof: &PeerProof,
) -> Result<(ClientStream, ClientResponse), ProofConnectError> {
    let uri = req.uri().clone();
    let host = uri.host().unwrap_or_default().trim_matches(['[', ']']);
    let loopback = host
        .parse::<std::net::IpAddr>()
        .is_ok_and(|ip| ip.is_loopback());
    if uri.scheme_str() != Some("ws") || !loopback {
        return Err(ProofConnectError::Invalid(
            "peer proof requires ws:// on the loopback".to_owned(),
        ));
    }
    let port = uri.port_u16().unwrap_or(80);
    let ip: std::net::IpAddr = host.parse().map_err(|_| ProofConnectError::Rejected)?;
    let tcp = tokio::net::TcpStream::connect((ip, port))
        .await
        .map_err(|e| ProofConnectError::Connect(e.into()))?;
    let client_port = tcp
        .local_addr()
        .map_err(|e| ProofConnectError::Connect(e.into()))?
        .port();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let header = |value: String| {
        HeaderValue::from_str(&value).map_err(|e| ProofConnectError::Invalid(e.to_string()))
    };
    req.headers_mut()
        .insert(proof.nonce_header, header(nonce.clone())?);
    req.headers_mut().insert(
        proof.client_proof_header,
        header((proof.client_proof)(&nonce, client_port, port))?,
    );
    let (stream, response) =
        tokio_tungstenite::client_async(req, tokio_tungstenite::MaybeTlsStream::Plain(tcp)).await?;
    let answered = response
        .headers()
        .get(proof.proof_header)
        .and_then(|value| value.to_str().ok());
    if !answered.is_some_and(|answer| (proof.verify_server)(&nonce, client_port, port, answer)) {
        // Fermeture sans envoyer quoi que ce soit d'autre.
        drop(stream);
        return Err(ProofConnectError::Rejected);
    }
    Ok((stream, response))
}

struct RedactedRequest<'a>(&'a tokio_tungstenite::tungstenite::handshake::client::Request);

impl fmt::Debug for RedactedRequest<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RedactedRequest")
            .field("uri", &redact_uri(self.0.uri()))
            .field("headers", &RedactedHeaders(self.0.headers()))
            .finish()
    }
}

fn redact_uri(uri: &tokio_tungstenite::tungstenite::http::Uri) -> String {
    let raw = uri.to_string();
    let Ok(mut url) = url::Url::parse(&raw) else {
        return "<redacted-uri>".to_string();
    };
    let has_userinfo = !url.username().is_empty() || url.password().is_some();
    if has_userinfo {
        let _ = url.set_username("<redacted>");
        let _ = url.set_password(Some("<redacted>"));
    }
    let has_query = url.query().is_some();
    let pairs = url
        .query_pairs()
        .map(|(key, _)| (key.into_owned(), "<redacted>"))
        .collect::<Vec<_>>();

    if !has_userinfo && !has_query {
        return raw;
    }
    if has_query {
        url.query_pairs_mut().clear().extend_pairs(&pairs);
    }
    url.to_string()
}

struct RedactedHeaders<'a>(&'a HeaderMap<HeaderValue>);

impl fmt::Debug for RedactedHeaders<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut entries = self
            .0
            .iter()
            .map(|(name, value)| {
                let key = name.as_str().to_ascii_lowercase();
                let value = if is_safe_header(&key) {
                    value.to_str().unwrap_or("<non-utf8>").to_string()
                } else {
                    redact_header_value(&key, value)
                };
                (key, value)
            })
            .collect::<Vec<_>>();
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        f.debug_list()
            .entries(
                entries
                    .iter()
                    .map(|(name, value)| (name.as_str(), value.as_str())),
            )
            .finish()
    }
}

fn is_safe_header(name: &str) -> bool {
    matches!(
        name,
        "accept"
            | "accept-encoding"
            | "cache-control"
            | "connection"
            | "host"
            | "pragma"
            | "sec-websocket-key"
            | "sec-websocket-version"
            | "upgrade"
            | "user-agent"
    )
}

fn redact_header_value(name: &str, value: &HeaderValue) -> String {
    let raw = value.to_str().unwrap_or("<non-utf8>");
    if name == "authorization" || name == "proxy-authorization" {
        let mut parts = raw.splitn(2, ' ');
        let scheme = parts.next().unwrap_or_default();
        if parts.next().is_some() && !scheme.is_empty() {
            return format!("{scheme} <redacted>");
        }
    }
    "<redacted>".to_string()
}

#[cfg(test)]
mod tests {
    use tokio_tungstenite::tungstenite::{
        client::IntoClientRequest,
        http::{HeaderMap, HeaderValue},
    };

    use super::{RedactedHeaders, RedactedRequest, redact_header_value};

    #[test]
    fn redacted_headers_redacts_sensitive_values() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_static("Token secret-key"),
        );
        headers.insert("x-api-key", HeaderValue::from_static("secret-api-key"));
        headers.insert(
            "x-goog-api-key",
            HeaderValue::from_static("secret-google-key"),
        );
        headers.insert(
            "ocp-apim-subscription-key",
            HeaderValue::from_static("secret-azure-key"),
        );
        headers.insert("api-key", HeaderValue::from_static("secret-generic-key"));
        headers.insert("cookie", HeaderValue::from_static("session=secret-cookie"));
        headers.insert(
            "x-custom-token",
            HeaderValue::from_static("secret-custom-token"),
        );
        headers.insert("user-agent", HeaderValue::from_static("ws-client/0.1.0"));

        let redacted = format!("{:?}", RedactedHeaders(&headers));

        assert!(redacted.contains("(\"authorization\", \"Token <redacted>\")"));
        assert!(redacted.contains("(\"x-api-key\", \"<redacted>\")"));
        assert!(redacted.contains("(\"x-goog-api-key\", \"<redacted>\")"));
        assert!(redacted.contains("(\"ocp-apim-subscription-key\", \"<redacted>\")"));
        assert!(redacted.contains("(\"api-key\", \"<redacted>\")"));
        assert!(redacted.contains("(\"cookie\", \"<redacted>\")"));
        assert!(redacted.contains("(\"x-custom-token\", \"<redacted>\")"));
        assert!(redacted.contains("(\"user-agent\", \"ws-client/0.1.0\")"));
        assert!(!redacted.contains("secret-google-key"));
        assert!(!redacted.contains("secret-azure-key"));
        assert!(!redacted.contains("secret-generic-key"));
        assert!(!redacted.contains("secret-cookie"));
        assert!(!redacted.contains("secret-custom-token"));
    }

    #[test]
    fn redacted_request_hides_query_and_header_credentials() {
        let mut request = "wss://username-secret:secret-password@example.com/live?key=secret-query-key&provider=google_generative_ai&access_token=secret-access-token&apikey=secret-alias-key"
            .into_client_request()
            .unwrap();
        request.headers_mut().insert(
            "x-goog-api-key",
            HeaderValue::from_static("secret-header-key"),
        );

        let redacted = format!("{:?}", RedactedRequest(&request));

        assert!(redacted.contains("example.com/live?"));
        assert!(redacted.contains("key=%3Credacted%3E"));
        assert!(redacted.contains("provider=%3Credacted%3E"));
        assert!(redacted.contains("access_token=%3Credacted%3E"));
        assert!(redacted.contains("apikey=%3Credacted%3E"));
        assert!(redacted.contains("(\"x-goog-api-key\", \"<redacted>\")"));
        assert!(!redacted.contains("username-secret"));
        assert!(!redacted.contains("secret-password"));
        assert!(!redacted.contains("secret-query-key"));
        assert!(!redacted.contains("secret-access-token"));
        assert!(!redacted.contains("secret-alias-key"));
        assert!(!redacted.contains("secret-header-key"));
    }

    #[test]
    fn redact_authorization_preserves_scheme() {
        let value = HeaderValue::from_static("Bearer abc123");
        assert_eq!(
            redact_header_value("authorization", &value),
            "Bearer <redacted>"
        );
    }
}
