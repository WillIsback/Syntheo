use std::collections::HashMap;

use serde_json::Value;

use super::model::{
    OrderedMap, SpeakerKey, compare_numbers, insert_set_value, integral_number,
    javascript_number_string, json_number, parse_speaker_key, parse_string_hint_value,
};
use super::{
    MIN_REFINED_ASSIGNMENT_COVERAGE_RATIO, MIN_TRANSCRIPT_CHARACTER_LOSS,
    MIN_TRANSCRIPT_RETAINED_RATIO, NON_LETTER_OR_NUMBER, PUNCTUATION_OR_SEPARATOR,
    StoredSpeakerHint, StoredTranscriptWord,
};

pub(super) fn restore_refined_cluster_channels(
    previous: &[StoredTranscriptWord],
    mut words: Vec<StoredTranscriptWord>,
    hints: &[StoredSpeakerHint],
) -> Vec<StoredTranscriptWord> {
    let speakers = speaker_keys_by_word_id(hints);
    let mut source = previous.iter().collect::<Vec<_>>();
    source.sort_by(|a, b| compare_numbers(a.start_ms.unwrap_or(0.0), b.start_ms.unwrap_or(0.0)));
    let mut targets = words.iter().collect::<Vec<_>>();
    targets.sort_by(|a, b| compare_numbers(a.start_ms.unwrap_or(0.0), b.start_ms.unwrap_or(0.0)));
    let mut channels: HashMap<String, Option<f64>> = HashMap::new();
    let mut cursor = 0;

    for word in targets {
        let Some(speaker) = speakers
            .get(&word.id)
            .filter(|speaker| speaker.channel == 2.0)
        else {
            continue;
        };
        let start = word.start_ms.unwrap_or(0.0);
        let end = word.end_ms.unwrap_or(start);
        while cursor < source.len() && source[cursor].end_ms.unwrap_or(0.0) <= start {
            cursor += 1;
        }
        let mut channel = None;
        let mut covered_until = start;
        let mut covered = 0.0;
        let mut ambiguous = end <= start;
        for old in source[cursor..]
            .iter()
            .take_while(|old| old.start_ms.unwrap_or(0.0) < end)
        {
            let overlap_start = start.max(old.start_ms.unwrap_or(0.0));
            let overlap_end = end.min(old.end_ms.unwrap_or(0.0));
            if overlap_end <= overlap_start {
                continue;
            }
            if !matches!(old.channel, Some(0.0 | 1.0))
                || channel.is_some_and(|channel| Some(channel) != old.channel)
            {
                ambiguous = true;
                break;
            }
            channel = old.channel;
            covered += (overlap_end - covered_until.max(overlap_start)).max(0.0);
            covered_until = covered_until.max(overlap_end);
        }
        if ambiguous || covered < (end - start) * MIN_REFINED_ASSIGNMENT_COVERAGE_RATIO {
            channel = None;
        }
        channels
            .entry(speaker.key.clone())
            .and_modify(|existing| {
                if *existing != channel {
                    *existing = None;
                }
            })
            .or_insert(channel);
    }

    // Restore only whole, unambiguous clusters: per-word restoration fragments
    // a fresh speaker whenever the provider corrects text or changes timing.
    for (key, channel) in &mut channels {
        if let Some(restored_channel) = *channel
            && let Some(speaker) = parse_speaker_key(key)
            && speakers.iter().any(|(_, existing)| {
                existing.channel == restored_channel
                    && existing.speaker_index == speaker.speaker_index
            })
        {
            *channel = None;
        }
    }
    for word in &mut words {
        if word.channel == Some(2.0)
            && let Some(speaker) = speakers.get(&word.id)
            && let Some(Some(channel)) = channels.get(&speaker.key)
        {
            word.channel = Some(*channel);
        }
    }
    words
}

pub(super) fn restore_refined_source_channels(
    previous: &[StoredTranscriptWord],
    replacement: Vec<StoredTranscriptWord>,
) -> Vec<StoredTranscriptWord> {
    let mut original = previous
        .iter()
        .filter(|word| word.channel == Some(0.0) || word.channel == Some(1.0))
        .cloned()
        .collect::<Vec<_>>();
    original.sort_by(|left, right| {
        compare_numbers(left.start_ms.unwrap_or(0.0), right.start_ms.unwrap_or(0.0))
    });

    let mut cursor = 0;
    let mut last_start = f64::NEG_INFINITY;
    replacement
        .into_iter()
        .map(|mut word| {
            if word.channel != Some(2.0) {
                return word;
            }

            let start_ms = word.start_ms.unwrap_or(0.0);
            let end_ms = word.end_ms.unwrap_or(start_ms);
            let text = normalize_source_channel_text(word.text.as_deref().unwrap_or(""));
            if text.is_empty() || end_ms <= start_ms {
                return word;
            }
            if start_ms < last_start {
                cursor = 0;
            }
            last_start = start_ms;

            while cursor < original.len() && original[cursor].end_ms.unwrap_or(0.0) <= start_ms {
                cursor += 1;
            }

            let mut channels = Vec::new();
            let mut matched = false;
            for source in &original[cursor..] {
                let source_start = source.start_ms.unwrap_or(0.0);
                if source_start >= end_ms {
                    break;
                }
                let source_end = source.end_ms.unwrap_or(source_start);
                let overlap = end_ms.min(source_end) - start_ms.max(source_start);
                if overlap <= 0.0 {
                    continue;
                }
                let channel = source.channel.expect("source channels were filtered");
                insert_set_value(&mut channels, channel);
                if normalize_source_channel_text(source.text.as_deref().unwrap_or("")) == text
                    && overlap >= 0.8 * (end_ms - start_ms).max(source_end - source_start)
                {
                    matched = true;
                }
            }
            if matched && channels.len() == 1 {
                word.channel = channels.first().copied();
            }
            word
        })
        .collect()
}

pub(super) fn restore_refined_source_hints(
    words: &[StoredTranscriptWord],
    hints: Vec<StoredSpeakerHint>,
) -> Vec<StoredSpeakerHint> {
    let mut channels = OrderedMap::default();
    for word in words {
        channels.set(word.id.clone(), word.channel);
    }

    hints
        .into_iter()
        .map(|mut hint| {
            if hint.hint_type != "provider_speaker_index" {
                return hint;
            }
            let word_id = hint.word_id.as_deref().unwrap_or("");
            let Some(channel) = channels
                .get(&word_id.to_string())
                .copied()
                .flatten()
                .filter(|channel| *channel == 0.0 || *channel == 1.0)
            else {
                return hint;
            };
            let Some(mut value) = parse_string_hint_value(&hint.value) else {
                return hint;
            };
            if value.get("channel").and_then(Value::as_f64) != Some(2.0) {
                return hint;
            }
            if let Value::Object(object) = &mut value {
                object.insert("channel".to_string(), json_number(channel));
                hint.value = Value::String(value.to_string());
            }
            hint
        })
        .collect()
}

pub(super) fn is_transcript_truncated(
    previous: &[StoredTranscriptWord],
    replacement: &[StoredTranscriptWord],
) -> bool {
    let character_count = |words: &[StoredTranscriptWord]| {
        words
            .iter()
            .map(|word| {
                let text = word.text.as_deref().unwrap_or("");
                NON_LETTER_OR_NUMBER
                    .replace_all(text, "")
                    .encode_utf16()
                    .count()
            })
            .sum::<usize>()
    };
    let previous_length = character_count(previous);
    let replacement_length = character_count(replacement);
    previous_length.saturating_sub(replacement_length) >= MIN_TRANSCRIPT_CHARACTER_LOSS
        && (replacement_length as f64) < (previous_length as f64) * MIN_TRANSCRIPT_RETAINED_RATIO
}

fn normalize_source_channel_text(text: &str) -> String {
    let lowercased = text.trim().to_lowercase();
    PUNCTUATION_OR_SEPARATOR
        .replace_all(&lowercased, "")
        .into_owned()
}

pub(super) fn speaker_keys_by_word_id(
    hints: &[StoredSpeakerHint],
) -> OrderedMap<String, SpeakerKey> {
    let mut keys = OrderedMap::default();
    for hint in hints {
        if hint.hint_type != "provider_speaker_index"
            || hint.word_id.as_deref().is_none_or(str::is_empty)
        {
            continue;
        }
        let Some(value) = parse_string_hint_value(&hint.value) else {
            continue;
        };
        let Some(channel) = integral_number(value.get("channel")) else {
            continue;
        };
        let Some(speaker_index) = integral_number(value.get("speaker_index")) else {
            continue;
        };
        keys.set(
            hint.word_id.clone().expect("word IDs were checked"),
            SpeakerKey {
                channel,
                speaker_index,
                key: format!(
                    "{}:{}",
                    javascript_number_string(channel),
                    javascript_number_string(speaker_index)
                ),
            },
        );
    }
    keys
}
