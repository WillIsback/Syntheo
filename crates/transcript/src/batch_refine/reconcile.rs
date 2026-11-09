use serde_json::Value;

use super::model::{
    NumericKey, OrderedMap, RenderWord, SpeakerInterval, TargetWord, UserSegmentAssignmentValue,
    compare_numbers, has_timing, insert_set_value, json_number, parse_speaker_key,
    parse_string_hint_value,
};
use super::render::{build_render_transcript, resolve_scoped_word_human_ids};
use super::restore::speaker_keys_by_word_id;
use super::{
    BatchRefinementSource, MIN_REFINED_ASSIGNMENT_COVERAGE_RATIO,
    MIN_REFINED_SPEAKER_OVERLAP_RATIO, StoredSpeakerHint, StoredTranscriptWord,
};

pub fn reconcile_refined_speaker_clusters(
    source: &BatchRefinementSource,
    words: &[StoredTranscriptWord],
    hints: Vec<StoredSpeakerHint>,
) -> Vec<StoredSpeakerHint> {
    let source_speaker_keys = speaker_keys_by_word_id(&source.speaker_hints);
    let target_speaker_keys = speaker_keys_by_word_id(&hints);
    if source_speaker_keys.entries.is_empty() || target_speaker_keys.entries.is_empty() {
        return reconcile_refined_speaker_assignments(source, words, hints);
    }

    let mut source_intervals_by_channel: OrderedMap<NumericKey, Vec<SpeakerInterval>> =
        OrderedMap::default();
    for word in &source.words {
        let Some(speaker_key) = source_speaker_keys.get(&word.id) else {
            continue;
        };
        let start_ms = word.start_ms.unwrap_or(0.0);
        let end_ms = (start_ms + 1.0).max(word.end_ms.unwrap_or(start_ms));
        let channel_key = NumericKey::new(speaker_key.channel);
        if let Some(intervals) = source_intervals_by_channel.get_mut(&channel_key) {
            intervals.push(SpeakerInterval {
                speaker_key: speaker_key.key.clone(),
                start_ms,
                end_ms,
            });
        } else {
            source_intervals_by_channel.set(
                channel_key,
                vec![SpeakerInterval {
                    speaker_key: speaker_key.key.clone(),
                    start_ms,
                    end_ms,
                }],
            );
        }
    }
    for (_, intervals) in source_intervals_by_channel.entries.iter_mut() {
        intervals.sort_by(|left, right| compare_numbers(left.start_ms, right.start_ms));
    }

    let mut target_words = words
        .iter()
        .filter_map(|word| {
            let speaker_key = target_speaker_keys.get(&word.id)?;
            let start_ms = word.start_ms.unwrap_or(0.0);
            Some(TargetWord {
                speaker_key: speaker_key.key.clone(),
                channel: speaker_key.channel,
                start_ms,
                end_ms: (start_ms + 1.0).max(word.end_ms.unwrap_or(start_ms)),
            })
        })
        .collect::<Vec<_>>();
    target_words.sort_by(|left, right| {
        compare_numbers(left.channel, right.channel)
            .then_with(|| compare_numbers(left.start_ms, right.start_ms))
    });

    let mut cursors: OrderedMap<NumericKey, usize> = OrderedMap::default();
    let mut weights: OrderedMap<String, OrderedMap<String, f64>> = OrderedMap::default();
    for word in &target_words {
        let channel_key = NumericKey::new(word.channel);
        let Some(source_intervals) = source_intervals_by_channel.get(&channel_key) else {
            continue;
        };
        let mut cursor = cursors.get(&channel_key).copied().unwrap_or(0);
        while cursor < source_intervals.len() && source_intervals[cursor].end_ms <= word.start_ms {
            cursor += 1;
        }
        cursors.set(channel_key, cursor);

        for source in source_intervals
            .iter()
            .skip(cursor)
            .take_while(|source| source.start_ms < word.end_ms)
        {
            let overlap_ms = word.end_ms.min(source.end_ms) - word.start_ms.max(source.start_ms);
            if overlap_ms <= 0.0 {
                continue;
            }
            if !weights.contains_key(&word.speaker_key) {
                weights.set(word.speaker_key.clone(), OrderedMap::default());
            }
            let source_weights = weights
                .get_mut(&word.speaker_key)
                .expect("target weights were initialized");
            let total = source_weights
                .get(&source.speaker_key)
                .copied()
                .unwrap_or(0.0)
                + overlap_ms;
            source_weights.set(source.speaker_key.clone(), total);
        }
    }

    let mut source_speaker_by_target: OrderedMap<String, f64> = OrderedMap::default();
    for (target_speaker_key, source_weights) in weights.iter() {
        let mut candidates = source_weights
            .iter()
            .map(|(speaker_key, overlap_ms)| (speaker_key.clone(), *overlap_ms))
            .collect::<Vec<_>>();
        candidates.sort_by(|(left_key, left_weight), (right_key, right_weight)| {
            compare_numbers(*right_weight, *left_weight).then_with(|| left_key.cmp(right_key))
        });
        let total_overlap_ms = candidates.iter().map(|(_, overlap)| overlap).sum::<f64>();
        let Some((source_speaker_key, overlap_ms)) = candidates.first() else {
            continue;
        };
        let Some(source_speaker) = parse_speaker_key(source_speaker_key) else {
            continue;
        };
        if total_overlap_ms > 0.0
            && overlap_ms / total_overlap_ms >= MIN_REFINED_SPEAKER_OVERLAP_RATIO
        {
            source_speaker_by_target.set(target_speaker_key.clone(), source_speaker.speaker_index);
        }
    }

    let mut used_speaker_indices_by_channel: OrderedMap<NumericKey, Vec<f64>> =
        OrderedMap::default();
    for (target_speaker_key, speaker_index) in source_speaker_by_target.iter() {
        let Some(target_speaker) = parse_speaker_key(target_speaker_key) else {
            continue;
        };
        let channel_key = NumericKey::new(target_speaker.channel);
        if let Some(used_speaker_indices) = used_speaker_indices_by_channel.get_mut(&channel_key) {
            insert_set_value(used_speaker_indices, *speaker_index);
        } else {
            used_speaker_indices_by_channel.set(channel_key, vec![*speaker_index]);
        }
    }

    let mut unique_target_keys = Vec::new();
    for (_, speaker_key) in target_speaker_keys.iter() {
        insert_set_value(&mut unique_target_keys, speaker_key.key.clone());
    }
    let mut colliding_target_speakers = Vec::new();
    for target_speaker_key in unique_target_keys {
        if source_speaker_by_target.contains_key(&target_speaker_key) {
            continue;
        }
        let Some(target_speaker) = parse_speaker_key(&target_speaker_key) else {
            continue;
        };
        let channel_key = NumericKey::new(target_speaker.channel);
        let used_speaker_indices = used_speaker_indices_by_channel.get_mut(&channel_key);
        let Some(used_speaker_indices) = used_speaker_indices else {
            used_speaker_indices_by_channel.set(channel_key, vec![target_speaker.speaker_index]);
            continue;
        };
        if used_speaker_indices.contains(&target_speaker.speaker_index) {
            colliding_target_speakers.push((target_speaker_key, target_speaker.channel));
        } else {
            used_speaker_indices.push(target_speaker.speaker_index);
        }
    }

    for (speaker_key, channel) in colliding_target_speakers {
        let Some(used_speaker_indices) =
            used_speaker_indices_by_channel.get_mut(&NumericKey::new(channel))
        else {
            continue;
        };
        let mut speaker_index = used_speaker_indices
            .iter()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max)
            + 1.0;
        while used_speaker_indices.contains(&speaker_index) {
            speaker_index += 1.0;
        }
        used_speaker_indices.push(speaker_index);
        source_speaker_by_target.set(speaker_key, speaker_index);
    }

    let reconciled_provider_hints = hints
        .into_iter()
        .map(|mut hint| {
            if hint.hint_type != "provider_speaker_index"
                || hint.word_id.as_deref().is_none_or(str::is_empty)
            {
                return hint;
            }
            let Some(target_speaker_key) =
                target_speaker_keys.get(hint.word_id.as_ref().expect("word IDs were checked"))
            else {
                return hint;
            };
            let Some(speaker_index) = source_speaker_by_target.get(&target_speaker_key.key) else {
                return hint;
            };
            let Some(mut value) = parse_string_hint_value(&hint.value) else {
                return hint;
            };
            if let Value::Object(object) = &mut value {
                object.insert("speaker_index".to_string(), json_number(*speaker_index));
                hint.value = Value::String(value.to_string());
            }
            hint
        })
        .collect();
    reconcile_refined_speaker_assignments(source, words, reconciled_provider_hints)
}

fn reconcile_refined_speaker_assignments(
    source: &BatchRefinementSource,
    words: &[StoredTranscriptWord],
    hints: Vec<StoredSpeakerHint>,
) -> Vec<StoredSpeakerHint> {
    if !source
        .speaker_hints
        .iter()
        .any(|hint| hint.hint_type == "user_speaker_assignment")
    {
        return hints;
    }
    let previous_hints = source
        .speaker_hints
        .iter()
        .filter(|hint| hint.hint_type != "automatic_speaker_assignment")
        .cloned()
        .collect::<Vec<_>>();
    let Some(previous) = build_render_transcript(&source.words, &previous_hints) else {
        return hints;
    };
    let Some(next) = build_render_transcript(words, &hints) else {
        return hints;
    };

    let previous_humans = resolve_scoped_word_human_ids(&previous);
    let next_humans = resolve_scoped_word_human_ids(&next);
    let mut channels = Vec::new();
    for word in &next.words {
        insert_set_value(&mut channels, word.channel);
    }
    let mut word_ids_by_human: OrderedMap<String, Vec<String>> = OrderedMap::default();

    for channel in channels.iter().copied() {
        let mut candidates = previous
            .words
            .iter()
            .filter(|word| {
                has_timing(word)
                    && (word.channel == channel
                        || (channel == 2.0
                            && (word.channel == 0.0 || word.channel == 1.0)
                            && !channels.contains(&word.channel)))
            })
            .cloned()
            .collect::<Vec<_>>();
        candidates.sort_by(|left, right| compare_numbers(left.start_ms, right.start_ms));
        let mut targets = next
            .words
            .iter()
            .filter(|word| word.channel == channel && has_timing(word))
            .cloned()
            .collect::<Vec<_>>();
        targets.sort_by(|left, right| compare_numbers(left.start_ms, right.start_ms));
        let mut cursor = 0;
        let mut active = Vec::<RenderWord>::new();

        for word in targets {
            if next_humans.contains_key(&word.id) {
                continue;
            }
            while cursor < candidates.len() && candidates[cursor].start_ms < word.end_ms {
                active.push(candidates[cursor].clone());
                cursor += 1;
            }
            active.retain(|candidate| candidate.end_ms > word.start_ms);
            let mut human_id: Option<String> = None;
            let mut covered_ms = 0.0;
            let mut covered_until = word.start_ms;
            let mut ambiguous = false;

            for candidate in &active {
                let start = word.start_ms.max(candidate.start_ms);
                let end = word.end_ms.min(candidate.end_ms);
                if end <= start {
                    continue;
                }
                let Some(candidate_human) = previous_humans.get(&candidate.id) else {
                    ambiguous = true;
                    break;
                };
                if human_id
                    .as_ref()
                    .is_some_and(|existing| existing != candidate_human)
                {
                    ambiguous = true;
                    break;
                }
                human_id = Some(candidate_human.clone());
                covered_ms += (end - start.max(covered_until)).max(0.0);
                covered_until = covered_until.max(end);
            }

            let Some(human_id) = human_id else {
                continue;
            };
            if ambiguous
                || covered_ms / (word.end_ms - word.start_ms)
                    < MIN_REFINED_ASSIGNMENT_COVERAGE_RATIO
            {
                continue;
            }
            if let Some(word_ids) = word_ids_by_human.get_mut(&human_id) {
                word_ids.push(word.id);
            } else {
                word_ids_by_human.set(human_id, vec![word.id]);
            }
        }
    }

    let mut result = hints;
    for (human_id, word_ids) in word_ids_by_human.entries {
        let Some(first_word_id) = word_ids.first() else {
            continue;
        };
        let value = UserSegmentAssignmentValue {
            human_id: &human_id,
            scope: "segment",
            word_ids: &word_ids,
            extend_to_adjacent: false,
        };
        result.push(StoredSpeakerHint {
            id: format!("{first_word_id}:user_speaker_assignment:segment"),
            word_id: Some(first_word_id.clone()),
            hint_type: "user_speaker_assignment".to_string(),
            value: Value::String(
                serde_json::to_string(&value).expect("segment assignment serializes"),
            ),
        });
    }
    result
}
