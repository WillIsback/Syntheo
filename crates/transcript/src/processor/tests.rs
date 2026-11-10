use super::*;
use crate::types::RawWord;
use owhisper_interface::stream::{Alternatives, Channel, Metadata, ModelInfo, Word};

fn stream_response(
    index: usize,
    is_final: bool,
    metadata_extra: Option<HashMap<String, serde_json::Value>>,
) -> StreamResponse {
    let token = format!("word-{index}");
    let transcript = format!(" {token}");
    let start = index as f64 / 10.0;

    StreamResponse::TranscriptResponse {
        start,
        duration: 0.05,
        is_final,
        speech_final: is_final,
        from_finalize: false,
        channel: Channel {
            alternatives: vec![Alternatives {
                transcript,
                words: vec![Word {
                    word: token.clone(),
                    start,
                    end: start + 0.05,
                    confidence: 1.0,
                    speaker: None,
                    punctuated_word: Some(token),
                    language: None,
                }],
                confidence: 1.0,
                languages: vec![],
            }],
        },
        metadata: Metadata {
            request_id: "request".to_string(),
            model_info: ModelInfo {
                name: "model".to_string(),
                version: "1".to_string(),
                arch: "test".to_string(),
            },
            model_uuid: "uuid".to_string(),
            extra: metadata_extra,
        },
        channel_index: vec![0, 1],
    }
}

fn multi_word_stream_response(
    words: &[&str],
    is_final: bool,
    metadata_extra: Option<HashMap<String, serde_json::Value>>,
) -> StreamResponse {
    let transcript = format!(" {}", words.join(" "));
    let words = words
        .iter()
        .enumerate()
        .map(|(index, word)| {
            let start = index as f64 / 10.0;
            Word {
                word: (*word).to_string(),
                start,
                end: start + 0.05,
                confidence: 1.0,
                speaker: None,
                punctuated_word: Some((*word).to_string()),
                language: None,
            }
        })
        .collect::<Vec<_>>();

    StreamResponse::TranscriptResponse {
        start: 0.0,
        duration: words.len() as f64 / 10.0,
        is_final,
        speech_final: is_final,
        from_finalize: false,
        channel: Channel {
            alternatives: vec![Alternatives {
                transcript,
                words,
                confidence: 1.0,
                languages: vec![],
            }],
        },
        metadata: Metadata {
            request_id: "request".to_string(),
            model_info: ModelInfo {
                name: "model".to_string(),
                version: "1".to_string(),
                arch: "test".to_string(),
            },
            model_uuid: "uuid".to_string(),
            extra: metadata_extra,
        },
        channel_index: vec![0, 1],
    }
}

fn finalized_word(id: impl Into<String>, text: impl Into<String>) -> FinalizedWord {
    FinalizedWord {
        id: id.into(),
        text: text.into(),
        start_ms: 0,
        end_ms: 100,
        channel: 0,
        state: WordState::Final,
        speaker_index: None,
    }
}

#[test]
fn partial_snapshot_carries_speaker_index_on_words() {
    let mut processor = TranscriptProcessor::new();

    let ch0 = processor
        .channels
        .entry(0)
        .or_insert_with(ChannelState::new);
    ch0.apply_partial(
        vec![
            RawWord {
                text: " hello".to_string(),
                start_ms: 0,
                end_ms: 100,
                channel: 0,
                speaker: Some(4),
            },
            RawWord {
                text: " world".to_string(),
                start_ms: 100,
                end_ms: 200,
                channel: 0,
                speaker: None,
            },
        ],
        true,
    );

    let ch1 = processor
        .channels
        .entry(1)
        .or_insert_with(ChannelState::new);
    ch1.apply_partial(
        vec![RawWord {
            text: " remote".to_string(),
            start_ms: 0,
            end_ms: 100,
            channel: 1,
            speaker: Some(7),
        }],
        true,
    );

    let snapshot = processor.partial_snapshot();

    assert_eq!(snapshot.partials.len(), 3);
    assert_eq!(snapshot.partials[0].speaker_index, Some(4));
    assert_eq!(snapshot.partials[1].speaker_index, None);
    assert_eq!(snapshot.partials[2].speaker_index, Some(7));
}

#[test]
fn flush_can_discard_partials_without_losing_held_finals() {
    let mut processor = TranscriptProcessor::new().with_partial_finalization(false);
    let channel = processor
        .channels
        .entry(0)
        .or_insert_with(ChannelState::new);

    channel.apply_partial(
        vec![RawWord {
            text: " repeated".to_string(),
            start_ms: 0,
            end_ms: 100,
            channel: 0,
            speaker: None,
        }],
        false,
    );
    channel.apply_final(
        vec![RawWord {
            text: " final".to_string(),
            start_ms: 1_000,
            end_ms: 1_100,
            channel: 0,
            speaker: None,
        }],
        WordState::Final,
        false,
        true,
    );

    let delta = processor.flush();
    let text = delta
        .new_words
        .iter()
        .map(|word| word.text.as_str())
        .collect::<String>();

    assert_eq!(text, " final");
    assert!(delta.partials.is_empty());
}

#[test]
fn flush_can_commit_partials_when_live_finalization_is_disabled() {
    let mut processor = TranscriptProcessor::new()
        .with_partial_finalization(false)
        .with_flush_partial_finalization(true);
    let channel = processor
        .channels
        .entry(0)
        .or_insert_with(ChannelState::new);

    channel.apply_partial(
        vec![RawWord {
            text: " tail".to_string(),
            start_ms: 0,
            end_ms: 100,
            channel: 0,
            speaker: None,
        }],
        false,
    );

    let delta = processor.flush();
    let text = delta
        .new_words
        .iter()
        .map(|word| word.text.as_str())
        .collect::<String>();

    assert_eq!(text, " tail");
    assert!(delta.partials.is_empty());
}

#[test]
fn checkpoint_keeps_replayed_words_from_finalizing_twice() {
    let mut processor = TranscriptProcessor::new();
    let word = |text: &str, start_ms: i64, end_ms: i64| RawWord {
        text: text.to_string(),
        start_ms,
        end_ms,
        channel: 0,
        speaker: None,
    };
    let channel = processor
        .channels
        .entry(0)
        .or_insert_with(ChannelState::new);
    channel.apply_final(
        vec![word(" hello", 0, 400), word(" there", 400, 900)],
        WordState::Final,
        true,
        true,
    );
    channel.apply_partial(vec![word(" world", 900, 1_300)], true);

    let checkpoint = processor.checkpoint();
    assert_eq!(
        checkpoint
            .new_words
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>(),
        [" there", " world"],
        "the held word and the pending partial are delivered before the stream is replaced"
    );

    // The replacement stream replays the same audio and re-transcribes it with jittered
    // timing; only the speech after the checkpoint is new.
    let channel = processor.channels.get_mut(&0).expect("channel survives");
    let partial = channel.apply_partial(vec![word(" world", 930, 1_340)], true);
    assert!(partial.is_empty());
    let finals = channel.apply_final(
        vec![
            word(" world", 930, 1_340),
            word(" how", 1_340, 1_500),
            word(" are", 1_500, 1_700),
        ],
        WordState::Final,
        true,
        true,
    );
    assert_eq!(
        finals
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>(),
        [" how"]
    );
    assert_eq!(
        processor
            .flush()
            .new_words
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>(),
        [" are"]
    );
}

#[test]
fn no_final_stream_promotes_oldest_partials_without_losing_words() {
    let mut processor = TranscriptProcessor::new();
    let total_words = MAX_PARTIAL_WORDS + 200;
    let mut finalized = Vec::new();

    for index in 0..total_words {
        let response = stream_response(index, false, None);
        let delta = processor.process(&response).expect("partial delta");
        finalized.extend(delta.new_words);

        assert!(delta.partials.len() <= MAX_PARTIAL_WORDS);
        assert!(
            delta
                .partials
                .iter()
                .map(|word| word.text.len())
                .sum::<usize>()
                <= MAX_PARTIAL_TEXT_BYTES
        );
    }

    assert!(!finalized.is_empty());
    finalized.extend(processor.flush().new_words);
    finalized.sort_by_key(|word| word.start_ms);

    assert_eq!(finalized.len(), total_words);
    for (index, word) in finalized.iter().enumerate() {
        assert_eq!(word.text, format!(" word-{index}"));
        assert_eq!(word.start_ms, index as i64 * 100);
        assert_eq!(word.state, WordState::Final);
    }
}

#[test]
fn flush_aware_partial_overflow_preserves_all_words() {
    let mut processor = TranscriptProcessor::new()
        .with_partial_finalization(false)
        .with_flush_partial_finalization(true);
    let total_words = MAX_PARTIAL_WORDS + 200;
    let mut finalized = Vec::new();

    for index in 0..total_words {
        let response = stream_response(index, false, None);
        let delta = processor.process(&response).expect("partial delta");
        finalized.extend(delta.new_words);
        assert!(delta.partials.len() <= MAX_PARTIAL_WORDS);
    }

    finalized.extend(processor.flush().new_words);
    finalized.sort_by_key(|word| word.start_ms);

    assert_eq!(finalized.len(), total_words);
    for (index, word) in finalized.iter().enumerate() {
        assert_eq!(word.text, format!(" word-{index}"));
        assert_eq!(word.start_ms, index as i64 * 100);
        assert_eq!(word.state, WordState::Final);
    }
}

#[test]
fn preview_only_partial_overflow_is_discarded_not_persisted() {
    let mut processor = TranscriptProcessor::new()
        .with_partial_finalization(false)
        .with_flush_partial_finalization(false);
    let total_words = MAX_PARTIAL_WORDS + 200;
    let mut last_delta = None;

    for index in 0..total_words {
        let response = stream_response(index, false, None);
        let delta = processor.process(&response).expect("partial delta");
        assert!(delta.new_words.is_empty());
        assert!(delta.partials.len() <= MAX_PARTIAL_WORDS);
        assert!(
            delta
                .partials
                .iter()
                .map(|word| word.text.len())
                .sum::<usize>()
                <= MAX_PARTIAL_TEXT_BYTES
        );
        last_delta = Some(delta);
    }

    let partials = last_delta.unwrap().partials;
    assert_eq!(partials.len(), MAX_PARTIAL_WORDS);
    assert_eq!(
        partials.first().unwrap().text,
        format!(" word-{}", total_words - MAX_PARTIAL_WORDS)
    );
    assert!(processor.flush().new_words.is_empty());
}

#[test]
fn unresolved_corrections_expire_oldest_and_flush_as_final() {
    let mut processor = TranscriptProcessor::new();
    let job_count = MAX_PENDING_CORRECTION_JOBS + 10;
    let mut finalized_ids = HashSet::new();
    let mut latest_job_id = 0;

    for index in 0..job_count {
        let id = format!("word-{index}");
        let (job_id, delta) =
            processor.submit_correction(vec![finalized_word(&id, format!(" text-{index}"))]);
        latest_job_id = job_id;
        finalized_ids.extend(
            delta
                .new_words
                .into_iter()
                .filter(|word| word.state == WordState::Final)
                .map(|word| word.id),
        );

        assert!(processor.pending_corrections.len() <= MAX_PENDING_CORRECTION_JOBS);
        assert!(processor.pending_correction_words <= MAX_PENDING_CORRECTION_WORDS);
        assert!(processor.pending_correction_bytes <= MAX_PENDING_CORRECTION_BYTES);
    }

    assert_eq!(finalized_ids.len(), 10);

    let late = processor.apply_correction(1, vec![finalized_word("word-0", " corrected too late")]);
    assert!(late.is_empty());

    let latest_id = format!("word-{}", job_count - 1);
    let corrected = processor.apply_correction(
        latest_job_id,
        vec![finalized_word(&latest_id, " corrected")],
    );
    assert_eq!(corrected.replaced_ids, vec![latest_id.clone()]);
    assert_eq!(corrected.new_words.len(), 1);
    assert_eq!(corrected.new_words[0].text, " corrected");
    finalized_ids.insert(latest_id);

    let flush = processor.flush();
    assert!(
        flush
            .new_words
            .iter()
            .all(|word| word.state == WordState::Final)
    );
    finalized_ids.extend(flush.new_words.into_iter().map(|word| word.id));

    assert_eq!(finalized_ids.len(), job_count);
    assert!(processor.pending_corrections.is_empty());
    assert!(processor.pending_correction_order.is_empty());
    assert_eq!(processor.pending_correction_words, 0);
    assert_eq!(processor.pending_correction_bytes, 0);
}

#[test]
fn oversized_and_duplicate_correction_jobs_fall_back_to_originals() {
    let mut processor = TranscriptProcessor::new();
    let oversized_id = "x".repeat(MAX_PENDING_CORRECTION_BYTES + 1);
    let (_, oversized) = processor.submit_correction(vec![finalized_word(&oversized_id, " text")]);

    assert!(processor.pending_corrections.is_empty());
    assert_eq!(oversized.new_words.len(), 1);
    assert_eq!(oversized.new_words[0].id, oversized_id);
    assert_eq!(oversized.new_words[0].state, WordState::Final);
    assert_eq!(oversized.replaced_ids.len(), 1);

    let original = finalized_word("old", " original");
    let replacement = finalized_word("new", " replacement");
    assert!(processor.register_job(42, &[original]).words.is_empty());
    let displaced = processor.register_job(42, &[replacement]);

    assert_eq!(displaced.replaced_ids, vec!["old"]);
    assert_eq!(displaced.words.len(), 1);
    assert_eq!(displaced.words[0].id, "old");
    assert_eq!(displaced.words[0].state, WordState::Final);
    assert_eq!(processor.pending_corrections.len(), 1);
}

#[test]
fn unknown_cloud_correction_payload_is_ignored() {
    let mut processor = TranscriptProcessor::new();
    let metadata = HashMap::from([
        ("cloud_corrected".to_string(), serde_json::json!(true)),
        ("cloud_job_id".to_string(), serde_json::json!(999)),
    ]);

    assert!(
        processor
            .process(&stream_response(0, true, Some(metadata)))
            .is_none()
    );
    assert!(processor.channels.is_empty());
}

#[test]
fn ignores_new_channels_after_state_capacity_is_reached() {
    let mut processor = TranscriptProcessor::new();

    for channel in 0..MAX_CHANNEL_STATES {
        let mut response = stream_response(channel, false, None);
        let StreamResponse::TranscriptResponse { channel_index, .. } = &mut response else {
            unreachable!();
        };
        *channel_index = vec![channel as i32];
        assert!(processor.process(&response).is_some());
    }

    let mut overflow = stream_response(MAX_CHANNEL_STATES, false, None);
    let StreamResponse::TranscriptResponse { channel_index, .. } = &mut overflow else {
        unreachable!();
    };
    *channel_index = vec![MAX_CHANNEL_STATES as i32];

    assert!(processor.process(&overflow).is_none());
    assert_eq!(processor.channels.len(), MAX_CHANNEL_STATES);

    let existing = stream_response(MAX_CHANNEL_STATES + 1, false, None);
    assert!(processor.process(&existing).is_some());
    assert_eq!(processor.channels.len(), MAX_CHANNEL_STATES);
}

#[test]
fn stale_cloud_correction_promotes_originals_instead_of_deleting_them() {
    let mut processor = TranscriptProcessor::new();
    let handoff_metadata = HashMap::from([
        ("cloud_handoff".to_string(), serde_json::json!(true)),
        ("cloud_job_id".to_string(), serde_json::json!(42)),
    ]);
    let handoff = processor
        .process(&multi_word_stream_response(
            &["local-one", "local-two", "local-tail"],
            true,
            Some(handoff_metadata),
        ))
        .expect("handoff delta");
    let pending_ids = handoff
        .new_words
        .iter()
        .map(|word| word.id.clone())
        .collect::<Vec<_>>();

    assert_eq!(handoff.new_words.len(), 2);
    assert!(
        handoff
            .new_words
            .iter()
            .all(|word| word.state == WordState::Pending)
    );

    let correction_metadata = HashMap::from([
        ("cloud_corrected".to_string(), serde_json::json!(true)),
        ("cloud_job_id".to_string(), serde_json::json!(42)),
    ]);
    let correction = processor
        .process(&multi_word_stream_response(
            &["cloud-one", "cloud-two", "cloud-tail"],
            true,
            Some(correction_metadata),
        ))
        .expect("correction fallback delta");

    assert_eq!(correction.replaced_ids, pending_ids);
    assert_eq!(correction.new_words.len(), 2);
    assert_eq!(correction.new_words[0].text, " local-one");
    assert_eq!(correction.new_words[1].text, " local-two");
    assert!(
        correction
            .new_words
            .iter()
            .all(|word| word.state == WordState::Final)
    );
    assert!(processor.pending_corrections.is_empty());
}
