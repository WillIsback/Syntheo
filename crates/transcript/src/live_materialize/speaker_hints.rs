use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;

use crate::{FinalizedWord, StoredSpeakerHint, StoredTranscriptWord};

use super::{MAX_SEGMENT_GAP_MS, insert_set_value};

#[derive(Clone, Copy)]
struct SpeakerSegmentKey {
    channel: f64,
    speaker_index: Option<f64>,
}

#[derive(Clone, Copy)]
struct WordRange {
    start_ms: f64,
    end_ms: f64,
}

pub(super) fn reconcile_segment_speaker_assignment_hint(
    hint: &StoredSpeakerHint,
    replaced_ids: &HashSet<&str>,
    previous_words: &[StoredTranscriptWord],
    next_words: &[StoredTranscriptWord],
    hints: &[StoredSpeakerHint],
    new_final_words: &[FinalizedWord],
) -> Vec<StoredSpeakerHint> {
    let Some((mut assignment_value, segment_word_ids)) = get_segment_speaker_assignment(hint)
    else {
        return vec![hint.clone()];
    };

    let extend_to_adjacent = assignment_value
        .get("extend_to_adjacent")
        .and_then(Value::as_bool)
        != Some(false);
    let next_word_ids = get_reconciled_segment_word_ids(
        &segment_word_ids,
        extend_to_adjacent,
        replaced_ids,
        previous_words,
        next_words,
        hints,
        new_final_words,
    );
    let hint_word_id = hint.word_id.as_deref().unwrap_or_default();
    let next_anchor_word_id = if replaced_ids.contains(hint_word_id) {
        next_word_ids.first().cloned()
    } else {
        Some(hint_word_id.to_string())
    };

    let Some(next_anchor_word_id) = next_anchor_word_id.filter(|_| !next_word_ids.is_empty())
    else {
        return Vec::new();
    };

    let Some(object) = assignment_value.as_object_mut() else {
        return Vec::new();
    };
    object.insert(
        "word_ids".to_string(),
        Value::Array(next_word_ids.into_iter().map(Value::String).collect()),
    );
    let value =
        serde_json::to_string(&assignment_value).expect("serializing a JSON value should not fail");

    vec![StoredSpeakerHint {
        id: format!("{next_anchor_word_id}:user_speaker_assignment:segment"),
        word_id: Some(next_anchor_word_id),
        hint_type: hint.hint_type.clone(),
        value: Value::String(value),
    }]
}

fn get_reconciled_segment_word_ids(
    segment_word_ids: &[String],
    extend_to_adjacent: bool,
    replaced_ids: &HashSet<&str>,
    previous_words: &[StoredTranscriptWord],
    next_words: &[StoredTranscriptWord],
    hints: &[StoredSpeakerHint],
    new_final_words: &[FinalizedWord],
) -> Vec<String> {
    let previous_words_by_id: HashMap<&str, &StoredTranscriptWord> = previous_words
        .iter()
        .map(|word| (word.id.as_str(), word))
        .collect();
    let next_words_by_id: HashMap<&str, &StoredTranscriptWord> = next_words
        .iter()
        .map(|word| (word.id.as_str(), word))
        .collect();
    let new_speaker_index_by_word_id: HashMap<&str, f64> = new_final_words
        .iter()
        .filter_map(|word| Some((word.id.as_str(), word.speaker_index? as f64)))
        .collect();
    let scoped_previous_words: Vec<&StoredTranscriptWord> = segment_word_ids
        .iter()
        .filter_map(|word_id| previous_words_by_id.get(word_id.as_str()).copied())
        .collect();
    let scoped_next_words: Vec<&StoredTranscriptWord> = segment_word_ids
        .iter()
        .filter_map(|word_id| next_words_by_id.get(word_id.as_str()).copied())
        .collect();

    let segment_key = if let Some(anchor_word) = scoped_previous_words.first() {
        get_speaker_segment_key(anchor_word, hints, &new_speaker_index_by_word_id)
    } else if let Some(anchor_word) = scoped_next_words.first() {
        get_speaker_segment_key(anchor_word, hints, &new_speaker_index_by_word_id)
    } else {
        return Vec::new();
    };

    let mut seed_word_ids: HashSet<String> = segment_word_ids
        .iter()
        .filter(|word_id| {
            !replaced_ids.contains(word_id.as_str())
                && next_words_by_id.contains_key(word_id.as_str())
        })
        .cloned()
        .collect();

    if segment_word_ids
        .iter()
        .any(|word_id| replaced_ids.contains(word_id.as_str()))
    {
        let previous_range = get_word_range(&scoped_previous_words);
        for word in new_final_words {
            let in_replaced_overlap = scoped_previous_words.iter().any(|previous| {
                replaced_ids.contains(previous.id.as_str())
                    && previous.end_ms.unwrap_or_default().min(word.end_ms as f64)
                        > previous
                            .start_ms
                            .unwrap_or_default()
                            .max(word.start_ms as f64)
            });
            if is_same_speaker_segment(word, segment_key, hints, &new_speaker_index_by_word_id)
                && if !extend_to_adjacent || segment_key.speaker_index.is_none() {
                    in_replaced_overlap
                } else {
                    previous_range.is_some_and(|range| is_within_segment_range(word, range))
                }
            {
                seed_word_ids.insert(word.id.clone());
            }
        }
    }

    if seed_word_ids.is_empty() {
        return Vec::new();
    }
    if !extend_to_adjacent || segment_key.speaker_index.is_none() {
        return next_words
            .iter()
            .filter(|word| seed_word_ids.contains(&word.id))
            .map(|word| word.id.clone())
            .collect();
    }

    let seed_indexes: Vec<usize> = next_words
        .iter()
        .enumerate()
        .filter_map(|(index, word)| seed_word_ids.contains(&word.id).then_some(index))
        .collect();
    let Some(mut start_index) = seed_indexes.iter().min().copied() else {
        return Vec::new();
    };
    let Some(mut end_index) = seed_indexes.iter().max().copied() else {
        return Vec::new();
    };

    while start_index > 0
        && can_merge_segment_words(
            &next_words[start_index - 1],
            &next_words[start_index],
            segment_key,
            hints,
            &new_speaker_index_by_word_id,
        )
    {
        start_index -= 1;
    }

    while end_index < next_words.len() - 1
        && can_merge_segment_words(
            &next_words[end_index],
            &next_words[end_index + 1],
            segment_key,
            hints,
            &new_speaker_index_by_word_id,
        )
    {
        end_index += 1;
    }

    let mut word_ids = Vec::new();
    for word in next_words[start_index..=end_index].iter().filter(|word| {
        is_same_speaker_segment_stored(word, segment_key, hints, &new_speaker_index_by_word_id)
    }) {
        insert_set_value(&mut word_ids, word.id.clone());
    }
    word_ids
}

fn get_speaker_segment_key(
    word: &StoredTranscriptWord,
    hints: &[StoredSpeakerHint],
    new_speaker_index_by_word_id: &HashMap<&str, f64>,
) -> SpeakerSegmentKey {
    SpeakerSegmentKey {
        channel: word.channel.unwrap_or_default(),
        speaker_index: new_speaker_index_by_word_id
            .get(word.id.as_str())
            .copied()
            .or_else(|| find_speaker_index_for_word(hints, &word.id)),
    }
}

fn is_same_speaker_segment(
    word: &FinalizedWord,
    key: SpeakerSegmentKey,
    hints: &[StoredSpeakerHint],
    new_speaker_index_by_word_id: &HashMap<&str, f64>,
) -> bool {
    let word_key = SpeakerSegmentKey {
        channel: word.channel as f64,
        speaker_index: new_speaker_index_by_word_id
            .get(word.id.as_str())
            .copied()
            .or_else(|| find_speaker_index_for_word(hints, &word.id)),
    };
    word_key.channel == key.channel && word_key.speaker_index == key.speaker_index
}

fn is_same_speaker_segment_stored(
    word: &StoredTranscriptWord,
    key: SpeakerSegmentKey,
    hints: &[StoredSpeakerHint],
    new_speaker_index_by_word_id: &HashMap<&str, f64>,
) -> bool {
    let word_key = get_speaker_segment_key(word, hints, new_speaker_index_by_word_id);
    word_key.channel == key.channel && word_key.speaker_index == key.speaker_index
}

fn can_merge_segment_words(
    left: &StoredTranscriptWord,
    right: &StoredTranscriptWord,
    key: SpeakerSegmentKey,
    hints: &[StoredSpeakerHint],
    new_speaker_index_by_word_id: &HashMap<&str, f64>,
) -> bool {
    is_same_speaker_segment_stored(left, key, hints, new_speaker_index_by_word_id)
        && is_same_speaker_segment_stored(right, key, hints, new_speaker_index_by_word_id)
        && right.start_ms.unwrap_or_default() - left.end_ms.unwrap_or_default()
            <= MAX_SEGMENT_GAP_MS
}

fn get_word_range(words: &[&StoredTranscriptWord]) -> Option<WordRange> {
    let first = words.first()?;
    Some(words.iter().skip(1).fold(
        WordRange {
            start_ms: first.start_ms.unwrap_or_default(),
            end_ms: first.end_ms.unwrap_or_default(),
        },
        |range, word| WordRange {
            start_ms: range.start_ms.min(word.start_ms.unwrap_or_default()),
            end_ms: range.end_ms.max(word.end_ms.unwrap_or_default()),
        },
    ))
}

fn is_within_segment_range(word: &FinalizedWord, range: WordRange) -> bool {
    (word.start_ms as f64) <= range.end_ms + MAX_SEGMENT_GAP_MS
        && (word.end_ms as f64) >= range.start_ms - MAX_SEGMENT_GAP_MS
}

pub(super) fn is_segment_speaker_assignment_hint(hint: &StoredSpeakerHint) -> bool {
    get_segment_speaker_assignment(hint).is_some()
}

pub(super) fn is_speaker_scoped_assignment_hint(hint: &StoredSpeakerHint) -> bool {
    if hint.hint_type != "automatic_speaker_assignment"
        && hint.hint_type != "user_speaker_assignment"
    {
        return false;
    }

    let Some(value) = parse_hint_value(&hint.value) else {
        return false;
    };
    let Some(object) = value.as_object() else {
        return false;
    };
    let channel = object.get("channel").and_then(Value::as_f64);
    let speaker_index = object.get("speaker_index");
    object.get("scope").and_then(Value::as_str) == Some("speaker")
        && channel.is_some_and(|channel| channel == 0.0 || channel == 1.0 || channel == 2.0)
        && speaker_index.is_some_and(|value| value.is_null() || value.is_number())
}

fn get_segment_speaker_assignment(hint: &StoredSpeakerHint) -> Option<(Value, Vec<String>)> {
    if hint.hint_type != "user_speaker_assignment" {
        return None;
    }
    let value = parse_hint_value(&hint.value)?;
    let object = value.as_object()?;
    if object.get("scope").and_then(Value::as_str) != Some("segment") {
        return None;
    }
    let word_ids = object.get("word_ids")?.as_array()?;

    let unique_word_ids = get_unique_word_ids(word_ids);
    Some((value, unique_word_ids))
}

fn get_unique_word_ids(word_ids: &[Value]) -> Vec<String> {
    let mut unique = Vec::new();
    for word_id in word_ids {
        if let Some(word_id) = word_id.as_str().filter(|word_id| !word_id.is_empty()) {
            insert_set_value(&mut unique, word_id.to_string());
        }
    }
    unique
}

fn find_speaker_index_for_word(hints: &[StoredSpeakerHint], word_id: &str) -> Option<f64> {
    hints.iter().rev().find_map(|hint| {
        if hint.hint_type != "provider_speaker_index" || hint.word_id.as_deref() != Some(word_id) {
            return None;
        }
        let value = parse_hint_value(&hint.value)?;
        value.as_object()?.get("speaker_index")?.as_f64()
    })
}

fn parse_hint_value(value: &Value) -> Option<Value> {
    match value {
        Value::String(value) => serde_json::from_str(value).ok(),
        value => Some(value.clone()),
    }
}

pub(super) fn to_storage_speaker_hint(word: &FinalizedWord) -> Option<StoredSpeakerHint> {
    let speaker_index = word.speaker_index?;
    #[derive(Serialize)]
    struct ProviderSpeakerIndex {
        channel: i32,
        speaker_index: i32,
    }

    let value = serde_json::to_string(&ProviderSpeakerIndex {
        channel: word.channel,
        speaker_index,
    })
    .expect("serializing a provider speaker index should not fail");
    Some(StoredSpeakerHint {
        id: format!("{}:provider_speaker_index", word.id),
        word_id: Some(word.id.clone()),
        hint_type: "provider_speaker_index".to_string(),
        value: Value::String(value),
    })
}
