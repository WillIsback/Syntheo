use openai_transcription::batch::{
    CreateTranscriptionResponse, DiarizedTranscriptionResponse, TranscriptionUsage,
};
use owhisper_interface::batch::{Alternatives, Channel, Response as BatchResponse, Results, Word};

use crate::adapter::MIXED_CAPTURE_CHANNEL;

fn transcription_usage_metadata(usage: Option<TranscriptionUsage>) -> serde_json::Value {
    match usage {
        Some(usage) => serde_json::json!({ "usage": usage }),
        None => serde_json::json!({}),
    }
}

fn text_response_metadata(
    usage: Option<TranscriptionUsage>,
    duration: Option<f64>,
) -> serde_json::Value {
    let mut metadata = transcription_usage_metadata(usage);

    if let Some(duration) = duration
        && let Some(object) = metadata.as_object_mut()
    {
        object.insert("duration".to_string(), serde_json::json!(duration));
    }

    metadata
}

fn strip_punctuation(s: &str) -> String {
    s.trim_matches(|c: char| c.is_ascii_punctuation())
        .to_string()
}

fn usage_duration_seconds(usage: Option<&TranscriptionUsage>) -> Option<f64> {
    let seconds = match usage {
        Some(TranscriptionUsage::Duration(duration)) => duration.seconds,
        _ => return None,
    };

    seconds.is_finite().then_some(seconds).filter(|s| *s > 0.0)
}

pub(super) fn convert_text_response(
    transcript: String,
    usage: Option<TranscriptionUsage>,
) -> BatchResponse {
    let usage_duration = usage_duration_seconds(usage.as_ref());
    let mut metadata = text_response_metadata(usage, usage_duration);
    insert_timing_source(&mut metadata, "synthetic_text");

    build_batch_response(transcript, Vec::new(), metadata)
}

pub(super) fn convert_response(response: CreateTranscriptionResponse) -> BatchResponse {
    match response {
        CreateTranscriptionResponse::Standard(response) => {
            convert_text_response(response.text.trim().to_string(), response.usage)
        }
        CreateTranscriptionResponse::Verbose(response) => {
            let words = response
                .words
                .iter()
                .map(|w| {
                    let normalized = strip_punctuation(&w.word);
                    Word {
                        word: if normalized.is_empty() {
                            w.word.clone()
                        } else {
                            normalized
                        },
                        start: w.start,
                        end: w.end,
                        confidence: 1.0,
                        channel: 0,
                        speaker: None,
                        punctuated_word: Some(w.word.clone()),
                    }
                })
                .collect();

            build_batch_response(
                response.text.trim().to_string(),
                words,
                serde_json::json!({
                    "language": response.language,
                    "duration": response.duration,
                    "timing_source": "provider_word",
                }),
            )
        }
        CreateTranscriptionResponse::Diarized(response) => {
            let (words, speaker_labels) = convert_diarized_words(&response);
            let speaker_segments = response
                .segments
                .iter()
                .map(|segment| {
                    serde_json::json!({
                        "id": segment.id,
                        "speaker": segment.speaker,
                        "start": segment.start,
                        "end": segment.end,
                        "text": segment.text,
                        "type": segment.segment_type,
                    })
                })
                .collect::<Vec<_>>();

            build_batch_response(
                response.text.trim().to_string(),
                words,
                serde_json::json!({
                    "duration": response.duration,
                    "speaker_labels": speaker_labels,
                    "speaker_segments": speaker_segments,
                    "timing_source": "provider_segment_interpolated",
                }),
            )
        }
    }
}

fn insert_timing_source(metadata: &mut serde_json::Value, source: &'static str) {
    if let Some(object) = metadata.as_object_mut() {
        object.insert("timing_source".to_string(), serde_json::json!(source));
    }
}

fn convert_diarized_words(response: &DiarizedTranscriptionResponse) -> (Vec<Word>, Vec<String>) {
    let mut speaker_labels = Vec::new();
    let mut words = Vec::new();

    for segment in &response.segments {
        let tokens = segment.text.split_whitespace().collect::<Vec<_>>();
        if tokens.is_empty() {
            continue;
        }

        let speaker_index = speaker_labels
            .iter()
            .position(|label| label == &segment.speaker)
            .unwrap_or_else(|| {
                speaker_labels.push(segment.speaker.clone());
                speaker_labels.len() - 1
            });

        let segment_duration = (segment.end - segment.start).max(0.0);
        let word_duration = segment_duration / tokens.len() as f64;

        for (index, token) in tokens.iter().enumerate() {
            let normalized = strip_punctuation(token);
            let start = segment.start + word_duration * index as f64;
            let end = if index + 1 == tokens.len() {
                segment.end
            } else {
                segment.start + word_duration * (index + 1) as f64
            };

            words.push(Word {
                word: if normalized.is_empty() {
                    (*token).to_string()
                } else {
                    normalized
                },
                start,
                end,
                confidence: 1.0,
                channel: MIXED_CAPTURE_CHANNEL,
                speaker: Some(speaker_index),
                punctuated_word: Some((*token).to_string()),
            });
        }
    }

    (words, speaker_labels)
}

fn build_batch_response(
    transcript: String,
    words: Vec<Word>,
    metadata: serde_json::Value,
) -> BatchResponse {
    let alternatives = Alternatives {
        transcript,
        confidence: 1.0,
        words,
    };

    let channel = Channel {
        alternatives: vec![alternatives],
    };

    BatchResponse {
        metadata,
        results: Results {
            channels: vec![channel],
        },
    }
}
