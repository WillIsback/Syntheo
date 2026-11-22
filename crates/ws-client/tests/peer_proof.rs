//! Preuve du pair (module `syntheo-speech` sur le poste, issue 684) : la
//! preuve du client porte le nonce et les deux ports ; rien n'est envoyé
//! avant d'avoir vérifié celle du serveur ; pas de réessai sur une preuve
//! fausse ; un nonce frais de 128 bits par connexion.

#![allow(
    clippy::result_large_err,
    reason = "le rappel de handshake de tungstenite rend une réponse HTTP complète"
)]

mod common;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use common::*;
use futures_util::StreamExt;
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::ClientRequestBuilder;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::http::HeaderValue;
use ws_client::client::{PeerProof, WebSocketClient, WebSocketConnectPolicy};

const NONCE: &str = "x-test-nonce";
const CLIENT_PROOF: &str = "x-test-client-proof";
const PROOF: &str = "x-test-proof";

fn client_proof(nonce: &str, client: u16, server: u16) -> String {
    format!("client:{nonce}:{client}:{server}")
}

fn server_proof(nonce: &str, client: u16, server: u16) -> String {
    format!("server:{nonce}:{client}:{server}")
}

fn peer_proof() -> PeerProof {
    PeerProof {
        nonce_header: NONCE,
        client_proof_header: CLIENT_PROOF,
        proof_header: PROOF,
        client_proof: Arc::new(client_proof),
        verify_server: Arc::new(|nonce, client, server, proof| {
            proof == server_proof(nonce, client, server)
        }),
    }
}

/// Ce que le faux serveur a vu.
#[derive(Default)]
struct Seen {
    connections: usize,
    nonces: Vec<String>,
    client_proofs_valid: Vec<bool>,
    /// Messages reçus après le handshake.
    messages: usize,
}

/// Faux serveur ; `honest` : renvoie la bonne preuve, sinon une fausse.
async fn fake_server(honest: bool) -> (std::net::SocketAddr, Arc<Mutex<Seen>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let seen = Arc::new(Mutex::new(Seen::default()));
    let shared = seen.clone();
    tokio::spawn(async move {
        while let Ok((stream, peer)) = listener.accept().await {
            let seen = shared.clone();
            tokio::spawn(async move {
                seen.lock().unwrap().connections += 1;
                let callback = |request: &Request, mut response: Response| {
                    let header = |name: &str| {
                        request
                            .headers()
                            .get(name)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or_default()
                            .to_owned()
                    };
                    let nonce = header(NONCE);
                    let valid =
                        header(CLIENT_PROOF) == client_proof(&nonce, peer.port(), addr.port());
                    let answer = if honest {
                        server_proof(&nonce, peer.port(), addr.port())
                    } else {
                        // Un squatteur sans le secret : il renvoie ce qu'il a.
                        header(CLIENT_PROOF)
                    };
                    {
                        let mut seen = seen.lock().unwrap();
                        seen.nonces.push(nonce);
                        seen.client_proofs_valid.push(valid);
                    }
                    response
                        .headers_mut()
                        .insert(PROOF, HeaderValue::from_str(&answer).unwrap());
                    Ok::<_, tokio_tungstenite::tungstenite::handshake::server::ErrorResponse>(
                        response,
                    )
                };
                let Ok(mut ws) = tokio_tungstenite::accept_hdr_async(stream, callback).await else {
                    return;
                };
                while let Some(Ok(message)) = ws.next().await {
                    if message.is_text() || message.is_binary() {
                        seen.lock().unwrap().messages += 1;
                    }
                }
            });
        }
    });
    (addr, seen)
}

fn client(addr: std::net::SocketAddr) -> WebSocketClient {
    WebSocketClient::new(ClientRequestBuilder::new(
        format!("ws://{addr}").parse().unwrap(),
    ))
    .with_connect_policy(WebSocketConnectPolicy {
        connect_timeout: Duration::from_secs(2),
        max_attempts: 3,
        retry_delay: Duration::from_millis(50),
    })
    .with_peer_proof(peer_proof())
}

#[tokio::test]
async fn an_honest_peer_gets_the_stream() {
    let (addr, seen) = fake_server(true).await;
    let (output, _handle) = client(addr)
        .from_audio::<TestIO, _>(None, Box::pin(message_stream("bonjour")))
        .await
        .expect("connected");
    let mut output = Box::pin(output);
    let _ = tokio::time::timeout(Duration::from_millis(300), output.next()).await;
    let seen = seen.lock().unwrap();
    assert_eq!(
        seen.client_proofs_valid,
        [true],
        "preuve client liée aux ports"
    );
    assert!(seen.messages >= 1, "l'audio part après la vérification");
}

// Issue 684, point 2 : une preuve fausse ferme la connexion, sans aucun
// message, ni nouvelle tentative.
#[tokio::test]
async fn a_wrong_proof_gets_nothing_and_no_retry() {
    let (addr, seen) = fake_server(false).await;
    let error = client(addr)
        .from_audio::<TestIO, _>(None, Box::pin(message_stream("secret")))
        .await
        .err()
        .expect("refused");
    assert!(matches!(error, ws_client::Error::PeerAuthenticationFailed));
    assert!(error.is_auth_error() && !error.is_retryable_connect_error());
    tokio::time::sleep(Duration::from_millis(200)).await;
    let seen = seen.lock().unwrap();
    assert_eq!(seen.connections, 1, "aucune nouvelle tentative");
    assert_eq!(seen.messages, 0, "aucun message après le handshake");
}

// Point 3 : un nonce frais d'au moins 128 bits par connexion.
#[tokio::test]
async fn each_connection_has_a_fresh_128_bit_nonce() {
    let (addr, seen) = fake_server(true).await;
    for _ in 0..2 {
        let (_output, _handle) = client(addr)
            .from_audio::<TestIO, _>(None, Box::pin(message_stream("x")))
            .await
            .unwrap();
    }
    let seen = seen.lock().unwrap();
    assert_eq!(seen.nonces.len(), 2);
    assert_ne!(seen.nonces[0], seen.nonces[1]);
    for nonce in &seen.nonces {
        assert!(nonce.len() >= 32 && nonce.bytes().all(|b| b.is_ascii_hexdigit()));
    }
}

#[tokio::test]
async fn proofs_are_only_for_ws_on_the_loopback() {
    for url in ["wss://127.0.0.1:9/x", "ws://example.com:9/x"] {
        let error = WebSocketClient::new(ClientRequestBuilder::new(url.parse().unwrap()))
            .with_connect_policy(WebSocketConnectPolicy {
                max_attempts: 1,
                ..Default::default()
            })
            .with_peer_proof(peer_proof())
            .from_audio::<TestIO, _>(None, Box::pin(message_stream("x")))
            .await
            .err()
            .expect("refused");
        assert!(
            matches!(error, ws_client::Error::InvalidRequest { .. }),
            "{url}"
        );
    }
}
