use std::{cmp::Ordering, collections::HashSet};

use serde::Serialize;
use serde_json::Value;

use crate::{FinalizedWord, StoredSpeakerHint, StoredTranscriptWord, batch_refine::json_number};

mod speaker_hints;

use speaker_hints::{
    is_segment_speaker_assignment_hint, is_speaker_scoped_assignment_hint,
    reconcile_segment_speaker_assignment_hint, to_storage_speaker_hint,
};

const MAX_SEGMENT_GAP_MS: f64 = 3000.0;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct StoredLiveTranscriptDelta {
    #[serde(default)]
    pub new_words: Vec<FinalizedWord>,
    #[serde(default)]
    pub replaced_ids: Vec<String>,
}

#[derive(Default)]
struct PendingWrite {
    words_by_id: Vec<PendingWordGroup>,
    replaced_root_ids: Vec<String>,
}

struct PendingWordGroup {
    id: String,
    words: Vec<FinalizedWord>,
    may_exist_in_persisted_base: bool,
}

pub fn coalesce_live_transcript_deltas(
    deltas: &[StoredLiveTranscriptDelta],
) -> StoredLiveTranscriptDelta {
    let mut pending = PendingWrite::default();
    for delta in deltas {
        merge_delta(&mut pending, delta);
    }

    StoredLiveTranscriptDelta {
        new_words: pending
            .words_by_id
            .into_iter()
            .flat_map(|group| group.words)
            .collect(),
        replaced_ids: pending.replaced_root_ids,
    }
}

fn merge_delta(pending: &mut PendingWrite, delta: &StoredLiveTranscriptDelta) {
    for replaced_id in &delta.replaced_ids {
        if let Some(replaced) = remove_pending_words(pending, replaced_id) {
            if replaced.may_exist_in_persisted_base {
                insert_set_value(&mut pending.replaced_root_ids, replaced_id.clone());
            }
        } else {
            insert_set_value(&mut pending.replaced_root_ids, replaced_id.clone());
        }
    }

    let mut next_words_by_id: Vec<(String, Vec<FinalizedWord>)> = Vec::new();
    for word in &delta.new_words {
        if let Some((_, words)) = next_words_by_id.iter_mut().find(|(id, _)| id == &word.id) {
            words.push(word.clone());
        } else {
            next_words_by_id.push((word.id.clone(), vec![word.clone()]));
        }
    }

    for (word_id, words) in next_words_by_id {
        let existing = remove_pending_words(pending, &word_id);
        let may_exist_in_persisted_base = existing
            .map(|group| group.may_exist_in_persisted_base)
            .unwrap_or(delta.replaced_ids.is_empty());
        pending.words_by_id.push(PendingWordGroup {
            id: word_id,
            words,
            may_exist_in_persisted_base,
        });
    }
}

fn remove_pending_words(pending: &mut PendingWrite, word_id: &str) -> Option<PendingWordGroup> {
    pending
        .words_by_id
        .iter()
        .position(|group| group.id == word_id)
        .map(|index| pending.words_by_id.remove(index))
}

fn insert_set_value(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

pub fn apply_live_transcript_delta(
    mut words: Vec<StoredTranscriptWord>,
    hints: Vec<StoredSpeakerHint>,
    delta: &StoredLiveTranscriptDelta,
) -> (Vec<StoredTranscriptWord>, Vec<StoredSpeakerHint>) {
    let previous_words = words.clone();
    let replaced_ids: HashSet<&str> = delta.replaced_ids.iter().map(String::as_str).collect();
    let new_words: Vec<StoredTranscriptWord> = delta
        .new_words
        .iter()
        .map(|word| StoredTranscriptWord {
            id: word.id.clone(),
            text: Some(word.text.clone()),
            start_ms: Some(word.start_ms as f64),
            end_ms: Some(word.end_ms as f64),
            channel: Some(word.channel as f64),
            speaker: None,
            metadata: None,
        })
        .collect();
    let new_word_ids: HashSet<String> = new_words.iter().map(|word| word.id.clone()).collect();

    words.retain(|word| {
        !replaced_ids.contains(word.id.as_str()) && !new_word_ids.contains(word.id.as_str())
    });
    words.extend(new_words);
    words.sort_by(|left, right| {
        compare_numbers(
            left.start_ms.unwrap_or_default(),
            right.start_ms.unwrap_or_default(),
        )
    });

    let mut next_hints = Vec::new();
    for hint in &hints {
        for reconciled_hint in reconcile_segment_speaker_assignment_hint(
            hint,
            &replaced_ids,
            &previous_words,
            &words,
            &hints,
            &delta.new_words,
        ) {
            if is_segment_speaker_assignment_hint(&reconciled_hint)
                || is_speaker_scoped_assignment_hint(&reconciled_hint)
            {
                next_hints.push(reconciled_hint);
                continue;
            }

            let word_id = reconciled_hint.word_id.as_deref().unwrap_or_default();
            if !replaced_ids.contains(word_id) && !new_word_ids.contains(word_id) {
                next_hints.push(reconciled_hint);
            }
        }
    }

    for word in &delta.new_words {
        if let Some(hint) = to_storage_speaker_hint(word) {
            next_hints.push(hint);
        }
    }
    next_hints.sort_by(|left, right| {
        left.word_id
            .as_deref()
            .unwrap_or_default()
            .cmp(right.word_id.as_deref().unwrap_or_default())
    });

    (words, next_hints)
}

pub fn materialize_live_transcript(
    words: Vec<StoredTranscriptWord>,
    hints: Vec<StoredSpeakerHint>,
    deltas: &[StoredLiveTranscriptDelta],
) -> (Vec<StoredTranscriptWord>, Vec<StoredSpeakerHint>) {
    if deltas.is_empty() {
        return (words, hints);
    }

    let delta = coalesce_live_transcript_deltas(deltas);
    apply_live_transcript_delta(words, hints, &delta)
}

fn compare_numbers(left: f64, right: f64) -> Ordering {
    left.partial_cmp(&right).unwrap_or(Ordering::Equal)
}

#[derive(Serialize)]
struct StoredWordJson<'a> {
    id: &'a str,
    text: &'a str,
    start_ms: NormalizedNumber,
    end_ms: NormalizedNumber,
    channel: NormalizedNumber,
    #[serde(skip_serializing_if = "Option::is_none")]
    speaker: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<&'a Value>,
}

struct NormalizedNumber(f64);

impl Serialize for NormalizedNumber {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        json_number(self.0).serialize(serializer)
    }
}

#[derive(Serialize)]
struct StoredHintJson<'a> {
    id: &'a str,
    word_id: &'a str,
    #[serde(rename = "type")]
    hint_type: &'a str,
    value: &'a Value,
}

pub fn serialize_batch_transcript_words(
    words: &[StoredTranscriptWord],
) -> Result<String, serde_json::Error> {
    let words: Vec<StoredWordJson<'_>> = words
        .iter()
        .map(|word| {
            let start_ms = word.start_ms.unwrap_or_default();
            StoredWordJson {
                id: &word.id,
                text: word.text.as_deref().unwrap_or_default(),
                start_ms: NormalizedNumber(start_ms),
                end_ms: NormalizedNumber(word.end_ms.unwrap_or(start_ms)),
                channel: NormalizedNumber(word.channel.unwrap_or_default()),
                speaker: word.speaker.as_deref(),
                metadata: word
                    .metadata
                    .as_ref()
                    .filter(|metadata| !metadata.is_null()),
            }
        })
        .collect();
    serde_json::to_string(&words)
}

pub fn serialize_batch_transcript_hints(
    hints: &[StoredSpeakerHint],
) -> Result<String, serde_json::Error> {
    let hints: Vec<StoredHintJson<'_>> = hints
        .iter()
        .map(|hint| StoredHintJson {
            id: &hint.id,
            word_id: hint.word_id.as_deref().unwrap_or_default(),
            hint_type: &hint.hint_type,
            value: &hint.value,
        })
        .collect();
    serde_json::to_string(&hints)
}

#[cfg(test)]
mod tests;
