use super::model::parse_string_hint_value;
use super::*;
use crate::{ChannelProfile, IdentityScope};

fn word(id: &str, start_ms: f64, end_ms: f64, channel: f64) -> StoredTranscriptWord {
    StoredTranscriptWord {
        id: id.to_string(),
        text: Some(id.to_string()),
        start_ms: Some(start_ms),
        end_ms: Some(end_ms),
        channel: Some(channel),
        speaker: None,
        metadata: None,
    }
}

fn hint(id: &str, word_id: Option<&str>, hint_type: &str, value: Value) -> StoredSpeakerHint {
    StoredSpeakerHint {
        id: id.to_string(),
        word_id: word_id.map(str::to_owned),
        hint_type: hint_type.to_string(),
        value: Value::String(value.to_string()),
    }
}

fn object_hint(
    id: &str,
    word_id: Option<&str>,
    hint_type: &str,
    value: Value,
) -> StoredSpeakerHint {
    StoredSpeakerHint {
        id: id.to_string(),
        word_id: word_id.map(str::to_owned),
        hint_type: hint_type.to_string(),
        value,
    }
}

fn provider(word: &StoredTranscriptWord, speaker_index: i64) -> StoredSpeakerHint {
    hint(
        &format!("{}:provider_speaker_index", word.id),
        Some(&word.id),
        "provider_speaker_index",
        serde_json::json!({
            "channel": word.channel.unwrap_or(0.0),
            "speaker_index": speaker_index,
        }),
    )
}

fn assignment(mut value: Value) -> StoredSpeakerHint {
    let Value::Object(object) = &mut value else {
        panic!("assignment value must be an object");
    };
    object
        .entry("human_id")
        .or_insert_with(|| Value::String("alice".to_string()));
    hint(
        "old-a:user_speaker_assignment",
        Some("old-a"),
        "user_speaker_assignment",
        value,
    )
}

fn source(
    words: Vec<StoredTranscriptWord>,
    speaker_hints: Vec<StoredSpeakerHint>,
) -> BatchRefinementSource {
    BatchRefinementSource {
        id: "live-transcript".to_string(),
        started_at: 0.0,
        words,
        speaker_hints,
    }
}

fn speaker_value(hint: &StoredSpeakerHint) -> Value {
    parse_string_hint_value(&hint.value).expect("speaker hint contains JSON")
}

fn user_assignments(
    source_words: Vec<StoredTranscriptWord>,
    source_hints: Vec<StoredSpeakerHint>,
    words: Vec<StoredTranscriptWord>,
    hints: Vec<StoredSpeakerHint>,
) -> Vec<Value> {
    let result =
        reconcile_refined_speaker_clusters(&source(source_words, source_hints), &words, hints);
    result
        .into_iter()
        .filter(|hint| hint.hint_type == "user_speaker_assignment")
        .map(|hint| {
            let mut value = speaker_value(&hint);
            let Value::Object(object) = &mut value else {
                panic!("generated assignment must be an object");
            };
            assert_eq!(
                object.remove("extend_to_adjacent"),
                Some(Value::Bool(false))
            );
            object.insert(
                "word_id".to_string(),
                hint.word_id.map_or(Value::Null, Value::String),
            );
            value
        })
        .collect()
}

fn full_speaker() -> StoredSpeakerHint {
    assignment(serde_json::json!({
        "scope": "speaker",
        "channel": 1,
        "speaker_index": 0,
    }))
}

#[test]
fn render_input_from_stored_applies_provider_and_user_speaker_hints() {
    let mut stored_word = word("word-1", 10.4, 20.6, 0.0);
    stored_word.text = Some("hello".to_string());
    let mut untimed_word = word("untimed", 30.0, 40.0, 0.0);
    untimed_word.start_ms = None;
    let rendered = render_input_from_stored(
        Some(123),
        &[stored_word, untimed_word],
        &[
            hint(
                "word-1:provider_speaker_index",
                Some("word-1"),
                "provider_speaker_index",
                serde_json::json!({"channel": 1, "speaker_index": 2.6}),
            ),
            hint(
                "word-1:user_speaker_assignment",
                Some("word-1"),
                "user_speaker_assignment",
                serde_json::json!({"human_id": "alice"}),
            ),
        ],
    )
    .unwrap();

    assert_eq!(rendered.started_at, Some(123));
    assert_eq!(rendered.words.len(), 1);
    assert_eq!(rendered.words[0].id, "word-1");
    assert_eq!(rendered.words[0].text, "hello");
    assert_eq!(rendered.words[0].start_ms, 10);
    assert_eq!(rendered.words[0].end_ms, 21);
    assert_eq!(rendered.words[0].channel, 1);
    assert_eq!(rendered.words[0].speaker_index, Some(3));
    assert_eq!(
        rendered.assignments,
        vec![crate::IdentityAssignment {
            human_id: "alice".to_string(),
            scope: IdentityScope::ChannelSpeaker {
                channel: ChannelProfile::RemoteParty,
                speaker_index: 3,
            },
        }]
    );
}

fn current_request(
    words: Vec<StoredTranscriptWord>,
    hints: Vec<StoredSpeakerHint>,
    previous_transcripts: Vec<BatchRefinementSource>,
    audio_offset_ms: f64,
    replace_transcript_id: Option<&str>,
) -> BatchRefinementRequest {
    BatchRefinementRequest {
        words,
        hints,
        promotion: BatchTranscriptPromotion::CurrentCapture {
            audio_offset_ms,
            replace_transcript_id: replace_transcript_id.map(str::to_owned),
            started_at: 123_000.0,
        },
        previous_transcripts,
    }
}

fn ready(
    outcome: BatchRefinementOutcome,
) -> (
    Vec<StoredTranscriptWord>,
    Vec<StoredSpeakerHint>,
    bool,
    Option<String>,
    Option<f64>,
) {
    let BatchRefinementOutcome::Ready {
        words,
        speaker_hints,
        replace_session,
        replace_transcript_id,
        started_at,
    } = outcome
    else {
        panic!("expected ready outcome");
    };
    (
        words,
        speaker_hints,
        replace_session,
        replace_transcript_id,
        started_at,
    )
}

#[test]
fn collapses_split_batch_clusters_onto_dominant_live_clusters() {
    let source_words = vec![
        word("live-lex-1", 0.0, 100.0, 1.0),
        word("live-george-1", 100.0, 200.0, 1.0),
        word("live-lex-2", 200.0, 300.0, 1.0),
        word("live-george-2", 300.0, 400.0, 1.0),
    ];
    let source_hints = source_words
        .iter()
        .enumerate()
        .map(|(index, word)| provider(word, if index % 2 == 0 { 0 } else { 1 }))
        .collect();
    let words = vec![
        word("batch-lex-primary", 0.0, 100.0, 1.0),
        word("batch-george-primary", 100.0, 200.0, 1.0),
        word("batch-lex-split", 200.0, 300.0, 1.0),
        word("batch-george-split", 300.0, 400.0, 1.0),
    ];
    let hints = words
        .iter()
        .enumerate()
        .map(|(index, word)| provider(word, index as i64))
        .collect::<Vec<_>>();

    let result =
        reconcile_refined_speaker_clusters(&source(source_words, source_hints), &words, hints);

    assert_eq!(
        result
            .iter()
            .map(|hint| speaker_value(hint)["speaker_index"]
                .as_i64()
                .expect("speaker index is an integer"))
            .collect::<Vec<_>>(),
        [0, 1, 0, 1]
    );
}

#[test]
fn reanchors_manual_names_to_validated_replacement_words_on_channels_one_and_two() {
    for channel in [1.0, 2.0] {
        let source_word = word("old-a", 0.0, 100.0, 1.0);
        let next_word = word("new-a", 0.0, 100.0, channel);
        assert_eq!(
            user_assignments(
                vec![source_word.clone()],
                vec![provider(&source_word, 0), full_speaker()],
                vec![next_word.clone()],
                vec![provider(&next_word, 7)],
            ),
            [serde_json::json!({
                "word_id": "new-a",
                "human_id": "alice",
                "scope": "segment",
                "word_ids": ["new-a"],
            })]
        );
    }
}

#[test]
fn does_not_carry_manual_names_without_validated_overlap_or_coverage() {
    let source_word = word("old-a", 0.0, 100.0, 1.0);
    let next_word = word("new-a", 200.0, 300.0, 1.0);
    assert!(
        user_assignments(
            vec![source_word.clone()],
            vec![provider(&source_word, 0), full_speaker()],
            vec![next_word.clone()],
            vec![provider(&next_word, 0)],
        )
        .is_empty()
    );

    let source_words = vec![
        word("old-a", 0.0, 100.0, 1.0),
        word("old-b", 100.0, 200.0, 1.0),
    ];
    let next_word = word("new-ab", 0.0, 200.0, 1.0);
    assert!(
        user_assignments(
            source_words.clone(),
            vec![
                provider(&source_words[0], 0),
                provider(&source_words[1], 1),
                full_speaker(),
            ],
            vec![next_word.clone()],
            vec![provider(&next_word, 0)],
        )
        .is_empty()
    );

    let source_word = word("old-a", 0.0, 100.0, 1.0);
    let next_word = word("new-a", 0.0, 1_000.0, 1.0);
    assert!(
        user_assignments(
            vec![source_word.clone()],
            vec![provider(&source_word, 0), full_speaker()],
            vec![next_word.clone()],
            vec![provider(&next_word, 0)],
        )
        .is_empty()
    );
}

#[test]
fn downmixing_does_not_merge_simultaneous_speakers_but_keeps_stereo_channels_separate() {
    let source_words = vec![word("old-a", 0.0, 100.0, 1.0), word("mic", 0.0, 100.0, 0.0)];
    let source_hints = vec![
        provider(&source_words[0], 0),
        provider(&source_words[1], 0),
        full_speaker(),
    ];
    let mixed = word("mixed", 0.0, 100.0, 2.0);
    assert!(
        user_assignments(
            source_words.clone(),
            source_hints.clone(),
            vec![mixed.clone()],
            vec![provider(&mixed, 0)],
        )
        .is_empty()
    );

    let remote = word("remote", 0.0, 100.0, 1.0);
    assert_eq!(
        user_assignments(
            source_words,
            source_hints,
            vec![remote.clone()],
            vec![provider(&remote, 0)],
        ),
        [serde_json::json!({
            "word_id": "remote",
            "human_id": "alice",
            "scope": "segment",
            "word_ids": ["remote"],
        })]
    );
}

#[test]
fn remaps_segment_overrides_to_replacement_word_ids_without_extending_them() {
    let source_words = vec![
        word("old-a", 0.0, 100.0, 1.0),
        word("old-b", 100.0, 200.0, 1.0),
    ];
    let next_words = vec![
        word("new-a", 0.0, 50.0, 1.0),
        word("new-b", 50.0, 100.0, 1.0),
        word("new-c", 100.0, 200.0, 1.0),
    ];
    assert_eq!(
        user_assignments(
            source_words,
            vec![assignment(serde_json::json!({
                "scope": "segment",
                "word_ids": ["old-a"],
            }))],
            next_words,
            vec![],
        ),
        [serde_json::json!({
            "word_id": "new-a",
            "human_id": "alice",
            "scope": "segment",
            "word_ids": ["new-a", "new-b"],
        })]
    );
}

#[test]
fn keeps_segment_overrides_ahead_of_full_speaker_names() {
    let source_words = vec![
        word("old-a", 0.0, 100.0, 1.0),
        word("old-b", 100.0, 200.0, 1.0),
    ];
    let next_words = vec![
        word("new-a", 0.0, 100.0, 1.0),
        word("new-b", 100.0, 200.0, 1.0),
    ];
    let mut hints = source_words
        .iter()
        .map(|word| provider(word, 0))
        .collect::<Vec<_>>();
    hints.push(assignment(serde_json::json!({
        "human_id": "bob",
        "scope": "segment",
        "word_ids": ["old-b"],
    })));
    hints.push(full_speaker());
    assert_eq!(
        user_assignments(
            source_words,
            hints,
            next_words.clone(),
            next_words.iter().map(|word| provider(word, 0)).collect(),
        ),
        [
            serde_json::json!({
                "word_id": "new-a",
                "human_id": "alice",
                "scope": "segment",
                "word_ids": ["new-a"],
            }),
            serde_json::json!({
                "word_id": "new-b",
                "human_id": "bob",
                "scope": "segment",
                "word_ids": ["new-b"],
            }),
        ]
    );
}

#[test]
fn ignores_legacy_mixed_channel_identity_hints() {
    let source_word = word("old-a", 0.0, 100.0, 2.0);
    let next_word = word("new-a", 0.0, 100.0, 2.0);
    assert!(
        user_assignments(
            vec![source_word],
            vec![assignment(serde_json::json!({}))],
            vec![next_word],
            vec![],
        )
        .is_empty()
    );
}

#[test]
fn does_not_carry_legacy_inferred_identities_into_refined_captures() {
    let mut source_word = word("live-word", 100.0, 500.0, 1.0);
    source_word.text = Some("answer".to_string());
    let mut replacement_word = word("batch-word", 60_100.0, 60_500.0, 1.0);
    replacement_word.text = Some("answer".to_string());
    let source = BatchRefinementSource {
        id: "live-current".to_string(),
        started_at: 99_000.0,
        words: vec![source_word.clone()],
        speaker_hints: vec![
            provider(&source_word, 0),
            hint(
                "live-auto-assignment",
                Some("live-word"),
                "automatic_speaker_assignment",
                serde_json::json!({
                    "human_id": "human-1",
                    "confidence": 0.93,
                    "source": "enhance",
                }),
            ),
        ],
    };

    let (_, speaker_hints, _, _, _) = ready(refine_batch_transcript(current_request(
        vec![replacement_word.clone()],
        vec![provider(&replacement_word, 3)],
        vec![source],
        60_000.0,
        Some("live-current"),
    )));

    assert_eq!(speaker_hints.len(), 1);
    assert_eq!(speaker_hints[0].hint_type, "provider_speaker_index");
    assert_eq!(speaker_value(&speaker_hints[0])["speaker_index"], 0);
}

#[test]
fn keeps_ambiguous_batch_clusters_unchanged() {
    let source_words = vec![
        word("live-a", 0.0, 100.0, 1.0),
        word("live-b", 100.0, 200.0, 1.0),
    ];
    let source_hints = vec![provider(&source_words[0], 0), provider(&source_words[1], 1)];
    let words = vec![word("batch-ambiguous", 0.0, 200.0, 1.0)];
    let hints = vec![provider(&words[0], 4)];
    let result =
        reconcile_refined_speaker_clusters(&source(source_words, source_hints), &words, hints);
    assert_eq!(speaker_value(&result[0])["speaker_index"], 4);
}

#[test]
fn moves_an_unmapped_batch_cluster_that_collides_with_a_live_cluster() {
    let source_word = word("live-speaker", 0.0, 100.0, 1.0);
    let words = vec![
        word("batch-mapped", 0.0, 100.0, 1.0),
        word("batch-unmapped", 200.0, 300.0, 1.0),
    ];
    let result = reconcile_refined_speaker_clusters(
        &source(vec![source_word.clone()], vec![provider(&source_word, 1)]),
        &words,
        vec![provider(&words[0], 0), provider(&words[1], 1)],
    );
    assert_eq!(
        result
            .iter()
            .map(|hint| speaker_value(hint)["speaker_index"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        [1, 2]
    );
}

#[test]
fn assigns_colliding_batch_clusters_in_target_hint_insertion_order() {
    let source_words = vec![
        word("live-one", 0.0, 100.0, 1.0),
        word("live-two", 100.0, 200.0, 1.0),
    ];
    let words = vec![
        word("mapped-one", 0.0, 100.0, 1.0),
        word("mapped-two", 100.0, 200.0, 1.0),
        word("collision-one", 300.0, 400.0, 1.0),
        word("collision-two", 400.0, 500.0, 1.0),
    ];
    let hints = vec![
        provider(&words[0], 0),
        provider(&words[1], 3),
        provider(&words[3], 2),
        provider(&words[2], 1),
    ];
    let result = reconcile_refined_speaker_clusters(
        &source(
            source_words.clone(),
            vec![provider(&source_words[0], 1), provider(&source_words[1], 2)],
        ),
        &words,
        hints,
    );
    assert_eq!(
        result
            .iter()
            .map(|hint| speaker_value(hint)["speaker_index"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        [1, 2, 3, 4]
    );
}

#[test]
fn whole_session_retranscription_restores_owner_without_splitting_fresh_clusters() {
    for (second_channel, second_start, restored_channel, label) in [
        (0.0, 100.0, 0.0, "John"),
        (1.0, 100.0, 2.0, "Speaker 1"),
        (2.0, 100.0, 2.0, "Speaker 1"),
        (0.0, 300.0, 2.0, "Speaker 1"),
    ] {
        let previous = vec![
            word("old-a", 0.0, 100.0, 0.0),
            word("old-b", 100.0, 200.0, second_channel),
        ];
        let replacement = vec![
            StoredTranscriptWord {
                text: previous[0].text.clone(),
                ..word("new-a", 0.0, 100.0, 2.0)
            },
            StoredTranscriptWord {
                text: Some("corrected".to_string()),
                ..word("new-b", second_start, second_start + 100.0, 2.0)
            },
        ];
        let hints = replacement.iter().map(|word| provider(word, 7)).collect();
        let (words, hints, _, _, _) = ready(refine_batch_transcript(BatchRefinementRequest {
            words: replacement,
            hints,
            promotion: BatchTranscriptPromotion::WholeSession,
            previous_transcripts: vec![source(previous, vec![])],
        }));

        assert!(
            words
                .iter()
                .all(|word| word.channel == Some(restored_channel))
        );
        assert!(hints.iter().all(|hint| {
            let value = speaker_value(hint);
            value["channel"] == restored_channel && value["speaker_index"] == 7
        }));
        let rendered = crate::render_transcript_segments(crate::RenderTranscriptRequest {
            transcripts: vec![render_input_from_stored(Some(0), &words, &hints).unwrap()],
            participant_human_ids: vec![],
            self_human_id: Some("owner".to_string()),
            humans: vec![crate::RenderTranscriptHuman {
                human_id: "owner".to_string(),
                name: "John".to_string(),
            }],
            speaker_context: None,
            preview: None,
        });
        assert_eq!(rendered.len(), 1);
        assert_eq!(rendered[0].speaker_label, label);
        assert_eq!(rendered[0].words.len(), 2);
        assert_eq!(rendered[0].key.speaker_index, Some(7));
    }
}

#[test]
fn restores_original_channels_after_downmixing() {
    let previous = vec![
        word("a", 0.0, 500.0, 0.0),
        StoredTranscriptWord {
            text: Some("안녕".to_string()),
            ..word("b", 500.0, 1_000.0, 1.0)
        },
    ];
    let replacement = previous
        .iter()
        .map(|word| StoredTranscriptWord {
            id: format!("new-{}", word.id),
            channel: Some(2.0),
            ..word.clone()
        })
        .collect::<Vec<_>>();

    let result = restore_refined_source_channels(&previous, replacement);

    assert_eq!(
        result.iter().map(|word| word.channel).collect::<Vec<_>>(),
        [Some(0.0), Some(1.0)]
    );
}

#[test]
fn keeps_overlapping_or_rewritten_speech_mixed() {
    let local = word("a", 0.0, 500.0, 0.0);
    let remote = word("b", 0.0, 500.0, 1.0);
    let mixed = word("new", 0.0, 500.0, 2.0);
    assert_eq!(
        restore_refined_source_channels(&[local.clone(), remote], vec![mixed.clone()])[0].channel,
        Some(2.0)
    );

    let rewritten = StoredTranscriptWord {
        text: Some("goodbye".to_string()),
        ..mixed.clone()
    };
    assert_eq!(
        restore_refined_source_channels(std::slice::from_ref(&local), vec![rewritten])[0].channel,
        Some(2.0)
    );

    let insufficient_overlap = StoredTranscriptWord {
        start_ms: Some(490.0),
        end_ms: Some(990.0),
        ..mixed
    };
    assert_eq!(
        restore_refined_source_channels(&[local], vec![insufficient_overlap])[0].channel,
        Some(2.0)
    );
}

#[test]
fn restores_source_channels_in_provider_hints() {
    let hints = vec![hint(
        "hint",
        Some("a"),
        "provider_speaker_index",
        serde_json::json!({"channel": 2, "speaker_index": 7}),
    )];
    let restored = restore_refined_source_hints(&[word("a", 0.0, 500.0, 0.0)], hints.clone());
    assert_eq!(speaker_value(&restored[0])["channel"], 0);
    assert_eq!(speaker_value(&restored[0])["speaker_index"], 7);
    assert_eq!(
        restore_refined_source_hints(&[word("a", 0.0, 500.0, 2.0)], hints.clone()),
        hints
    );
}

#[test]
fn batch_cluster_keys_ignore_object_values_and_non_integral_numbers() {
    let source_word = word("source", 0.0, 100.0, 1.0);
    let target_word = word("target", 0.0, 100.0, 1.0);
    let source_hints = vec![object_hint(
        "source-provider",
        Some("source"),
        "provider_speaker_index",
        serde_json::json!({"channel": 1, "speaker_index": 1}),
    )];
    let target_hint = object_hint(
        "target-provider",
        Some("target"),
        "provider_speaker_index",
        serde_json::json!({"channel": 1, "speaker_index": 0}),
    );
    let result = reconcile_refined_speaker_clusters(
        &source(vec![source_word], source_hints),
        &[target_word],
        vec![target_hint.clone()],
    );
    assert_eq!(result, [target_hint]);

    let source_hint = hint(
        "source-provider",
        Some("source"),
        "provider_speaker_index",
        serde_json::json!({"channel": 1.5, "speaker_index": 1}),
    );
    let target_hint = hint(
        "target-provider",
        Some("target"),
        "provider_speaker_index",
        serde_json::json!({"channel": 1.5, "speaker_index": 0}),
    );
    let result = reconcile_refined_speaker_clusters(
        &source(vec![word("source", 0.0, 100.0, 1.0)], vec![source_hint]),
        &[word("target", 0.0, 100.0, 1.0)],
        vec![target_hint.clone()],
    );
    assert_eq!(result, [target_hint]);

    let object_hint = object_hint(
        "object-value",
        Some("target"),
        "provider_speaker_index",
        serde_json::json!({"channel": 2, "speaker_index": 7}),
    );
    assert_eq!(
        restore_refined_source_hints(
            &[word("target", 0.0, 100.0, 0.0)],
            vec![object_hint.clone()]
        ),
        [object_hint]
    );
}

#[test]
fn render_identity_restoration_accepts_object_valued_hints() {
    let source_word = word("old", 0.0, 100.0, 1.0);
    let next_word = word("new", 0.0, 100.0, 1.0);
    let source_hints = vec![
        object_hint(
            "provider",
            Some("old"),
            "provider_speaker_index",
            serde_json::json!({"channel": 1, "speaker_index": 0}),
        ),
        object_hint(
            "assignment",
            Some("old"),
            "user_speaker_assignment",
            serde_json::json!({
                "human_id": "alice",
                "scope": "speaker",
                "channel": 1,
                "speaker_index": 0,
            }),
        ),
    ];
    let result = reconcile_refined_speaker_clusters(
        &source(vec![source_word.clone()], source_hints),
        std::slice::from_ref(&next_word),
        vec![object_hint(
            "next-provider",
            Some("new"),
            "provider_speaker_index",
            serde_json::json!({"channel": 1, "speaker_index": 7}),
        )],
    );
    assert_eq!(result.len(), 2);
    assert_eq!(result[1].word_id.as_deref(), Some("new"));
    assert_eq!(
        speaker_value(&result[1])["word_ids"],
        serde_json::json!(["new"])
    );
}

#[test]
fn preserves_user_hint_insertion_order_when_reanchoring_assignments() {
    let source_words = vec![
        word("old-local", 0.0, 100.0, 0.0),
        word("old-remote", 0.0, 100.0, 1.0),
    ];
    let source_hints = vec![
        provider(&source_words[0], 0),
        provider(&source_words[1], 0),
        assignment(serde_json::json!({
            "human_id": "bob",
            "scope": "speaker",
            "channel": 0,
            "speaker_index": 0,
        })),
        hint(
            "remote-assignment",
            Some("old-remote"),
            "user_speaker_assignment",
            serde_json::json!({
                "human_id": "alice",
                "scope": "speaker",
                "channel": 1,
                "speaker_index": 0,
            }),
        ),
    ];
    let words = vec![
        word("new-local", 0.0, 100.0, 0.0),
        word("new-remote", 0.0, 100.0, 1.0),
    ];
    let hints = words
        .iter()
        .map(|word| provider(word, 0))
        .collect::<Vec<_>>();
    let result =
        reconcile_refined_speaker_clusters(&source(source_words, source_hints), &words, hints);
    assert_eq!(
        result
            .iter()
            .filter(|hint| hint.hint_type == "user_speaker_assignment")
            .map(|hint| hint.word_id.as_deref().unwrap())
            .collect::<Vec<_>>(),
        ["new-local", "new-remote"]
    );
}

#[test]
fn preserves_generated_segment_assignment_fields() {
    let old_word = word("old", 0.0, 100.0, 1.0);
    let new_word = word("new", 0.0, 100.0, 1.0);
    let result = reconcile_refined_speaker_clusters(
        &source(
            vec![old_word],
            vec![assignment(serde_json::json!({
                "scope": "segment",
                "word_ids": ["old"],
            }))],
        ),
        &[new_word],
        vec![],
    );
    let generated = result
        .iter()
        .find(|hint| hint.hint_type == "user_speaker_assignment")
        .expect("segment assignment was restored");
    assert_eq!(generated.id, "new:user_speaker_assignment:segment");
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(generated.value.as_str().unwrap()).unwrap(),
        serde_json::json!({
            "human_id": "alice",
            "scope": "segment",
            "word_ids": ["new"],
            "extend_to_adjacent": false,
        })
    );
}

#[test]
fn promotes_current_capture_words_and_filters_hints() {
    let words = vec![
        word("old", 10_000.0, 10_500.0, 0.0),
        word("new", 60_100.0, 60_500.0, 0.0),
    ];
    let hints = vec![provider(&words[0], 0), provider(&words[1], 1)];
    let previous = BatchRefinementSource {
        id: "live-current".to_string(),
        started_at: 99_000.0,
        words: vec![word("live-word", 0.0, 500.0, 1.0)],
        speaker_hints: vec![],
    };
    let (words, hints, replace_session, replace_transcript_id, started_at) =
        ready(refine_batch_transcript(current_request(
            words,
            hints,
            vec![previous],
            60_000.0,
            Some("live-current"),
        )));
    assert_eq!(
        words,
        [StoredTranscriptWord {
            start_ms: Some(100.0),
            end_ms: Some(500.0),
            ..word("new", 60_100.0, 60_500.0, 0.0)
        }]
    );
    assert_eq!(hints.len(), 1);
    assert_eq!(hints[0].word_id.as_deref(), Some("new"));
    assert!(!replace_session);
    assert_eq!(replace_transcript_id.as_deref(), Some("live-current"));
    assert_eq!(started_at, Some(123_000.0));
}

#[test]
fn current_capture_rebases_synthetic_chunks_with_word_times_before_rendering() {
    for encoded in [false, true] {
        let mut synthetic = word("synthetic-mic", 61_000.0, 61_400.0, 0.0);
        let metadata = serde_json::json!({
            "timing": {"source": "synthetic_text", "chunk_start_ms": 60_000},
            "retained": "context",
        });
        synthetic.metadata = Some(if encoded {
            Value::String(metadata.to_string())
        } else {
            metadata
        });
        let (words, hints, _, _, _) = ready(refine_batch_transcript(current_request(
            vec![synthetic, word("timed-remote", 62_000.0, 62_400.0, 1.0)],
            vec![],
            vec![],
            60_000.0,
            None,
        )));
        let metadata = match words[0].metadata.as_ref().unwrap() {
            Value::String(json) => serde_json::from_str::<Value>(json).unwrap(),
            metadata => metadata.clone(),
        };
        assert_eq!(metadata["timing"]["chunk_start_ms"].as_f64(), Some(0.0));
        assert_eq!(metadata["retained"], "context");
        let segments = crate::render_transcript_segments(crate::RenderTranscriptRequest {
            transcripts: vec![
                crate::render_input_from_stored(Some(123_000), &words, &hints).unwrap(),
            ],
            participant_human_ids: vec![],
            self_human_id: None,
            humans: vec![],
            speaker_context: None,
            preview: None,
        });
        assert_eq!(segments[0].words[0].id.as_deref(), Some("synthetic-mic"));
        assert_eq!(segments[1].words[0].id.as_deref(), Some("timed-remote"));
        assert_eq!(segments[0].start_ms, 1_000);
        assert_eq!(segments[1].start_ms, 2_000);
    }
    let mut metadata =
        serde_json::json!({"timing": {"source": "synthetic_text", "chunk_start_ms": 59_500}});
    rebase_synthetic_chunk_start(&mut metadata, 60_000.0);
    assert_eq!(metadata["timing"]["chunk_start_ms"].as_f64(), Some(0.0));
}

#[test]
fn returns_empty_current_capture_when_promotion_filters_every_word() {
    let outcome = refine_batch_transcript(current_request(
        vec![word("old", 10_000.0, 10_500.0, 0.0)],
        vec![],
        vec![],
        60_000.0,
        Some("live-current"),
    ));
    assert_eq!(outcome, BatchRefinementOutcome::EmptyCurrentCapture);
}

#[test]
fn defaults_missing_end_time_to_start_and_clamps_negative_offsets() {
    let mut word_without_end = word("missing-end", 60.0, 0.0, 0.0);
    word_without_end.end_ms = None;
    let (words, _, _, _, _) = ready(refine_batch_transcript(current_request(
        vec![word_without_end],
        vec![],
        vec![],
        50.0,
        None,
    )));
    assert_eq!(words[0].start_ms, Some(10.0));
    assert_eq!(words[0].end_ms, Some(10.0));

    let (words, _, _, _, _) = ready(refine_batch_transcript(current_request(
        vec![word("negative-offset", 10.0, 20.0, 0.0)],
        vec![],
        vec![],
        -20.0,
        None,
    )));
    assert_eq!(words[0].start_ms, Some(10.0));
    assert_eq!(words[0].end_ms, Some(20.0));
}

#[test]
fn rejects_replacements_that_cross_both_truncation_thresholds() {
    let previous = BatchRefinementSource {
        id: "saved".to_string(),
        started_at: 10.0,
        words: vec![word("old", 0.0, 100.0, 0.0); 500]
            .into_iter()
            .map(|mut word| {
                word.text = Some("a".to_string());
                word
            })
            .collect(),
        speaker_hints: vec![],
    };
    let outcome = refine_batch_transcript(BatchRefinementRequest {
        words: vec![StoredTranscriptWord {
            text: Some("a".repeat(200)),
            ..word("replacement", 0.0, 100.0, 0.0)
        }],
        hints: vec![],
        promotion: BatchTranscriptPromotion::WholeSession,
        previous_transcripts: vec![previous],
    });
    assert_eq!(outcome, BatchRefinementOutcome::Truncated);
}

#[test]
fn counts_astral_unicode_letters_as_javascript_utf16_units() {
    let previous = BatchRefinementSource {
        id: "saved".to_string(),
        started_at: 10.0,
        words: vec![StoredTranscriptWord {
            text: Some("𝒜".repeat(200)),
            ..word("old", 0.0, 100.0, 0.0)
        }],
        speaker_hints: vec![],
    };
    let outcome = refine_batch_transcript(BatchRefinementRequest {
        words: vec![StoredTranscriptWord {
            text: Some("𝒜".repeat(99)),
            ..word("replacement", 0.0, 100.0, 0.0)
        }],
        hints: vec![],
        promotion: BatchTranscriptPromotion::WholeSession,
        previous_transcripts: vec![previous],
    });
    assert_eq!(outcome, BatchRefinementOutcome::Truncated);
}

#[test]
fn tolerates_tokenization_languages_small_captures_and_ordinary_corrections() {
    let examples = [
        ("meeting ".repeat(100), "meeting ".repeat(100)),
        ("会议记录".repeat(100), "会议记录".repeat(100)),
        ("meeting ".repeat(100), "meeting ".repeat(70)),
        ("meeting ".repeat(10), "hello".to_string()),
    ];
    for (previous_text, replacement_text) in examples {
        let previous = BatchRefinementSource {
            id: "saved".to_string(),
            started_at: 10.0,
            words: vec![StoredTranscriptWord {
                text: Some(previous_text),
                ..word("old", 0.0, 100.0, 0.0)
            }],
            speaker_hints: vec![],
        };
        let outcome = refine_batch_transcript(BatchRefinementRequest {
            words: vec![StoredTranscriptWord {
                text: Some(replacement_text),
                ..word("new", 0.0, 100.0, 0.0)
            }],
            hints: vec![],
            promotion: BatchTranscriptPromotion::WholeSession,
            previous_transcripts: vec![previous],
        });
        assert!(matches!(outcome, BatchRefinementOutcome::Ready { .. }));
    }
}

#[test]
fn truncation_check_uses_only_the_current_capture_after_offset_filtering() {
    let previous_text = "meeting ".repeat(100);
    let replacement_text = "meeting ".repeat(70);
    let previous = BatchRefinementSource {
        id: "live-current".to_string(),
        started_at: 123_000.0,
        words: vec![StoredTranscriptWord {
            text: Some(previous_text),
            ..word("live-word", 0.0, 100.0, 0.0)
        }],
        speaker_hints: vec![],
    };
    let outcome = refine_batch_transcript(current_request(
        vec![
            StoredTranscriptWord {
                text: Some("An earlier capture ".repeat(1_000)),
                ..word("earlier", 0.0, 59_000.0, 0.0)
            },
            StoredTranscriptWord {
                text: Some(replacement_text),
                ..word("replacement", 60_000.0, 61_000.0, 0.0)
            },
        ],
        vec![],
        vec![previous],
        60_000.0,
        Some("live-current"),
    ));
    assert!(matches!(outcome, BatchRefinementOutcome::Ready { .. }));
}

#[test]
fn uses_the_sole_previous_transcript_start_time_without_promotion_time() {
    let outcome = refine_batch_transcript(BatchRefinementRequest {
        words: vec![word("new", 0.0, 100.0, 0.0)],
        hints: vec![],
        promotion: BatchTranscriptPromotion::WholeSession,
        previous_transcripts: vec![BatchRefinementSource {
            id: "previous".to_string(),
            started_at: 50.0,
            words: vec![],
            speaker_hints: vec![],
        }],
    });
    let (_, _, replace_session, replace_transcript_id, started_at) = ready(outcome);
    assert!(replace_session);
    assert_eq!(replace_transcript_id, None);
    assert_eq!(started_at, Some(50.0));
}
