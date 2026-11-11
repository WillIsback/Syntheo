//! Faux serveur temps réel (protocole OpenAI Realtime) : chaque seconde du
//! fichier de test porte son numéro dans la valeur de ses échantillons, et le
//! serveur répond par le mot `w{numéro}` dès qu'il l'entend. Les mots rendus
//! disent donc exactement quelle partie du fichier a été transcrite, à quel
//! instant du fichier, et combien de fois.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::Message};

use super::*;

const RATE: usize = SAMPLE_RATE as usize;

fn test_file(seconds: usize) -> Arc<[i16]> {
    (0..seconds * RATE)
        .map(|index| 1_000 + 100 * (index / RATE) as i16)
        .collect::<Vec<_>>()
        .into()
}

fn params(address: std::net::SocketAddr) -> FileStreamParams {
    FileStreamParams {
        session_id: uuid::Uuid::new_v4().to_string(),
        model: "cloud".to_string(),
        base_url: format!("http://{address}/v1"),
        api_key: "test-key".to_string(),
        languages: Vec::new(),
        keywords: Vec::new(),
        participant_human_ids: Vec::new(),
        self_human_id: None,
    }
}

fn fast_options() -> FileStreamOptions {
    FileStreamOptions {
        retry_base_delay: Duration::from_millis(20),
        retry_max_delay: Duration::from_millis(50),
        max_failures_without_progress: 2,
        tail_idle: Duration::from_millis(800),
        tail_max: Duration::from_secs(5),
        ..FileStreamOptions::default()
    }
}

#[derive(Default)]
struct Recorder {
    progress: std::sync::Mutex<Vec<f64>>,
    cancel_after_progress: AtomicBool,
    cancelled: AtomicBool,
}

impl FileStreamObserver for Recorder {
    fn on_progress(&self, progress: FileStreamProgress) {
        self.progress.lock().unwrap().push(progress.fraction);
        if self.cancel_after_progress.load(Ordering::SeqCst) {
            self.cancelled.store(true, Ordering::SeqCst);
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

#[derive(Clone, Copy)]
enum Behaviour {
    /// Répond à toute la connexion.
    Answer,
    /// Coupe la connexion après ce nombre de mots.
    CloseAfterWords(usize),
    /// Coupe dès le premier audio, sans un mot.
    CloseOnAudio,
}

fn event(value: serde_json::Value) -> Message {
    Message::Text(value.to_string().into())
}

/// Sert une connexion ; rend le nombre de mots envoyés.
async fn serve(stream: tokio::net::TcpStream, behaviour: Behaviour) -> usize {
    let Ok(mut ws) = accept_async(stream).await else {
        return 0;
    };
    let mut rate = 24_000.0_f64;
    let mut received = 0usize;
    let mut announced = std::collections::BTreeSet::new();
    let mut words = 0usize;
    while let Some(Ok(message)) = ws.next().await {
        let Message::Text(text) = message else {
            continue;
        };
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        match json["type"].as_str() {
            Some("session.update") => {
                if let Some(value) = json["session"]["audio"]["input"]["format"]["rate"].as_f64() {
                    rate = value;
                }
            }
            Some("input_audio_buffer.append") => {
                if matches!(behaviour, Behaviour::CloseOnAudio) {
                    let _ = ws.close(None).await;
                    return words;
                }
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(json["audio"].as_str().unwrap())
                    .unwrap();
                for pair in bytes.chunks_exact(2) {
                    let value = f64::from(i16::from_le_bytes([pair[0], pair[1]]));
                    let second = ((value - 1_000.0) / 100.0).round();
                    received += 1;
                    if second < 0.0 || !announced.insert(second as i64) {
                        continue;
                    }
                    let at_ms = (received as f64 * 1000.0 / rate) as u64;
                    let item = format!("item-{second}-{at_ms}");
                    for raw in [
                        serde_json::json!({"type": "input_audio_buffer.speech_started", "event_id": format!("s-{item}"), "item_id": item, "audio_start_ms": at_ms}),
                        serde_json::json!({"type": "input_audio_buffer.speech_stopped", "event_id": format!("e-{item}"), "item_id": item, "audio_end_ms": at_ms + 400}),
                        serde_json::json!({"type": "conversation.item.input_audio_transcription.completed", "event_id": format!("c-{item}"), "item_id": item, "content_index": 0, "transcript": format!("w{second}")}),
                    ] {
                        if ws.send(event(raw)).await.is_err() {
                            return words;
                        }
                    }
                    words += 1;
                    if let Behaviour::CloseAfterWords(limit) = behaviour
                        && words >= limit
                    {
                        let _ = ws.close(None).await;
                        return words;
                    }
                }
            }
            Some("input_audio_buffer.commit") => {
                let _ = ws.close(None).await;
                return words;
            }
            _ => {}
        }
    }
    words
}

/// Serveur qui applique `behaviours[n]` à la n-ième connexion (la dernière
/// valeur ensuite) et compte les connexions.
async fn fake_server(behaviours: Vec<Behaviour>) -> (std::net::SocketAddr, Arc<AtomicUsize>) {
    let socket = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = socket.local_addr().unwrap();
    let connections = Arc::new(AtomicUsize::new(0));
    let counter = connections.clone();
    tokio::spawn(async move {
        while let Ok((stream, _)) = socket.accept().await {
            let index = counter.fetch_add(1, Ordering::SeqCst);
            let behaviour = behaviours[index.min(behaviours.len() - 1)];
            tokio::spawn(serve(stream, behaviour));
        }
    });
    (address, connections)
}

fn texts(output: &FileStreamOutput) -> Vec<String> {
    output
        .words
        .iter()
        .map(|word| word.text.trim().to_string())
        .collect()
}

fn expected(seconds: usize) -> Vec<String> {
    (0..seconds).map(|second| format!("w{second}")).collect()
}

#[tokio::test]
async fn short_file_is_transcribed_once_in_file_time_faster_than_realtime() {
    let (address, connections) = fake_server(vec![Behaviour::Answer]).await;
    let recorder = Arc::new(Recorder::default());
    let started = Instant::now();

    let output = stream_file_transcription(
        params(address),
        test_file(12),
        fast_options(),
        recorder.clone(),
    )
    .await
    .unwrap();

    assert_eq!(texts(&output), expected(12));
    assert!(
        started.elapsed() < Duration::from_secs(9),
        "12 s of audio took {:?}",
        started.elapsed()
    );
    for (second, word) in output.words.iter().enumerate() {
        let expected_ms = second as i64 * 1_000;
        assert!(
            (word.start_ms - expected_ms).abs() <= 300,
            "w{second} at {} ms",
            word.start_ms
        );
        assert_eq!(word.channel, FILE_STREAM_CHANNEL);
    }
    assert_eq!(output.reconnections, 0);
    assert!(!output.realtime_fallback);
    assert_eq!(connections.load(Ordering::SeqCst), 1);
    let progress = recorder.progress.lock().unwrap().clone();
    assert!(!progress.is_empty());
    assert!(progress.windows(2).all(|pair| pair[0] <= pair[1]));
}

#[tokio::test]
async fn server_cut_mid_import_reconnects_and_replays_without_duplicates() {
    let (address, connections) =
        fake_server(vec![Behaviour::CloseAfterWords(5), Behaviour::Answer]).await;

    let output = stream_file_transcription(
        params(address),
        test_file(10),
        fast_options(),
        Arc::new(Recorder::default()),
    )
    .await
    .unwrap();

    assert_eq!(texts(&output), expected(10));
    assert_eq!(output.reconnections, 1);
    assert_eq!(connections.load(Ordering::SeqCst), 2);
    assert!(!output.realtime_fallback, "the first stream made progress");
}

#[tokio::test]
async fn a_server_rejecting_the_fast_pace_falls_back_to_realtime() {
    let (address, _) = fake_server(vec![Behaviour::CloseOnAudio, Behaviour::Answer]).await;

    let output = stream_file_transcription(
        params(address),
        test_file(3),
        fast_options(),
        Arc::new(Recorder::default()),
    )
    .await
    .unwrap();

    assert_eq!(texts(&output), expected(3));
    assert!(output.realtime_fallback);
}

#[tokio::test]
async fn a_server_that_stays_down_ends_the_import_with_a_clear_error() {
    let (address, connections) = fake_server(vec![Behaviour::CloseOnAudio]).await;

    let error = stream_file_transcription(
        params(address),
        test_file(4),
        fast_options(),
        Arc::new(Recorder::default()),
    )
    .await
    .unwrap_err();

    assert!(
        matches!(error, FileStreamError::ConnectionLost(_)),
        "{error:?}"
    );
    assert!(error.to_string().contains("connection"), "{error}");
    assert_eq!(connections.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn cancelling_stops_the_import_and_closes_the_stream() {
    let (address, _) = fake_server(vec![Behaviour::Answer]).await;
    let recorder = Arc::new(Recorder::default());
    recorder.cancel_after_progress.store(true, Ordering::SeqCst);
    let started = Instant::now();

    let error = stream_file_transcription(
        params(address),
        test_file(60),
        fast_options(),
        recorder.clone(),
    )
    .await
    .unwrap_err();

    assert!(matches!(error, FileStreamError::Cancelled), "{error:?}");
    assert!(started.elapsed() < Duration::from_secs(10));
}

#[tokio::test]
#[allow(
    clippy::result_large_err,
    reason = "Tungstenite requires an unboxed HTTP response in handshake callbacks"
)]
async fn rejected_credentials_fail_without_retrying() {
    use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};

    let socket = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = socket.local_addr().unwrap();
    let connections = Arc::new(AtomicUsize::new(0));
    let counter = connections.clone();
    tokio::spawn(async move {
        while let Ok((stream, _)) = socket.accept().await {
            counter.fetch_add(1, Ordering::SeqCst);
            let _ = tokio_tungstenite::accept_hdr_async(
                stream,
                |_request: &Request, _response: Response| {
                    Err(Response::builder()
                        .status(401)
                        .body(Some("Expired".into()))
                        .unwrap())
                },
            )
            .await;
        }
    });

    let error = stream_file_transcription(
        params(address),
        test_file(2),
        fast_options(),
        Arc::new(Recorder::default()),
    )
    .await
    .unwrap_err();

    assert!(
        matches!(
            error,
            FileStreamError::Rejected(DegradedError::AuthenticationFailed { .. })
        ),
        "{error:?}"
    );
    assert_eq!(connections.load(Ordering::SeqCst), 1);
}

#[test]
fn a_batch_only_model_cannot_be_streamed() {
    assert!(!supports_file_stream(
        "https://api.openai.com/v1",
        "whisper-1",
        &[]
    ));
    assert!(supports_file_stream(
        "https://asr.example/v1/realtime?provider=nvidia",
        "nemotron-3.5-asr-streaming-0.6b.q8_0",
        &[]
    ));
}
