//! Serveur WebSocket du module, sur la boucle locale seulement.
//!
//! Contrôles du handshake, avant toute donnée :
//! - chemin `/v1/audio/transcriptions/realtime`, comme NeMo-Speech.cpp ;
//! - aucun en-tête `Origin` : une page web ne peut pas joindre le module ;
//! - `Host` sur la boucle locale (`127.0.0.1` ou `localhost`), contre le
//!   rebinding DNS ;
//! - preuve du client (jeton, nonce, ports de la connexion), nonce jamais
//!   vu ; le module répond par sa propre preuve (voir `auth`), et le jeton ne
//!   circule jamais ;
//! - nombre de sessions simultanées borné.
//!
//! Contre l'épuisement : handshake borné dans le temps, connexions en cours de
//! handshake bornées (prises avant toute tâche), pause sur une erreur
//! d'acceptation, file audio bornée (contre-pression sur le client).
//!
//! Puis un `session.update`, l'audio, un commit. La reconnaissance tourne dans
//! un fil par session ; aucun texte transcrit n'est journalisé.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::sync::{Semaphore, mpsc};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::{HeaderValue, StatusCode};
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;

use crate::auth::{
    CLIENT_PROOF_HEADER, Direction, NONCE_HEADER, PROOF_HEADER, Ports, SeenNonces, Token,
    valid_nonce,
};
use crate::engine::{Engine, Recognizer};
use crate::protocol::{
    ClientEvent, Event, ProtocolError, committed_json, error_json, event_json, parse_client_event,
    pcm16_to_f32,
};

pub const REALTIME_PATH: &str = "/v1/audio/transcriptions/realtime";
/// Délai pour recevoir le `session.update` après le handshake.
const SESSION_TIMEOUT: Duration = Duration::from_secs(10);
/// Une trame binaire ou un message texte au plus : 1 Mio.
const MAX_MESSAGE: usize = 1024 * 1024;
/// Délai du handshake WebSocket, preuve comprise.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(3);
/// Connexions en cours de handshake : au-delà, refusées sur-le-champ.
const MAX_HANDSHAKES: usize = 16;
/// Pause après une erreur d'acceptation (descripteurs épuisés…).
const ACCEPT_BACKOFF: Duration = Duration::from_millis(100);
/// Trames audio en attente du moteur (environ 5 s en trames de 20 ms) :
/// au-delà, la lecture du client attend.
const AUDIO_QUEUE: usize = 256;

#[derive(Clone)]
pub struct ServerConfig {
    pub token: Token,
    /// Deux flux par écoute (micro et son système), plus une marge.
    pub max_sessions: usize,
}

/// Journal du module : des nombres et des états, jamais de texte transcrit.
pub fn log(line: &str) {
    eprintln!("syntheo-speech: {line}");
}

/// Sert jusqu'à `shutdown`.
pub async fn serve(
    listener: TcpListener,
    config: ServerConfig,
    engine: Arc<dyn Engine>,
    shutdown: impl std::future::Future<Output = ()>,
) {
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let sessions = Arc::new(Semaphore::new(config.max_sessions.max(1)));
    let handshakes = Arc::new(Semaphore::new(MAX_HANDSHAKES));
    let nonces = Arc::new(SeenNonces::default());
    tokio::pin!(shutdown);
    loop {
        tokio::select! {
            () = &mut shutdown => break,
            accepted = listener.accept() => {
                let (stream, peer) = match accepted {
                    Ok(accepted) => accepted,
                    Err(error) => {
                        // Descripteurs épuisés, par exemple : la connexion
                        // reste dans la file du noyau, on ne boucle pas à vide.
                        log(&format!("accept failed ({:?})", error.kind()));
                        tokio::select! {
                            () = &mut shutdown => break,
                            () = tokio::time::sleep(ACCEPT_BACKOFF) => continue,
                        }
                    }
                };
                // Liaison sur 127.0.0.1 : un pair hors boucle locale ne peut
                // pas arriver ; la vérification reste, par défense.
                if !peer.ip().is_loopback() {
                    continue;
                }
                // Place de handshake prise avant toute tâche : au-delà, la
                // connexion est fermée tout de suite.
                let Ok(handshake) = handshakes.clone().try_acquire_owned() else {
                    continue;
                };
                let context = Handshake {
                    peer_port: peer.port(),
                    port,
                    config: config.clone(),
                    sessions: sessions.clone(),
                    nonces: nonces.clone(),
                };
                let engine = engine.clone();
                tokio::spawn(async move {
                    connection(stream, context, handshake, engine).await;
                });
            }
        }
    }
}

/// Ce qu'il faut pour vérifier un handshake.
struct Handshake {
    peer_port: u16,
    port: u16,
    config: ServerConfig,
    sessions: Arc<Semaphore>,
    nonces: Arc<SeenNonces>,
}

fn reject(status: StatusCode) -> ErrorResponse {
    let mut response = ErrorResponse::new(None);
    *response.status_mut() = status;
    response
}

fn loopback_host(host: Option<&str>, port: u16) -> bool {
    let Some(host) = host else { return false };
    [format!("127.0.0.1:{port}"), format!("localhost:{port}")]
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(host))
}

#[allow(
    clippy::result_large_err,
    reason = "Tungstenite requires an unboxed HTTP response in handshake callbacks"
)]
async fn connection(
    stream: tokio::net::TcpStream,
    context: Handshake,
    handshake: tokio::sync::OwnedSemaphorePermit,
    engine: Arc<dyn Engine>,
) {
    let mut permit = None;
    let ports = Ports {
        client: context.peer_port,
        server: context.port,
    };
    let callback = |request: &Request, mut response: Response| {
        let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
        if request.uri().path() != REALTIME_PATH {
            return Err(reject(StatusCode::NOT_FOUND));
        }
        if request.headers().contains_key("origin") {
            return Err(reject(StatusCode::FORBIDDEN));
        }
        if !loopback_host(header("host"), context.port) {
            return Err(reject(StatusCode::FORBIDDEN));
        }
        let Some(nonce) = header(NONCE_HEADER).filter(|n| valid_nonce(n)) else {
            return Err(reject(StatusCode::UNAUTHORIZED));
        };
        let proven = header(CLIENT_PROOF_HEADER).is_some_and(|proof| {
            context
                .config
                .token
                .verify(Direction::Client, nonce, ports, proof)
        });
        if !proven || !context.nonces.first_use(nonce) {
            return Err(reject(StatusCode::UNAUTHORIZED));
        }
        match context.sessions.clone().try_acquire_owned() {
            Ok(acquired) => permit = Some(acquired),
            Err(_) => return Err(reject(StatusCode::SERVICE_UNAVAILABLE)),
        }
        let proof = context.config.token.proof(Direction::Server, nonce, ports);
        let proof =
            HeaderValue::from_str(&proof).map_err(|_| reject(StatusCode::INTERNAL_SERVER_ERROR))?;
        response.headers_mut().insert(PROOF_HEADER, proof);
        Ok(response)
    };
    let ws_config = WebSocketConfig::default()
        .max_message_size(Some(MAX_MESSAGE))
        .max_frame_size(Some(MAX_MESSAGE));
    let accepted = tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        tokio_tungstenite::accept_hdr_async_with_config(stream, callback, Some(ws_config)),
    )
    .await;
    // La place de handshake se libère dès la fin du handshake, réussi ou non.
    drop(handshake);
    let Ok(Ok(ws)) = accepted else {
        return;
    };
    let _permit = permit;
    session(ws, engine).await;
}

/// Commandes vers le fil de reconnaissance.
enum Work {
    Audio(Vec<f32>),
    Finish,
}

/// Retours du fil de reconnaissance.
enum Output {
    Events(Vec<Event>),
    Committed,
    Failed(&'static str),
}

async fn session(
    ws: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    engine: Arc<dyn Engine>,
) {
    let (mut sink, mut source) = ws.split();
    let send = |value: serde_json::Value| Message::Text(value.to_string().into());

    // 1. Le `session.update`, avant tout audio.
    let first = tokio::time::timeout(SESSION_TIMEOUT, source.next()).await;
    let config = match first {
        Ok(Some(Ok(Message::Text(text)))) => match parse_client_event(&text) {
            Ok(ClientEvent::SessionUpdate(config)) => config,
            Ok(ClientEvent::Commit) => {
                let _ = sink
                    .send(send(error_json(ProtocolError::SessionExpected.message())))
                    .await;
                return;
            }
            Err(error) => {
                let _ = sink.send(send(error_json(error.message()))).await;
                return;
            }
        },
        _ => {
            let _ = sink
                .send(send(error_json(ProtocolError::SessionExpected.message())))
                .await;
            return;
        }
    };

    // 2. Le flux de reconnaissance, dans un fil à lui.
    let opened = {
        let engine = engine.clone();
        let config = config.clone();
        tokio::task::spawn_blocking(move || engine.open(&config)).await
    };
    let recognizer = match opened {
        Ok(Ok(recognizer)) => recognizer,
        Ok(Err(error)) => {
            let _ = sink.send(send(error_json(error.0))).await;
            return;
        }
        Err(_) => {
            let _ = sink.send(send(error_json("engine failed"))).await;
            return;
        }
    };
    // File bornée : si le moteur prend du retard, la lecture du client
    // attend (contre-pression TCP) au lieu d'accumuler l'audio en mémoire.
    let (work_tx, work_rx) = mpsc::channel::<Work>(AUDIO_QUEUE);
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Output>();
    let worker = std::thread::spawn(move || recognize(recognizer, work_rx, out_tx));
    log(&format!(
        "session opened (diarization {})",
        config.diarization
    ));

    // 3. Audio et commit du client, résultats du moteur.
    let mut samples = 0u64;
    let mut utterances = 0u32;
    let mut committing = false;
    loop {
        tokio::select! {
            incoming = source.next(), if !committing => match incoming {
                Some(Ok(Message::Binary(bytes))) => {
                    let audio = pcm16_to_f32(&bytes);
                    samples += audio.len() as u64;
                    if work_tx.send(Work::Audio(audio)).await.is_err() {
                        break;
                    }
                }
                Some(Ok(Message::Text(text))) => match parse_client_event(&text) {
                    Ok(ClientEvent::Commit) => {
                        committing = true;
                        let _ = work_tx.send(Work::Finish).await;
                    }
                    Ok(ClientEvent::SessionUpdate(_)) => {
                        let _ = sink.send(send(error_json(ProtocolError::SessionExpected.message()))).await;
                        break;
                    }
                    Err(error) => {
                        let _ = sink.send(send(error_json(error.message()))).await;
                        break;
                    }
                },
                Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Frame(_))) => {}
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
            },
            output = out_rx.recv() => match output {
                Some(Output::Events(events)) => {
                    for event in &events {
                        if matches!(event, Event::Completed { .. }) {
                            utterances += 1;
                        }
                        if sink.send(send(event_json(event))).await.is_err() {
                            break;
                        }
                    }
                }
                Some(Output::Committed) => {
                    let _ = sink.send(send(committed_json())).await;
                    let _ = sink.close().await;
                    break;
                }
                Some(Output::Failed(message)) => {
                    let _ = sink.send(send(error_json(message))).await;
                    break;
                }
                None => break,
            },
        }
    }
    drop(work_tx);
    let _ = tokio::task::spawn_blocking(move || worker.join()).await;
    log(&format!(
        "session closed ({:.1} s of audio, {utterances} utterances)",
        samples as f64 / f64::from(crate::protocol::SAMPLE_RATE)
    ));
}

/// Fil de reconnaissance d'une session : regroupe l'audio en attente avant
/// chaque appel au moteur.
fn recognize(
    mut recognizer: Box<dyn Recognizer>,
    mut work: mpsc::Receiver<Work>,
    out: mpsc::UnboundedSender<Output>,
) {
    while let Some(first) = work.blocking_recv() {
        let mut audio = Vec::new();
        let mut finish = false;
        let queued = std::iter::from_fn(|| work.try_recv().ok());
        for item in std::iter::once(first).chain(queued) {
            match item {
                Work::Audio(samples) => audio.extend(samples),
                Work::Finish => finish = true,
            }
        }
        if !audio.is_empty() {
            match recognizer.push(&audio) {
                Ok(events) if !events.is_empty() => {
                    let _ = out.send(Output::Events(events));
                }
                Ok(_) => {}
                Err(error) => {
                    let _ = out.send(Output::Failed(error.0));
                    return;
                }
            }
        }
        if finish {
            match recognizer.finish() {
                Ok(events) => {
                    if !events.is_empty() {
                        let _ = out.send(Output::Events(events));
                    }
                    let _ = out.send(Output::Committed);
                }
                Err(error) => {
                    let _ = out.send(Output::Failed(error.0));
                }
            }
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::loopback_host;

    #[test]
    fn only_loopback_hosts_with_the_right_port() {
        assert!(loopback_host(Some("127.0.0.1:4242"), 4242));
        assert!(loopback_host(Some("LOCALHOST:4242"), 4242));
        assert!(!loopback_host(Some("127.0.0.1:80"), 4242));
        assert!(!loopback_host(Some("evil.example:4242"), 4242));
        assert!(!loopback_host(None, 4242));
    }
}
