//! Contrat avec l'application : le client est l'adaptateur `nvidia` de
//! `owhisper-client`, celui qui parle à NeMo-Speech.cpp. Il produit les
//! messages et lit les réponses ; le moteur est factice, derrière le trait.
//! S'y ajoutent les contrôles de sécurité du canal local.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use owhisper_client::{NvidiaAdapter, RealtimeSttAdapter};
use owhisper_interface::stream::StreamResponse;
use syntheo_speech::auth::{NONCE_HEADER, PROOF_HEADER, Token};
use syntheo_speech::engine::{Engine, EngineError, Recognizer};
use syntheo_speech::protocol::{Event, SessionConfig, Word};
use syntheo_speech::server::{REALTIME_PATH, ServerConfig, serve};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

const TOKEN: &str = "0123456789abcdef0123456789abcdef";
const NONCE: &str = "fedcba9876543210fedcba9876543210";

/// Moteur factice : un delta par seconde d'audio, un énoncé fermé au commit
/// avec deux intervenants (ou aucun sans diarisation).
struct FakeEngine;

struct FakeRecognizer {
    samples: usize,
    diarization: bool,
}

impl Engine for FakeEngine {
    fn open(&self, config: &SessionConfig) -> Result<Box<dyn Recognizer>, EngineError> {
        if config.language != "fr-FR" {
            return Err(EngineError("unsupported language"));
        }
        Ok(Box::new(FakeRecognizer {
            samples: 0,
            diarization: config.diarization,
        }))
    }
}

impl Recognizer for FakeRecognizer {
    fn push(&mut self, samples: &[f32]) -> Result<Vec<Event>, EngineError> {
        let before = self.samples / 16_000;
        self.samples += samples.len();
        let after = self.samples / 16_000;
        Ok((before..after)
            .map(|i| {
                Event::Delta(if i == 0 {
                    "Bonjour".into()
                } else {
                    " toi".into()
                })
            })
            .collect())
    }

    fn finish(&mut self) -> Result<Vec<Event>, EngineError> {
        let speaker = |n| self.diarization.then_some(n);
        Ok(vec![Event::Completed {
            transcript: "Bonjour toi".into(),
            words: vec![
                Word {
                    word: "Bonjour".into(),
                    start: 0.5,
                    end: 0.9,
                    confidence: 0.9,
                    speaker: speaker(1),
                },
                Word {
                    word: "toi".into(),
                    start: 1.2,
                    end: 1.5,
                    confidence: 1.0,
                    speaker: speaker(2),
                },
            ],
        }])
    }
}

/// Lance un serveur sur un port libre ; rend le port et l'arrêt.
async fn start(max_sessions: usize) -> (u16, tokio::sync::oneshot::Sender<()>) {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let port = listener.local_addr().unwrap().port();
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let config = ServerConfig {
        token: Token::from_hex(TOKEN).unwrap(),
        max_sessions,
    };
    tokio::spawn(serve(listener, config, Arc::new(FakeEngine), async {
        let _ = stopped.await;
    }));
    (port, stop)
}

fn request(
    port: u16,
    edit: impl FnOnce(&mut tokio_tungstenite::tungstenite::http::Request<()>),
) -> tokio_tungstenite::tungstenite::http::Request<()> {
    let mut request = format!("ws://127.0.0.1:{port}{REALTIME_PATH}")
        .into_client_request()
        .unwrap();
    let headers = request.headers_mut();
    headers.insert("authorization", format!("Bearer {TOKEN}").parse().unwrap());
    headers.insert(NONCE_HEADER, NONCE.parse().unwrap());
    edit(&mut request);
    request
}

/// Code HTTP d'un handshake refusé.
async fn refused_status(request: tokio_tungstenite::tungstenite::http::Request<()>) -> u16 {
    match tokio_tungstenite::connect_async(request).await {
        Err(tokio_tungstenite::tungstenite::Error::Http(response)) => response.status().as_u16(),
        Err(other) => panic!("unexpected error: {other}"),
        Ok(_) => panic!("handshake should have been refused"),
    }
}

fn params(diarization: bool) -> owhisper_interface::ListenParams {
    owhisper_interface::ListenParams {
        languages: vec!["fr".parse().unwrap()],
        num_speakers: (!diarization).then_some(1),
        ..Default::default()
    }
}

/// Une session complète avec l'adaptateur ; rend ses réponses.
async fn session(port: u16, diarization: bool) -> Vec<StreamResponse> {
    let (mut ws, response) = tokio_tungstenite::connect_async(request(port, |_| {}))
        .await
        .unwrap();
    // Le module a prouvé qu'il connaît le jeton, avant tout audio.
    let proof = response
        .headers()
        .get(PROOF_HEADER)
        .unwrap()
        .to_str()
        .unwrap();
    assert!(Token::from_hex(TOKEN).unwrap().verify_proof(NONCE, proof));

    let adapter = NvidiaAdapter::default();
    ws.send(
        adapter
            .initial_message(None, &params(diarization), 1)
            .unwrap(),
    )
    .await
    .unwrap();
    for _ in 0..100 {
        // 2 s d'audio en trames de 20 ms, comme la capture.
        let frame = adapter.audio_to_message(bytes::Bytes::from(vec![0u8; 640]));
        ws.send(frame).await.unwrap();
    }
    ws.send(adapter.finalize_message()).await.unwrap();
    let mut responses = Vec::new();
    while let Ok(Some(Ok(message))) = tokio::time::timeout(Duration::from_secs(5), ws.next()).await
    {
        if let Message::Text(text) = message {
            responses.extend(adapter.parse_response(&text));
        }
    }
    responses
}

fn transcripts(responses: &[StreamResponse]) -> Vec<(String, bool, bool)> {
    responses
        .iter()
        .filter_map(|r| match r {
            StreamResponse::TranscriptResponse {
                channel,
                is_final,
                from_finalize,
                ..
            } => Some((
                channel.alternatives[0].transcript.clone(),
                *is_final,
                *from_finalize,
            )),
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn the_nvidia_adapter_gets_partials_a_final_and_the_end_of_stream() {
    let (port, _stop) = start(4).await;
    let responses = session(port, true).await;
    assert_eq!(
        transcripts(&responses),
        [
            ("Bonjour".to_owned(), false, false),
            ("Bonjour toi".to_owned(), false, false),
            ("Bonjour toi".to_owned(), true, false),
            (String::new(), true, true),
        ]
    );
    // Mots horodatés, intervenants ramenés à partir de 0 par l'adaptateur.
    let StreamResponse::TranscriptResponse { channel, start, .. } = &responses[2] else {
        unreachable!()
    };
    let speakers: Vec<_> = channel.alternatives[0]
        .words
        .iter()
        .map(|w| w.speaker)
        .collect();
    assert_eq!(speakers, [Some(0), Some(1)]);
    assert!((start - 0.5).abs() < 1e-9);
}

#[tokio::test]
async fn without_diarization_words_have_no_speaker() {
    let (port, _stop) = start(4).await;
    let responses = session(port, false).await;
    let StreamResponse::TranscriptResponse { channel, .. } = &responses[2] else {
        unreachable!()
    };
    assert!(
        channel.alternatives[0]
            .words
            .iter()
            .all(|w| w.speaker.is_none())
    );
}

#[tokio::test]
async fn two_streams_run_side_by_side() {
    let (port, _stop) = start(4).await;
    let (mic, system) = tokio::join!(session(port, true), session(port, true));
    assert_eq!(transcripts(&mic).len(), 4);
    assert_eq!(transcripts(&system).len(), 4);
}

#[tokio::test]
async fn the_handshake_refuses_strangers() {
    let (port, _stop) = start(2).await;
    let wrong = "11".repeat(16);
    assert_eq!(
        refused_status(request(port, |r| {
            r.headers_mut().remove("authorization");
        }))
        .await,
        401
    );
    assert_eq!(
        refused_status(request(port, |r| {
            r.headers_mut()
                .insert("authorization", format!("Bearer {wrong}").parse().unwrap());
        }))
        .await,
        401
    );
    assert_eq!(
        refused_status(request(port, |r| {
            r.headers_mut().remove(NONCE_HEADER);
        }))
        .await,
        401
    );
    // Une page web (en-tête Origin) ne joint pas le module, jeton ou non.
    assert_eq!(
        refused_status(request(port, |r| {
            r.headers_mut()
                .insert("origin", "http://localhost:3000".parse().unwrap());
        }))
        .await,
        403
    );
    // Rebinding DNS : un autre nom d'hôte que la boucle locale.
    assert_eq!(
        refused_status(request(port, |r| {
            r.headers_mut()
                .insert("host", format!("evil.example:{port}").parse().unwrap());
        }))
        .await,
        403
    );
    let mut other_path = request(port, |_| {});
    *other_path.uri_mut() = format!("ws://127.0.0.1:{port}/v1/realtime")
        .parse()
        .unwrap();
    assert_eq!(refused_status(other_path).await, 404);
}

#[tokio::test]
async fn sessions_are_bounded() {
    let (port, _stop) = start(2).await;
    let (_a, _) = tokio_tungstenite::connect_async(request(port, |_| {}))
        .await
        .unwrap();
    let (_b, _) = tokio_tungstenite::connect_async(request(port, |_| {}))
        .await
        .unwrap();
    assert_eq!(refused_status(request(port, |_| {})).await, 503);
}

#[tokio::test]
async fn audio_before_the_session_update_is_refused() {
    let (port, _stop) = start(2).await;
    let (mut ws, _) = tokio_tungstenite::connect_async(request(port, |_| {}))
        .await
        .unwrap();
    ws.send(Message::Binary(vec![0u8; 640].into()))
        .await
        .unwrap();
    let Some(Ok(Message::Text(text))) = ws.next().await else {
        panic!("expected an error event")
    };
    let value: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(value["type"], "error");
}

#[tokio::test]
async fn an_unsupported_language_is_reported_as_an_error() {
    let (port, _stop) = start(2).await;
    let (mut ws, _) = tokio_tungstenite::connect_async(request(port, |_| {}))
        .await
        .unwrap();
    let adapter = NvidiaAdapter::default();
    let params = owhisper_interface::ListenParams {
        languages: vec!["de".parse().unwrap()],
        ..Default::default()
    };
    ws.send(adapter.initial_message(None, &params, 1).unwrap())
        .await
        .unwrap();
    let Some(Ok(Message::Text(text))) = ws.next().await else {
        panic!("expected an error event")
    };
    let responses = adapter.parse_response(&text);
    assert!(matches!(
        responses.as_slice(),
        [StreamResponse::ErrorResponse { .. }]
    ));
}

/// Aucune connexion sortante : toutes les sockets TCP du processus de test
/// (serveurs, sessions et clients des tests parallèles compris) restent sur
/// la boucle locale, aux deux bouts ; et celles du module y figurent.
#[cfg(target_os = "linux")]
#[tokio::test]
async fn no_outbound_connection() {
    let (port, _stop) = start(4).await;
    let (_session, ws) = {
        let (ws, _) = tokio_tungstenite::connect_async(request(port, |_| {}))
            .await
            .unwrap();
        (session(port, true).await, ws)
    };
    let inodes: std::collections::HashSet<String> = std::fs::read_dir("/proc/self/fd")
        .unwrap()
        .filter_map(|e| std::fs::read_link(e.ok()?.path()).ok())
        .filter_map(|target| {
            let target = target.to_string_lossy().into_owned();
            target
                .strip_prefix("socket:[")?
                .strip_suffix(']')
                .map(str::to_owned)
        })
        .collect();
    let mut checked = 0;
    for table in ["/proc/self/net/tcp", "/proc/self/net/tcp6"] {
        let Ok(content) = std::fs::read_to_string(table) else {
            continue;
        };
        for line in content.lines().skip(1) {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 10 || !inodes.contains(fields[9]) {
                continue;
            }
            let port_of = |address: &str| {
                u16::from_str_radix(address.rsplit(':').next().unwrap(), 16).unwrap()
            };
            let (local, remote) = (port_of(fields[1]), port_of(fields[2]));
            let loopback = |address: &str| {
                let host = address.split(':').next().unwrap();
                host == "0100007F"
                    || host == "00000000000000000000000001000000"
                    || host.chars().all(|c| c == '0')
            };
            assert!(
                loopback(fields[1]) && loopback(fields[2]),
                "socket hors de la boucle locale : {line}"
            );
            if local == port || remote == port {
                checked += 1;
            }
        }
    }
    assert!(checked >= 2, "sockets du module trouvées : {checked}");
    drop(ws);
}
