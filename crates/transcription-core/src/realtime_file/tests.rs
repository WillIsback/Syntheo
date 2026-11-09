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
