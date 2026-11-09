use std::sync::LazyLock;

use regex::Regex;
use serde::de::DeserializeOwned;
use serde_json::Value;

mod model;
mod reconcile;
mod render;
mod restore;

pub(crate) use model::json_number;
pub use reconcile::reconcile_refined_speaker_clusters;
pub use render::render_input_from_stored;
use restore::{
    is_transcript_truncated, restore_refined_cluster_channels, restore_refined_source_channels,
    restore_refined_source_hints,
};

static NON_LETTER_OR_NUMBER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^\p{L}\p{N}]").expect("valid Unicode character regex"));
static PUNCTUATION_OR_SEPARATOR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\p{P}\p{Z}]").expect("valid Unicode category regex"));

const MIN_TRANSCRIPT_CHARACTER_LOSS: usize = 200;
const MIN_TRANSCRIPT_RETAINED_RATIO: f64 = 0.5;
const MIN_REFINED_SPEAKER_OVERLAP_RATIO: f64 = 0.6;
const MIN_REFINED_ASSIGNMENT_COVERAGE_RATIO: f64 = 0.8;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct StoredTranscriptWord {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct StoredSpeakerHint {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub word_id: Option<String>,
    #[serde(rename = "type")]
    pub hint_type: String,
    #[serde(default)]
    pub value: Value,
}

pub fn parse_stored_transcript_words(json: &str) -> Vec<StoredTranscriptWord> {
    parse_stored_json_array(json)
}

pub fn parse_stored_speaker_hints(json: &str) -> Vec<StoredSpeakerHint> {
    let Ok(values) = serde_json::from_str::<Vec<Value>>(json) else {
        return Vec::new();
    };
    values
        .into_iter()
        .filter_map(|mut value| {
            if let Value::Object(object) = &mut value
                && !object.get("id").is_some_and(Value::is_string)
                && let Some(id) = object
                    .get("word_id")
                    .and_then(Value::as_str)
                    .zip(object.get("type").and_then(Value::as_str))
                    .map(|(word_id, hint_type)| format!("{word_id}:{hint_type}"))
            {
                object.insert("id".to_string(), Value::String(id));
            }
            serde_json::from_value(value).ok()
        })
        .collect()
}

fn parse_stored_json_array<T: DeserializeOwned>(json: &str) -> Vec<T> {
    serde_json::from_str::<Vec<Value>>(json)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| serde_json::from_value(value).ok())
        .collect()
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum BatchTranscriptPromotion {
    PreserveExisting,
    WholeSession,
    CurrentCapture {
        audio_offset_ms: f64,
        #[serde(default)]
        replace_transcript_id: Option<String>,
        started_at: f64,
    },
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct BatchRefinementSource {
    pub id: String,
    pub started_at: f64,
    pub words: Vec<StoredTranscriptWord>,
    pub speaker_hints: Vec<StoredSpeakerHint>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct BatchRefinementRequest {
    pub words: Vec<StoredTranscriptWord>,
    pub hints: Vec<StoredSpeakerHint>,
    pub promotion: BatchTranscriptPromotion,
    pub previous_transcripts: Vec<BatchRefinementSource>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct SpeakerClusterReconciliationRequest {
    pub source: BatchRefinementSource,
    pub words: Vec<StoredTranscriptWord>,
    pub hints: Vec<StoredSpeakerHint>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BatchRefinementOutcome {
    Ready {
        words: Vec<StoredTranscriptWord>,
        speaker_hints: Vec<StoredSpeakerHint>,
        replace_session: bool,
        replace_transcript_id: Option<String>,
        started_at: Option<f64>,
    },
    EmptyCurrentCapture,
    Truncated,
}

fn rebase_synthetic_chunk_start(metadata: &mut Value, offset_ms: f64) {
    if let Value::String(json) = metadata {
        if let Ok(mut value) = serde_json::from_str::<Value>(json) {
            rebase_synthetic_chunk_start(&mut value, offset_ms);
            *json = value.to_string();
        }
        return;
    }
    let Some(timing) = metadata.get_mut("timing").and_then(Value::as_object_mut) else {
        return;
    };
    if timing.get("source").and_then(Value::as_str) != Some("synthetic_text") {
        return;
    }
    if let Some(start) = timing.get("chunk_start_ms").and_then(Value::as_f64)
        && start.is_finite()
    {
        timing.insert(
            "chunk_start_ms".into(),
            Value::from((start - offset_ms).max(0.0)),
        );
    }
}

pub fn refine_batch_transcript(request: BatchRefinementRequest) -> BatchRefinementOutcome {
    let BatchRefinementRequest {
        words,
        hints,
        promotion,
        previous_transcripts,
    } = request;
    let (mut words, mut hints, replace_session, replace_transcript_id, promoted_started_at) =
        match promotion {
            BatchTranscriptPromotion::PreserveExisting => (words, hints, false, None, None),
            BatchTranscriptPromotion::WholeSession => (words, hints, true, None, None),
            BatchTranscriptPromotion::CurrentCapture {
                audio_offset_ms,
                replace_transcript_id,
                started_at,
            } => {
                let offset_ms = if audio_offset_ms.is_finite() {
                    audio_offset_ms.max(0.0)
                } else {
                    0.0
                };
                let words = words
                    .into_iter()
                    .filter_map(|mut word| {
                        let start_ms = word.start_ms.unwrap_or(0.0);
                        let end_ms = word.end_ms.unwrap_or(start_ms);
                        if end_ms <= offset_ms {
                            return None;
                        }
                        word.start_ms = Some((start_ms - offset_ms).max(0.0));
                        word.end_ms = Some((end_ms - offset_ms).max(0.0));
                        if let Some(metadata) = word.metadata.as_mut() {
                            rebase_synthetic_chunk_start(metadata, offset_ms);
                        }
                        Some(word)
                    })
                    .collect::<Vec<_>>();
                let current_word_ids = words
                    .iter()
                    .map(|word| word.id.as_str())
                    .collect::<std::collections::HashSet<_>>();
                let hints = hints
                    .into_iter()
                    .filter(|hint| {
                        hint.word_id
                            .as_ref()
                            .is_some_and(|word_id| current_word_ids.contains(word_id.as_str()))
                    })
                    .collect();
                (words, hints, false, replace_transcript_id, Some(started_at))
            }
        };

    if matches!((replace_session, promoted_started_at), (false, Some(_))) && words.is_empty() {
        return BatchRefinementOutcome::EmptyCurrentCapture;
    }

    let refined_source = if let Some(replace_transcript_id) = replace_transcript_id.as_ref() {
        previous_transcripts
            .iter()
            .find(|source| &source.id == replace_transcript_id)
    } else {
        None
    };

    if let [source] = previous_transcripts.as_slice() {
        words = if replace_session {
            restore_refined_cluster_channels(&source.words, words, &hints)
        } else {
            restore_refined_source_channels(&source.words, words)
        };
        hints = restore_refined_source_hints(&words, hints);
    }

    let previous_words = previous_transcripts
        .iter()
        .flat_map(|source| source.words.iter())
        .cloned()
        .collect::<Vec<_>>();
    if is_transcript_truncated(&previous_words, &words) {
        return BatchRefinementOutcome::Truncated;
    }

    let speaker_hints = if !words.is_empty() {
        refined_source.map_or(hints.clone(), |source| {
            reconcile_refined_speaker_clusters(source, &words, hints)
        })
    } else {
        hints
    };
    let started_at = promoted_started_at
        .or_else(|| (previous_transcripts.len() == 1).then(|| previous_transcripts[0].started_at));

    BatchRefinementOutcome::Ready {
        words,
        speaker_hints,
        replace_session,
        replace_transcript_id,
        started_at,
    }
}

#[cfg(test)]
mod tests;
