use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{accept_async, tungstenite::Message};

use super::*;
use crate::listener2::{BatchAudio, BatchErrorCode, BatchProvider};

#[derive(Default)]
struct Events(Mutex<Vec<BatchEvent>>);

impl BatchRuntime for Events {
    fn emit(&self, event: BatchEvent) {
        self.0.lock().unwrap().push(event);
    }
}

impl Events {
    fn names(&self) -> Vec<&'static str> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .map(|event| match event {
                BatchEvent::BatchStarted { .. } => "started",
                BatchEvent::BatchResponseStreamed { .. } => "progress",
                BatchEvent::BatchResponse { .. } => "response",
                BatchEvent::BatchFailed { .. } => "failed",
                BatchEvent::BatchCompleted { .. } => "completed",
            })
            .collect()
    }

    /// Avancements annoncés, avec leur caractère indéterminé (issue #568).
    fn progress(&self) -> Vec<(f64, bool)> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .filter_map(|event| match event {
                BatchEvent::BatchResponseStreamed {
                    event:
                        BatchStreamEvent::Progress {
                            percentage,
                            indeterminate,
                            ..
                        },
                    ..
                } => Some((*percentage, *indeterminate)),
                _ => None,
            })
            .collect()
    }

    fn failure(&self) -> Option<(BatchErrorCode, String)> {
        self.0.lock().unwrap().iter().find_map(|event| match event {
            BatchEvent::BatchFailed { code, error, .. } => Some((*code, error.clone())),
            _ => None,
        })
    }
}

/// WAV PCM 16 bits mono de `seconds` secondes, construit en mémoire.
fn wav(seconds: u32) -> Vec<u8> {
    let rate = 16_000u32;
    let frames = rate * seconds;
    let data_len = frames * 2;
    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&rate.to_le_bytes());
    wav.extend_from_slice(&(rate * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for index in 0..frames {
        let phase = (index as f32 / rate as f32) * 440.0 * std::f32::consts::TAU;
        wav.extend_from_slice(&((phase.sin() * 8_000.0) as i16).to_le_bytes());
    }
    wav
}

fn params(base_url: String, model: &str, audio: &[u8]) -> BatchParams {
    BatchParams {
        session_id: "11111111-1111-4111-8111-111111111111".to_string(),
        provider: BatchProvider::Realtime,
        file_path: String::new(),
        audio: Some(BatchAudio {
            data_base64: base64::engine::general_purpose::STANDARD.encode(audio),
            file_name: "soutenance.wav".to_string(),
        }),
        audio_buffer: None,
        model: Some(model.to_string()),
        base_url,
        api_key: String::new(),
        languages: Vec::new(),
        keywords: Vec::new(),
        num_speakers: None,
        min_speakers: None,
        max_speakers: None,
    }
}

fn options() -> FileStreamOptions {
    FileStreamOptions {
        tail_idle: Duration::from_millis(500),
        ..FileStreamOptions::default()
    }
}

/// Faux serveur temps réel (protocole OpenAI) : un mot pour tout le fichier.
async fn one_word_server() -> std::net::SocketAddr {
    let socket = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = socket.local_addr().unwrap();
    tokio::spawn(async move {
        let (stream, _) = socket.accept().await.unwrap();
        let mut ws = accept_async(stream).await.unwrap();
        let mut answered = false;
        while let Some(Ok(message)) = ws.next().await {
            let Message::Text(text) = message else {
                continue;
            };
            if text.contains("input_audio_buffer.append") && !answered {
                answered = true;
                for raw in [
                    serde_json::json!({"type": "input_audio_buffer.speech_started", "event_id": "e1", "item_id": "item-1", "audio_start_ms": 200}),
                    serde_json::json!({"type": "input_audio_buffer.speech_stopped", "event_id": "e2", "item_id": "item-1", "audio_end_ms": 900}),
                    serde_json::json!({"type": "conversation.item.input_audio_transcription.completed", "event_id": "e3", "item_id": "item-1", "content_index": 0, "transcript": "Bonjour"}),
                ] {
                    ws.send(Message::Text(raw.to_string().into()))
                        .await
                        .unwrap();
                }
            } else if text.contains("input_audio_buffer.commit") {
                let _ = ws.close(None).await;
                break;
            }
        }
    });
    address
}

#[tokio::test]
async fn an_in_memory_file_is_streamed_and_returned_as_a_batch_response() {
    let address = one_word_server().await;
    let events = Arc::new(Events::default());

    let output = run_realtime_file_batch_with(
        events.clone(),
        params(format!("http://{address}/v1"), "cloud", &wav(2)),
        options(),
    )
    .await
    .unwrap();

    let names = events.names();
    assert_eq!(names.first(), Some(&"started"));
    assert!(names.contains(&"progress"));
    assert_eq!(&names[names.len() - 2..], &["response", "completed"]);
    let channel = &output.response.results.channels[2];
    let words = &channel.alternatives[0].words;
    assert_eq!(words.len(), 1);
    assert_eq!(words[0].word, "Bonjour");
    assert!((words[0].start - 0.2).abs() < 0.05, "{}", words[0].start);
    assert_eq!(output.response.metadata["provider"], "openai");
}

#[tokio::test]
async fn a_batch_only_model_is_refused_before_any_connection() {
    let events = Arc::new(Events::default());

    let result = run_realtime_file_batch(
        events.clone(),
        params(
            "https://api.openai.com/v1".to_string(),
            "whisper-1",
            &wav(1),
        ),
    )
    .await;

    assert!(result.is_err());
    let (code, _) = events.failure().unwrap();
    assert_eq!(code, BatchErrorCode::BatchCapabilityUnsupported);
}

#[tokio::test]
async fn an_unreadable_file_fails_with_a_clear_message() {
    let events = Arc::new(Events::default());

    let result = run_realtime_file_batch(
        events.clone(),
        params("http://127.0.0.1:9/v1".to_string(), "cloud", b"not audio"),
    )
    .await;

    assert!(result.is_err());
    let (code, message) = events.failure().unwrap();
    assert_eq!(code, BatchErrorCode::AudioMetadataReadFailed);
    assert!(message.contains("couldn't read this file"), "{message}");
}

/// Faux serveur NeMo-Speech.cpp : `POST /v1/audio/transcriptions` répond avec
/// `rest_status`, et le WebSocket temps réel rend un mot. Compte les deux.
async fn nemo_speech_server(
    rest_status: u16,
) -> (
    std::net::SocketAddr,
    Arc<std::sync::atomic::AtomicUsize>,
    Arc<std::sync::atomic::AtomicUsize>,
) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let socket = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = socket.local_addr().unwrap();
    let posts = Arc::new(AtomicUsize::new(0));
    let sockets = Arc::new(AtomicUsize::new(0));
    let (post_count, socket_count) = (posts.clone(), sockets.clone());
    tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = socket.accept().await else {
                return;
            };
            let mut peek = [0; 4];
            let _ = stream.peek(&mut peek).await;
            if &peek == b"POST" {
                post_count.fetch_add(1, Ordering::SeqCst);
                let mut request = Vec::new();
                let mut buffer = [0; 65536];
                loop {
                    let read = stream.read(&mut buffer).await.unwrap_or(0);
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..read]);
                    let text = String::from_utf8_lossy(&request);
                    if let Some(head_end) = text.find("\r\n\r\n") {
                        let length = text[..head_end]
                            .lines()
                            .find_map(|line| {
                                line.to_ascii_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|value| value.trim().parse::<usize>().unwrap_or(0))
                            })
                            .unwrap_or(0);
                        if request.len() >= head_end + 4 + length {
                            break;
                        }
                    }
                }
                let body = serde_json::json!({
                    "duration": 2.0,
                    "words": [{"word": "Bonjour", "start": 0.3, "end": 0.7, "speaker": 2}]
                })
                .to_string();
                let response = format!(
                    "HTTP/1.1 {rest_status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes()).await;
                continue;
            }
            socket_count.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async move {
                let mut ws = accept_async(stream).await.unwrap();
                let created = serde_json::json!({"type": "session.created", "session": {}});
                ws.send(Message::Text(created.to_string().into()))
                    .await
                    .unwrap();
                let mut answered = false;
                while let Some(Ok(message)) = ws.next().await {
                    match message {
                        Message::Binary(_) if !answered => {
                            answered = true;
                            let completed = serde_json::json!({
                                "type": "conversation.item.input_audio_transcription.completed",
                                "transcript": "Salut",
                                "words": [{"word": "Salut", "start": 0.2, "end": 0.5}]
                            });
                            ws.send(Message::Text(completed.to_string().into()))
                                .await
                                .unwrap();
                        }
                        Message::Text(text) if text.contains("input_audio_buffer.commit") => {
                            let committed =
                                serde_json::json!({"type": "input_audio_buffer.committed"});
                            let _ = ws.send(Message::Text(committed.to_string().into())).await;
                            let _ = ws.close(None).await;
                            break;
                        }
                        _ => {}
                    }
                }
            });
        }
    });
    (address, posts, sockets)
}

fn channel_words(output: &BatchRunOutput) -> Vec<(String, Option<usize>)> {
    output.response.results.channels[2].alternatives[0]
        .words
        .iter()
        .map(|word| (word.word.clone(), word.speaker))
        .collect()
}

#[tokio::test]
async fn nemo_speech_imports_a_file_in_one_rest_request() {
    use std::sync::atomic::Ordering;

    let (address, posts, sockets) = nemo_speech_server(200).await;
    let events = Arc::new(Events::default());

    let output = run_realtime_file_batch_with(
        events.clone(),
        params(
            format!("http://{address}?provider=nvidia"),
            "nemotron-3.5-asr-streaming-0.6b",
            &wav(2),
        ),
        options(),
    )
    .await
    .unwrap();

    assert_eq!(channel_words(&output), [("Bonjour".to_string(), Some(1))]);
    assert_eq!(output.mode, BatchRunMode::Direct);
    assert_eq!(output.response.metadata["provider"], "nvidia");
    assert_eq!(posts.load(Ordering::SeqCst), 1);
    assert_eq!(sockets.load(Ordering::SeqCst), 0);
    assert_eq!(
        &events.names()[events.names().len() - 2..],
        &["response", "completed"]
    );
    // Avancement inconnu pendant la requête, complet à son retour.
    assert_eq!(events.progress(), [(0.0, false), (0.0, true), (1.0, false)]);
}

#[tokio::test]
async fn nemo_speech_falls_back_to_the_realtime_stream_when_rest_fails() {
    use std::sync::atomic::Ordering;

    let (address, posts, sockets) = nemo_speech_server(500).await;
    let events = Arc::new(Events::default());

    let output = run_realtime_file_batch_with(
        events.clone(),
        params(
            format!("http://{address}?provider=nvidia"),
            "nemotron-3.5-asr-streaming-0.6b",
            &wav(2),
        ),
        options(),
    )
    .await
    .unwrap();

    assert_eq!(posts.load(Ordering::SeqCst), 1);
    assert!(sockets.load(Ordering::SeqCst) >= 1);
    assert_eq!(output.mode, BatchRunMode::Streamed);
    assert_eq!(
        channel_words(&output)
            .into_iter()
            .map(|(word, _)| word)
            .collect::<Vec<_>>(),
        ["Salut"]
    );
    // Le repli sur le flux revient à un avancement mesuré.
    let progress = events.progress();
    assert_eq!(progress[..3], [(0.0, false), (0.0, true), (0.0, false)]);
    assert!(
        progress[3..]
            .iter()
            .all(|(_, indeterminate)| !indeterminate)
    );
}
