//! Messages du protocole temps réel de NeMo-Speech.cpp, tels que les envoie et
//! les lit l'adaptateur `nvidia` de l'application
//! (`crates/owhisper-client/src/adapter/nvidia.rs`) :
//!
//! - client → module : un `session.update` plat avant l'audio, des trames
//!   binaires PCM16 16 kHz mono, puis un seul `input_audio_buffer.commit` qui
//!   termine le flux ;
//! - module → client : `conversation.item.input_audio_transcription.delta`
//!   (texte ajouté à l'énoncé ouvert), `...completed` (énoncé fermé, avec ses
//!   mots, en secondes depuis le début, intervenants comptés à partir de 1),
//!   `input_audio_buffer.committed` en réponse au commit, et `error`.

use serde::Deserialize;
use serde_json::{Value, json};

/// Seule fréquence acceptée, celle de l'adaptateur.
pub const SAMPLE_RATE: u32 = 16_000;
/// Silence de fin d'énoncé par défaut, comme NeMo-Speech.cpp.
pub const DEFAULT_ENDPOINTING_MS: u32 = 800;
/// Bornes du silence de fin d'énoncé accepté.
const ENDPOINTING_RANGE: std::ops::RangeInclusive<u32> = 200..=5_000;

/// Réglages d'une session, lus dans le `session.update`.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionConfig {
    /// Locale (`fr-FR`) ou `auto`.
    pub language: String,
    pub diarization: bool,
    pub endpointing_ms: u32,
}

#[derive(Deserialize)]
struct RawSession {
    language: Option<String>,
    sample_rate: Option<u32>,
    speaker_diarization: Option<bool>,
    endpointing_ms: Option<u32>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ProtocolError {
    NotJson,
    UnsupportedEvent,
    /// Le `session.update` doit précéder l'audio, et une seule fois.
    SessionExpected,
    UnsupportedSampleRate,
    InvalidLanguage,
}

impl ProtocolError {
    /// Message fixe, sans contenu reçu.
    pub fn message(&self) -> &'static str {
        match self {
            Self::NotJson => "expected a JSON event",
            Self::UnsupportedEvent => "unsupported realtime event type",
            Self::SessionExpected => "session.update must come once, before any audio",
            Self::UnsupportedSampleRate => "only 16000 Hz PCM16 mono audio is supported",
            Self::InvalidLanguage => "invalid language",
        }
    }
}

/// Événement texte reçu du client.
#[derive(Debug, PartialEq)]
pub enum ClientEvent {
    SessionUpdate(SessionConfig),
    Commit,
}

pub fn parse_client_event(text: &str) -> Result<ClientEvent, ProtocolError> {
    let value: Value = serde_json::from_str(text).map_err(|_| ProtocolError::NotJson)?;
    match value["type"].as_str() {
        Some("session.update") => {
            let raw: RawSession = serde_json::from_value(value["session"].clone())
                .map_err(|_| ProtocolError::NotJson)?;
            if raw.sample_rate.is_some_and(|rate| rate != SAMPLE_RATE) {
                return Err(ProtocolError::UnsupportedSampleRate);
            }
            let language = raw.language.unwrap_or_else(|| "auto".to_owned());
            if !valid_language(&language) {
                return Err(ProtocolError::InvalidLanguage);
            }
            Ok(ClientEvent::SessionUpdate(SessionConfig {
                language,
                diarization: raw.speaker_diarization.unwrap_or(true),
                endpointing_ms: raw
                    .endpointing_ms
                    .unwrap_or(DEFAULT_ENDPOINTING_MS)
                    .clamp(*ENDPOINTING_RANGE.start(), *ENDPOINTING_RANGE.end()),
            }))
        }
        Some("input_audio_buffer.commit") => Ok(ClientEvent::Commit),
        _ => Err(ProtocolError::UnsupportedEvent),
    }
}

/// `auto`, `fr` ou `fr-FR` : lettres, au plus une région.
fn valid_language(language: &str) -> bool {
    if language == "auto" {
        return true;
    }
    let (code, region) = language.split_once('-').unwrap_or((language, ""));
    (2..=3).contains(&code.len())
        && code.bytes().all(|b| b.is_ascii_alphabetic())
        && (region.is_empty()
            || (region.len() == 2 && region.bytes().all(|b| b.is_ascii_alphabetic())))
}

/// PCM16 petit-boutiste vers flottants dans [-1, 1]. Un octet impair final
/// est ignoré.
pub fn pcm16_to_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(2)
        .map(|pair| i16::from_le_bytes([pair[0], pair[1]]) as f32 / 32768.0)
        .collect()
}

/// Mot d'un énoncé fermé : secondes depuis le début du flux, intervenant
/// compté à partir de 1 (absent sans diarisation).
#[derive(Debug, Clone, PartialEq)]
pub struct Word {
    pub word: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
    pub speaker: Option<u32>,
}

/// Résultat d'un moteur.
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// Texte ajouté à l'énoncé ouvert.
    Delta(String),
    /// Énoncé fermé.
    Completed {
        transcript: String,
        words: Vec<Word>,
    },
}

pub fn event_json(event: &Event) -> Value {
    match event {
        Event::Delta(delta) => json!({
            "type": "conversation.item.input_audio_transcription.delta",
            "delta": delta,
        }),
        Event::Completed { transcript, words } => json!({
            "type": "conversation.item.input_audio_transcription.completed",
            "transcript": transcript,
            "words": words.iter().map(|w| {
                let mut word = json!({
                    "word": w.word,
                    "start": w.start,
                    "end": w.end,
                    "confidence": w.confidence,
                });
                if let Some(speaker) = w.speaker {
                    word["speaker"] = json!(speaker);
                }
                word
            }).collect::<Vec<_>>(),
        }),
    }
}

pub fn committed_json() -> Value {
    json!({"type": "input_audio_buffer.committed"})
}

pub fn error_json(message: &str) -> Value {
    json!({"type": "error", "error": {"message": message}})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_adapter_session_update() {
        let event = parse_client_event(
            r#"{"type":"session.update","session":{"language":"fr-FR","sample_rate":16000,"automatic_punctuation":true,"word_timestamps":true,"speaker_diarization":true,"endpointing_ms":1000,"max_speaker_count":4,"speech_contexts":[{"phrases":["Marten"],"boost":2.0}]}}"#,
        );
        assert_eq!(
            event,
            Ok(ClientEvent::SessionUpdate(SessionConfig {
                language: "fr-FR".into(),
                diarization: true,
                endpointing_ms: 1000,
            }))
        );
    }

    #[test]
    fn refuses_what_the_server_would_refuse() {
        assert_eq!(
            parse_client_event("pas du json"),
            Err(ProtocolError::NotJson)
        );
        assert_eq!(
            parse_client_event(r#"{"type":"transcription_session.update","session":{}}"#),
            Err(ProtocolError::UnsupportedEvent)
        );
        assert_eq!(
            parse_client_event(r#"{"type":"session.update","session":{"sample_rate":48000}}"#),
            Err(ProtocolError::UnsupportedSampleRate)
        );
        assert_eq!(
            parse_client_event(
                r#"{"type":"session.update","session":{"language":"fr-FR; rm -rf /"}}"#
            ),
            Err(ProtocolError::InvalidLanguage)
        );
        assert_eq!(
            parse_client_event(r#"{"type":"input_audio_buffer.commit"}"#),
            Ok(ClientEvent::Commit)
        );
    }

    #[test]
    fn events_have_the_adapter_shape() {
        let completed = event_json(&Event::Completed {
            transcript: "Bonjour toi".into(),
            words: vec![
                Word {
                    word: "Bonjour".into(),
                    start: 1.0,
                    end: 1.25,
                    confidence: 0.9,
                    speaker: Some(1),
                },
                Word {
                    word: "toi".into(),
                    start: 1.25,
                    end: 1.5,
                    confidence: 1.0,
                    speaker: None,
                },
            ],
        });
        assert_eq!(
            completed["type"],
            "conversation.item.input_audio_transcription.completed"
        );
        assert_eq!(completed["words"][0]["speaker"], 1);
        assert!(completed["words"][1].get("speaker").is_none());
        assert_eq!(
            pcm16_to_f32(&[0, 0x80, 0xff, 0x7f, 1]),
            vec![-1.0, 32767.0 / 32768.0]
        );
    }
}
