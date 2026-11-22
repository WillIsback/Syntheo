//! Contrat avec l'application : le client est l'adaptateur `nvidia` de
//! `owhisper-client`, celui qui parle à NeMo-Speech.cpp. Il produit les
//! messages et lit les réponses ; le moteur est factice, derrière le trait.
//! S'y ajoutent les contrôles de sécurité du canal local : handshake sans
//! jeton en clair, relais, rejeu, réflexion, connexions muettes, et aucune
//! connexion sortante du binaire réel.
#![cfg(feature = "fake-engine")]

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use owhisper_client::{NvidiaAdapter, RealtimeSttAdapter};
use owhisper_interface::stream::StreamResponse;
use syntheo_speech::auth::{
    CLIENT_PROOF_HEADER, Direction, NONCE_HEADER, PROOF_HEADER, Ports, Token,
};
use syntheo_speech::fake::FakeEngine;
use syntheo_speech::server::{REALTIME_PATH, ServerConfig, serve};
use tokio::net::TcpStream;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::Request;

const TOKEN: &str = "0123456789abcdef0123456789abcdef";

fn token() -> Token {
    Token::from_hex(TOKEN).unwrap()
}

fn fresh_nonce() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(1);
    format!(
        "{:032x}",
        NEXT.fetch_add(1, Ordering::SeqCst) + u64::from(std::process::id()) * 1_000_000
    )
}

/// Lance un serveur sur un port libre ; rend le port et l'arrêt.
async fn start(max_sessions: usize) -> (u16, tokio::sync::oneshot::Sender<()>) {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let port = listener.local_addr().unwrap().port();
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let config = ServerConfig {
        token: token(),
        max_sessions,
    };
    tokio::spawn(serve(listener, config, Arc::new(FakeEngine), async {
        let _ = stopped.await;
    }));
    (port, stop)
}

/// Retouche de la requête de handshake (en-têtes, chemin).
type EditRequest = Box<dyn FnOnce(&mut Request<()>) + Send>;

/// Ce que le client met dans son handshake.
struct Hello {
    nonce: String,
    /// Preuve envoyée ; `None` : calculée correctement.
    proof: Option<String>,
    edit: EditRequest,
}

impl Hello {
    fn new() -> Self {
        Self {
            nonce: fresh_nonce(),
            proof: None,
            edit: Box::new(|_| {}),
        }
    }
}

/// Ouvre la connexion TCP (pour connaître le port source), envoie le
/// handshake vers `port`, en visant le module sur `server_port`.
async fn connect(
    port: u16,
    server_port: u16,
    hello: Hello,
) -> Result<(WebSocketStream<TcpStream>, Ports, String), u16> {
    let stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let ports = Ports {
        client: stream.local_addr().unwrap().port(),
        server: server_port,
    };
    let mut request = format!("ws://127.0.0.1:{server_port}{REALTIME_PATH}")
        .into_client_request()
        .unwrap();
    let proof = hello
        .proof
        .unwrap_or_else(|| token().proof(Direction::Client, &hello.nonce, ports));
    request
        .headers_mut()
        .insert(NONCE_HEADER, hello.nonce.parse().unwrap());
    request
        .headers_mut()
        .insert(CLIENT_PROOF_HEADER, proof.parse().unwrap());
    (hello.edit)(&mut request);
    match tokio_tungstenite::client_async(request, stream).await {
        Ok((ws, response)) => {
            let proof = response
                .headers()
                .get(PROOF_HEADER)
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default()
                .to_owned();
            Ok((ws, ports, proof))
        }
        Err(tokio_tungstenite::tungstenite::Error::Http(response)) => {
            Err(response.status().as_u16())
        }
        Err(_) => Err(0),
    }
}

/// Handshake complet, preuve du module vérifiée.
async fn open(port: u16) -> WebSocketStream<TcpStream> {
    let hello = Hello::new();
    let nonce = hello.nonce.clone();
    let (ws, ports, proof) = connect(port, port, hello).await.expect("handshake");
    assert!(
        token().verify(Direction::Server, &nonce, ports, &proof),
        "preuve du module"
    );
    ws
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
    let mut ws = open(port).await;
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
async fn the_token_never_travels() {
    let (port, _stop) = start(2).await;
    let hello = Hello::new();
    let nonce = hello.nonce.clone();
    let (_ws, ports, server_proof) = connect(port, port, hello).await.unwrap();
    let client_proof = token().proof(Direction::Client, &nonce, ports);
    for sent in [&nonce, &client_proof, &server_proof] {
        assert!(!sent.contains(TOKEN));
    }
}

#[tokio::test]
async fn the_handshake_refuses_strangers() {
    let (port, _stop) = start(4).await;
    let wrong = Token::from_hex(&"11".repeat(16)).unwrap();
    // Sans preuve, preuve d'un autre jeton, sans nonce.
    let mut no_proof = Hello::new();
    no_proof.edit = Box::new(|r| {
        r.headers_mut().remove(CLIENT_PROOF_HEADER);
    });
    assert_eq!(connect(port, port, no_proof).await.err(), Some(401));
    let mut other = Hello::new();
    other.proof = Some(wrong.proof(
        Direction::Client,
        &other.nonce,
        Ports {
            client: 0,
            server: port,
        },
    ));
    assert_eq!(connect(port, port, other).await.err(), Some(401));
    let mut no_nonce = Hello::new();
    no_nonce.edit = Box::new(|r| {
        r.headers_mut().remove(NONCE_HEADER);
    });
    assert_eq!(connect(port, port, no_nonce).await.err(), Some(401));
    // Une page web (Origin), un autre nom d'hôte (rebinding DNS), un autre
    // chemin.
    let mut origin = Hello::new();
    origin.edit = Box::new(|r| {
        r.headers_mut()
            .insert("origin", "http://localhost:3000".parse().unwrap());
    });
    assert_eq!(connect(port, port, origin).await.err(), Some(403));
    let mut host = Hello::new();
    host.edit = Box::new(move |r| {
        r.headers_mut()
            .insert("host", format!("evil.example:{port}").parse().unwrap());
    });
    assert_eq!(connect(port, port, host).await.err(), Some(403));
    let mut path = Hello::new();
    path.edit = Box::new(move |r| {
        *r.uri_mut() = format!("ws://127.0.0.1:{port}/v1/realtime")
            .parse()
            .unwrap();
    });
    assert_eq!(connect(port, port, path).await.err(), Some(404));
}

// Revue 0.8.0 (module), constat 2 : la preuve du client est liée à la
// connexion ; un relais ne peut pas la réutiliser.
#[tokio::test]
async fn a_relay_cannot_reuse_the_client_proof() {
    let (port, _stop) = start(4).await;
    // Relais TCP : il transmet les octets au module depuis sa propre connexion.
    let relay = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let relay_port = relay.local_addr().unwrap().port();
    tokio::spawn(async move {
        while let Ok((mut inbound, _)) = relay.accept().await {
            tokio::spawn(async move {
                let mut outbound = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
                let _ = tokio::io::copy_bidirectional(&mut inbound, &mut outbound).await;
            });
        }
    });
    // Le client croit parler au module sur ce port : sa preuve porte ses
    // ports vers le relais, que le module ne voit pas.
    assert_eq!(
        connect(relay_port, port, Hello::new()).await.err(),
        Some(401)
    );
}

// Constat 2 : un nonce n'est accepté qu'une fois pendant le lancement.
#[tokio::test]
async fn a_nonce_cannot_be_used_twice() {
    let (port, _stop) = start(4).await;
    let first = Hello::new();
    let nonce = first.nonce.clone();
    let _ws = connect(port, port, first).await.expect("first use");
    let mut again = Hello::new();
    again.nonce = nonce;
    assert_eq!(connect(port, port, again).await.err(), Some(401));
}

// Constat 2 : la preuve du serveur renvoyée comme preuve du client
// (réflexion) est refusée.
#[tokio::test]
async fn a_reflected_proof_is_refused() {
    let (port, _stop) = start(4).await;
    let stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let ports = Ports {
        client: stream.local_addr().unwrap().port(),
        server: port,
    };
    drop(stream);
    let mut reflected = Hello::new();
    reflected.proof = Some(token().proof(Direction::Server, &reflected.nonce, ports));
    assert_eq!(connect(port, port, reflected).await.err(), Some(401));
}

#[tokio::test]
async fn sessions_are_bounded() {
    let (port, _stop) = start(2).await;
    let _a = open(port).await;
    let _b = open(port).await;
    assert_eq!(connect(port, port, Hello::new()).await.err(), Some(503));
}

// Constats 1, 3 et 5 : des connexions muettes n'empêchent pas le vrai client
// de passer (handshake borné dans le temps et en nombre).
#[tokio::test]
async fn silent_connections_do_not_lock_the_real_client_out() {
    let (port, _stop) = start(4).await;
    let mut silent = Vec::new();
    for _ in 0..64 {
        silent.push(TcpStream::connect(("127.0.0.1", port)).await.unwrap());
    }
    let started = std::time::Instant::now();
    let mut connected = false;
    while started.elapsed() < Duration::from_secs(10) {
        if let Ok((_ws, _, _)) = connect(port, port, Hello::new()).await {
            connected = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    assert!(connected, "le vrai client n'a pas pu se connecter");
    drop(silent);
}

#[tokio::test]
async fn audio_before_the_session_update_is_refused() {
    let (port, _stop) = start(2).await;
    let mut ws = open(port).await;
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
    let mut ws = open(port).await;
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

/// Sockets TCP d'un processus : (état, adresse locale, adresse distante).
#[cfg(target_os = "linux")]
fn tcp_sockets(pid: u32) -> Vec<(String, String, String)> {
    let inodes: std::collections::HashSet<String> = std::fs::read_dir(format!("/proc/{pid}/fd"))
        .map(|dir| {
            dir.filter_map(|e| std::fs::read_link(e.ok()?.path()).ok())
                .filter_map(|target| {
                    let target = target.to_string_lossy().into_owned();
                    target
                        .strip_prefix("socket:[")?
                        .strip_suffix(']')
                        .map(str::to_owned)
                })
                .collect()
        })
        .unwrap_or_default();
    let mut sockets = Vec::new();
    for table in ["tcp", "tcp6"] {
        let Ok(content) = std::fs::read_to_string(format!("/proc/{pid}/net/{table}")) else {
            continue;
        };
        for line in content.lines().skip(1) {
            let f: Vec<&str> = line.split_whitespace().collect();
            if f.len() >= 10 && inodes.contains(f[9]) {
                sockets.push((f[3].to_owned(), f[1].to_owned(), f[2].to_owned()));
            }
        }
    }
    sockets
}

/// Constat 9 : le binaire réel (moteur factice) n'ouvre aucune socket hors de
/// la boucle locale, ni avant, ni pendant, ni après une session ; aucune
/// écoute sur 0.0.0.0 ou ::.
#[cfg(target_os = "linux")]
#[tokio::test]
async fn the_real_binary_opens_no_outbound_connection() {
    use std::io::{BufRead, Write};
    const LOOPBACK: [&str; 2] = ["0100007F", "00000000000000000000000001000000"];
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_syntheo-speech"))
        .args(["--engine", "fake", "--models", "/nonexistent"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .env_clear()
        .spawn()
        .unwrap();
    let pid = child.id();
    let mut stdin = child.stdin.take().unwrap();
    writeln!(stdin, "{TOKEN}").unwrap();
    let mut line = String::new();
    std::io::BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    let announce: serde_json::Value = serde_json::from_str(&line).unwrap();
    let port = announce["port"].as_u64().unwrap() as u16;

    let check = |when: &str| {
        let sockets = tcp_sockets(pid);
        assert!(!sockets.is_empty(), "{when} : aucune socket trouvée");
        for (state, local, remote) in &sockets {
            let (local_host, local_port) = local.split_once(':').unwrap();
            assert!(
                LOOPBACK.contains(&local_host),
                "{when} : écoute ou connexion hors boucle locale : {local}"
            );
            assert_eq!(
                u16::from_str_radix(local_port, 16).unwrap(),
                port,
                "{when} : autre port local : {local}"
            );
            if state == "0A" {
                continue; // LISTEN : adresse distante nulle.
            }
            let remote_host = remote.split_once(':').unwrap().0;
            assert!(
                LOOPBACK.contains(&remote_host),
                "{when} : pair hors boucle locale : {remote}"
            );
        }
    };
    check("avant la session");
    let during = tokio::spawn(async move { session(port, true).await });
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_millis(30)).await;
        check("pendant la session");
    }
    assert_eq!(transcripts(&during.await.unwrap()).len(), 4);
    check("après la session");
    drop(stdin);
    let status = child.wait().unwrap();
    assert!(
        status.success(),
        "arrêt à la fermeture de l'entrée standard"
    );
}

/// Issue 684 : le vrai client de l'application (`ListenClient` en mode « Sur
/// ce poste ») et le module parlent le même handshake : preuves croisées,
/// puis une session complète.
#[tokio::test]
async fn the_app_client_handshakes_with_the_module() {
    use owhisper_client::{FinalizeHandle, ListenClient, OnDeviceToken};
    use owhisper_interface::MixedMessage;
    let (port, _stop) = start(4).await;
    let token_bytes = (0..TOKEN.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&TOKEN[i..i + 2], 16).unwrap())
        .collect();
    let client = ListenClient::builder()
        .adapter::<NvidiaAdapter>()
        .api_base(format!("http://127.0.0.1:{port}"))
        .params(params(true))
        .on_device(OnDeviceToken::new(token_bytes).unwrap())
        .build_single()
        .await
        .unwrap();
    let audio: Vec<owhisper_client::ListenClientInput> = (0..100)
        .map(|_| MixedMessage::Audio(bytes::Bytes::from(vec![0u8; 640])))
        .collect();
    // L'audio, puis un flux ouvert : la fin passe par la poignée, comme dans
    // l'application.
    let input = futures_util::stream::iter(audio).chain(futures_util::stream::pending());
    let (output, handle) = client
        .from_realtime_audio(Box::pin(input))
        .await
        .expect("handshake à preuves accepté par le module");
    tokio::time::sleep(Duration::from_millis(200)).await;
    handle.finalize().await;
    let mut output = Box::pin(output);
    let mut finals = 0;
    while let Ok(Some(Ok(response))) =
        tokio::time::timeout(Duration::from_secs(5), output.next()).await
    {
        if let StreamResponse::TranscriptResponse {
            is_final: true,
            channel,
            ..
        } = &response
            && channel.alternatives[0].transcript == "Bonjour toi"
        {
            finals += 1;
        }
    }
    assert_eq!(finals, 1);
}

/// Un client de l'application avec un autre jeton est refusé par le module.
#[tokio::test]
async fn the_app_client_with_another_token_is_refused() {
    use owhisper_client::{ListenClient, OnDeviceToken};
    let (port, _stop) = start(4).await;
    let client = ListenClient::builder()
        .adapter::<NvidiaAdapter>()
        .api_base(format!("http://127.0.0.1:{port}"))
        .params(params(true))
        .on_device(OnDeviceToken::new(vec![9; 16]).unwrap())
        .build_single()
        .await
        .unwrap();
    let result = client
        .from_realtime_audio(futures_util::stream::pending())
        .await;
    assert!(result.is_err());
}
