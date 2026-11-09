use std::collections::HashMap;

use serde_json::Value;

use crate::{ChannelProfile, IdentityScope, RenderTranscriptInput, RenderTranscriptWordInput};

use super::model::{
    AssignmentScope, IdentityAssignment, OrderedMap, RenderTranscript, RenderWord, channel_profile,
    channel_profile_number, javascript_number_string, parse_hint_value_for_render,
};
use super::{StoredSpeakerHint, StoredTranscriptWord};

pub(super) fn build_render_transcript(
    source_words: &[StoredTranscriptWord],
    hints: &[StoredSpeakerHint],
) -> Option<RenderTranscript> {
    let mut words = Vec::new();
    let mut word_index_by_id: OrderedMap<String, usize> = OrderedMap::default();
    for word in source_words {
        let (Some(text), Some(start_ms), Some(end_ms)) = (&word.text, word.start_ms, word.end_ms)
        else {
            continue;
        };
        word_index_by_id.set(word.id.clone(), words.len());
        words.push(RenderWord {
            id: word.id.clone(),
            text: text.clone(),
            start_ms,
            end_ms,
            channel: word.channel.unwrap_or(0.0),
            speaker_index: None,
        });
    }
    if words.is_empty() {
        return None;
    }

    for hint in hints
        .iter()
        .filter(|hint| hint.hint_type == "provider_speaker_index")
    {
        normalize_speaker_hint(hint, &mut words, &word_index_by_id);
    }
    let mut assignments = Vec::new();
    for hint_type in ["automatic_speaker_assignment", "user_speaker_assignment"] {
        for hint in hints.iter().filter(|hint| hint.hint_type == hint_type) {
            if let Some(assignment) = normalize_speaker_hint(hint, &mut words, &word_index_by_id) {
                assignments.push(assignment);
            }
        }
    }
    Some(RenderTranscript { words, assignments })
}

pub fn render_input_from_stored(
    started_at: Option<i64>,
    words: &[StoredTranscriptWord],
    hints: &[StoredSpeakerHint],
) -> Option<RenderTranscriptInput> {
    let transcript = build_render_transcript(words, hints)?;
    let synthetic_timing_by_id: HashMap<&str, crate::SyntheticTiming> = words
        .iter()
        .filter_map(|word| {
            crate::synthetic_render::synthetic_timing_from_metadata(word.metadata.as_ref())
                .map(|timing| (word.id.as_str(), timing))
        })
        .collect();

    Some(RenderTranscriptInput {
        started_at,
        words: transcript
            .words
            .into_iter()
            .map(|word| RenderTranscriptWordInput {
                synthetic_timing: synthetic_timing_by_id.get(word.id.as_str()).copied(),
                id: word.id,
                text: word.text,
                start_ms: word.start_ms.round() as i64,
                end_ms: word.end_ms.round() as i64,
                channel: word.channel.round() as i32,
                speaker_index: word.speaker_index.map(|index| index.round() as i32),
            })
            .collect(),
        assignments: transcript
            .assignments
            .into_iter()
            .map(|assignment| crate::IdentityAssignment {
                human_id: assignment.human_id,
                scope: match assignment.scope {
                    AssignmentScope::Channel(channel) => IdentityScope::Channel { channel },
                    AssignmentScope::ChannelSpeaker {
                        channel,
                        speaker_index,
                    } => IdentityScope::ChannelSpeaker {
                        channel,
                        speaker_index: speaker_index.round() as i32,
                    },
                    AssignmentScope::Words(word_ids) => IdentityScope::Words { word_ids },
                },
            })
            .collect(),
    })
}

fn normalize_speaker_hint(
    hint: &StoredSpeakerHint,
    words: &mut [RenderWord],
    word_index_by_id: &OrderedMap<String, usize>,
) -> Option<IdentityAssignment> {
    let word_id = hint.word_id.as_ref()?;
    let value = parse_hint_value_for_render(&hint.value)?;
    let is_speaker_assignment = matches!(
        hint.hint_type.as_str(),
        "automatic_speaker_assignment" | "user_speaker_assignment"
    );
    let human_id = value
        .get("human_id")
        .and_then(Value::as_str)
        .map(str::to_owned);

    if is_speaker_assignment && let Some(human_id) = human_id.as_ref() {
        if let Some(scope) = explicit_speaker_scope(&value) {
            return Some(IdentityAssignment {
                human_id: human_id.clone(),
                scope,
            });
        }
        if value.get("scope").and_then(Value::as_str) == Some("segment")
            && let Some(word_ids) = value.get("word_ids").and_then(Value::as_array)
        {
            let word_ids = word_ids
                .iter()
                .filter_map(Value::as_str)
                .filter(|word_id| !word_id.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>();
            if !word_ids.is_empty() {
                return Some(IdentityAssignment {
                    human_id: human_id.clone(),
                    scope: AssignmentScope::Words(word_ids),
                });
            }
        }
    }

    let word_index = *word_index_by_id.get(word_id)?;
    let word = words.get_mut(word_index)?;
    if hint.hint_type == "provider_speaker_index" {
        if let Some(speaker_index) = value.get("speaker_index").and_then(Value::as_f64) {
            word.speaker_index = Some(speaker_index);
            if let Some(channel) = value.get("channel").and_then(Value::as_f64) {
                word.channel = channel;
            }
        }
        return None;
    }
    if !is_speaker_assignment {
        return None;
    }
    let human_id = human_id?;
    let channel = channel_profile(word.channel);
    let scope = word
        .speaker_index
        .map_or(AssignmentScope::Channel(channel), |speaker_index| {
            AssignmentScope::ChannelSpeaker {
                channel,
                speaker_index,
            }
        });
    Some(IdentityAssignment { human_id, scope })
}

fn explicit_speaker_scope(value: &Value) -> Option<AssignmentScope> {
    if value.get("scope").and_then(Value::as_str) != Some("speaker") {
        return None;
    }
    let channel = value.get("channel").and_then(Value::as_f64)?;
    let channel_profile = match channel {
        0.0 => ChannelProfile::DirectMic,
        1.0 => ChannelProfile::RemoteParty,
        2.0 => ChannelProfile::MixedCapture,
        _ => return None,
    };
    match value.get("speaker_index") {
        Some(Value::Number(speaker_index)) => Some(AssignmentScope::ChannelSpeaker {
            channel: channel_profile,
            speaker_index: speaker_index.as_f64()?,
        }),
        Some(Value::Null) => Some(AssignmentScope::Channel(channel_profile)),
        _ => None,
    }
}

pub(super) fn resolve_scoped_word_human_ids(
    transcript: &RenderTranscript,
) -> OrderedMap<String, String> {
    let mut humans_by_word: OrderedMap<String, String> = OrderedMap::default();
    let mut humans_by_speaker: OrderedMap<String, String> = OrderedMap::default();
    for assignment in &transcript.assignments {
        if assignment.human_id.trim().is_empty() {
            continue;
        }
        match &assignment.scope {
            AssignmentScope::Words(word_ids) => {
                for word_id in word_ids {
                    humans_by_word.set(word_id.clone(), assignment.human_id.clone());
                }
            }
            AssignmentScope::ChannelSpeaker {
                channel,
                speaker_index,
            } => {
                humans_by_speaker.set(
                    format!(
                        "{}:{}",
                        channel_profile_number(*channel),
                        javascript_number_string(*speaker_index)
                    ),
                    assignment.human_id.clone(),
                );
            }
            AssignmentScope::Channel(_) => {}
        }
    }

    let mut result = OrderedMap::default();
    for word in &transcript.words {
        let human_id = humans_by_word.get(&word.id).cloned().or_else(|| {
            word.speaker_index.and_then(|speaker_index| {
                humans_by_speaker
                    .get(&format!(
                        "{}:{}",
                        channel_profile_number(channel_profile(word.channel)),
                        javascript_number_string(speaker_index)
                    ))
                    .cloned()
            })
        });
        if let Some(human_id) = human_id {
            result.set(word.id.clone(), human_id);
        }
    }
    result
}
