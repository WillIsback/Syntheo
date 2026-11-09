use syntheo_transcript::{
    ChannelProfile, FinalizedWord, IdentityAssignment, IdentityScope, PartialWord,
    SegmentBuilderOptions, WordState,
};

use super::{
    LiveTranscriptDelta, MAX_RENDERED_TEXT_BYTES, MAX_RENDERED_WINDOW_MS, MAX_RENDERED_WORDS,
    RenderedSegmentState, bounded_partials, rendered_text_bytes,
};

fn finalized_word(id: impl Into<String>, text: String, start_ms: i64) -> FinalizedWord {
    FinalizedWord {
        id: id.into(),
        text,
        start_ms,
        end_ms: start_ms + 100,
        channel: 0,
        state: WordState::Final,
        speaker_index: None,
    }
}

fn remote_word(id: &str, text: &str, start_ms: i64, speaker_index: i32) -> FinalizedWord {
    FinalizedWord {
        channel: 1,
        speaker_index: Some(speaker_index),
        ..finalized_word(id, text.to_string(), start_ms)
    }
}

fn speaker_assignment(human_id: &str, speaker_index: i32) -> IdentityAssignment {
    IdentityAssignment {
        human_id: human_id.to_string(),
        scope: IdentityScope::ChannelSpeaker {
            channel: ChannelProfile::RemoteParty,
            speaker_index,
        },
    }
}

#[test]
fn identity_update_relabels_rendered_segments_and_keeps_partials() {
    let mut state = state();
    let partial = PartialWord {
        text: " again".to_string(),
        start_ms: 5_100,
        end_ms: 5_200,
        channel: 1,
        speaker_index: Some(1),
    };
    state.apply_delta(&LiveTranscriptDelta {
        new_words: vec![
            remote_word("a", " hello", 0, 0),
            remote_word("b", " there", 100, 0),
            remote_word("c", " hi", 5_000, 1),
        ],
        replaced_ids: Vec::new(),
        partials: vec![partial.clone()],
    });

    let update = state
        .update_identities(
            Vec::new(),
            vec![speaker_assignment("artem", 0)],
            SegmentBuilderOptions {
                max_gap_ms: Some(500),
                complete_channels: None,
                min_segment_words: None,
                min_segment_ms: None,
                isolated_mic_ranges: None,
                isolated_mic_human: None,
            },
        )
        .expect("assignment should change the rendered segments");

    let named = update
        .upserts
        .iter()
        .filter(|segment| segment.key.speaker_human_id.as_deref() == Some("artem"))
        .collect::<Vec<_>>();
    assert_eq!(named.len(), 1);
    assert_eq!(named[0].text, "hello there");
    assert!(
        update
            .upserts
            .iter()
            .all(|segment| segment.key.speaker_index != Some(1)),
        "the unassigned speaker's segment must not be re-emitted"
    );
    assert_eq!(
        update.removed_ids.len(),
        1,
        "the old unnamed segment goes away"
    );

    let next = state
        .apply_delta(&LiveTranscriptDelta {
            new_words: vec![remote_word("d", " later", 9_000, 0)],
            replaced_ids: Vec::new(),
            partials: vec![partial],
        })
        .expect("new words should render");
    assert_eq!(
        next.upserts.len(),
        1,
        "unchanged segments are not re-emitted"
    );
    assert_eq!(next.upserts[0].text, "later");
    assert_eq!(
        next.upserts[0].key.speaker_human_id.as_deref(),
        Some("artem")
    );
}

#[test]
fn identity_update_without_changes_emits_nothing() {
    let mut state = state();
    state.apply_delta(&LiveTranscriptDelta {
        new_words: vec![remote_word("a", " hello", 0, 0)],
        replaced_ids: Vec::new(),
        partials: Vec::new(),
    });

    let update = state.update_identities(
        Vec::new(),
        vec![speaker_assignment("artem", 3)],
        SegmentBuilderOptions {
            max_gap_ms: Some(500),
            complete_channels: None,
            min_segment_words: None,
            min_segment_ms: None,
            isolated_mic_ranges: None,
            isolated_mic_human: None,
        },
    );

    assert!(update.is_none());
}

fn state() -> RenderedSegmentState {
    RenderedSegmentState::new(
        Vec::new(),
        Vec::new(),
        SegmentBuilderOptions {
            max_gap_ms: Some(500),
            complete_channels: None,
            min_segment_words: None,
            min_segment_ms: None,
            isolated_mic_ranges: None,
            isolated_mic_human: None,
        },
    )
}

#[test]
fn bounds_one_giant_same_speaker_segment() {
    let mut state = state();
    let update = state
        .apply_delta(&LiveTranscriptDelta {
            new_words: vec![finalized_word(
                "giant",
                "a".repeat(MAX_RENDERED_TEXT_BYTES * 2),
                0,
            )],
            replaced_ids: Vec::new(),
            partials: Vec::new(),
        })
        .expect("giant word should render");

    assert!(rendered_text_bytes(&state.words) <= MAX_RENDERED_TEXT_BYTES);
    assert!(
        update
            .upserts
            .iter()
            .flat_map(|segment| &segment.words)
            .map(|word| word.text.len())
            .sum::<usize>()
            <= MAX_RENDERED_TEXT_BYTES
    );
}

#[test]
fn bounds_same_speaker_word_history() {
    let mut state = state();
    state.apply_delta(&LiveTranscriptDelta {
        new_words: (0..MAX_RENDERED_WORDS + 20)
            .map(|index| {
                finalized_word(
                    format!("word-{index:05}"),
                    " word".to_string(),
                    index as i64,
                )
            })
            .collect(),
        replaced_ids: Vec::new(),
        partials: Vec::new(),
    });

    assert_eq!(state.words.len(), MAX_RENDERED_WORDS);
    assert_eq!(
        state.words.first().map(|word| word.id.as_str()),
        Some("word-00020")
    );
}

#[test]
fn keeps_bounded_capacity_during_steady_state_eviction() {
    let mut state = state();
    state.apply_delta(&LiveTranscriptDelta {
        new_words: (0..MAX_RENDERED_WORDS)
            .map(|index| {
                finalized_word(
                    format!("word-{index:05}"),
                    " word".to_string(),
                    index as i64,
                )
            })
            .collect(),
        replaced_ids: Vec::new(),
        partials: Vec::new(),
    });
    let steady_capacity = state.words.capacity();

    for index in MAX_RENDERED_WORDS..MAX_RENDERED_WORDS + 100 {
        state.apply_delta(&LiveTranscriptDelta {
            new_words: vec![finalized_word(
                format!("word-{index:05}"),
                " word".to_string(),
                index as i64,
            )],
            replaced_ids: Vec::new(),
            partials: Vec::new(),
        });
        assert_eq!(state.words.capacity(), steady_capacity);
    }

    assert!(steady_capacity <= MAX_RENDERED_WORDS);
    assert_eq!(state.words.len(), MAX_RENDERED_WORDS);
}

#[test]
fn bounds_unsorted_partials_to_the_newest_words() {
    let partial = |text: &str, start_ms: i64| PartialWord {
        text: text.to_string(),
        start_ms,
        end_ms: start_ms + 10,
        channel: 0,
        speaker_index: None,
    };
    let partials = vec![
        partial(" newest", 300),
        partial(" oldest", 100),
        partial(" middle", 200),
    ];

    let retained = bounded_partials(&partials, 310, 2, MAX_RENDERED_TEXT_BYTES);

    assert_eq!(
        retained
            .iter()
            .map(|partial| partial.text.as_str())
            .collect::<Vec<_>>(),
        vec![" middle", " newest"]
    );
}

#[test]
fn emits_removals_when_the_render_window_evicts_old_segments() {
    let mut state = state();
    let first = state
        .apply_delta(&LiveTranscriptDelta {
            new_words: vec![finalized_word("old", " old".to_string(), 0)],
            replaced_ids: Vec::new(),
            partials: Vec::new(),
        })
        .expect("old segment should render");
    let old_ids = first
        .upserts
        .into_iter()
        .map(|segment| segment.id)
        .collect::<Vec<_>>();

    let next = state
        .apply_delta(&LiveTranscriptDelta {
            new_words: vec![finalized_word(
                "new",
                " new".to_string(),
                MAX_RENDERED_WINDOW_MS + 1_000,
            )],
            replaced_ids: Vec::new(),
            partials: Vec::new(),
        })
        .expect("new segment should replace the evicted one");

    assert!(old_ids.iter().all(|id| next.removed_ids.contains(id)));
    assert!(state.words.iter().all(|word| word.id != "old"));
}
