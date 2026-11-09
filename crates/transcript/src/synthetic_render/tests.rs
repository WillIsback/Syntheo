use serde_json::json;

use super::*;
use crate::{
    RenderTranscriptWordInput, StoredSpeakerHint, StoredTranscriptWord, render_input_from_stored,
};

fn stored_word(
    id: &str,
    start_ms: i64,
    channel: i32,
    timing: Option<Value>,
) -> StoredTranscriptWord {
    StoredTranscriptWord {
        id: id.to_string(),
        text: Some(format!(" {id}")),
        start_ms: Some(start_ms as f64),
        end_ms: Some((start_ms + 400) as f64),
        channel: Some(channel as f64),
        speaker: None,
        metadata: timing.map(|timing| json!({"timing": timing})),
    }
}

fn synthetic(chunk: Option<i64>) -> Option<Value> {
    Some(json!({"source": "synthetic_text", "chunk_start_ms": chunk}))
}

fn request() -> RenderTranscriptRequest {
    RenderTranscriptRequest {
        transcripts: vec![],
        participant_human_ids: vec![],
        self_human_id: None,
        humans: vec![],
        speaker_context: None,
        preview: None,
    }
}

fn render_rows(
    rows: Vec<(
        Option<i64>,
        Vec<StoredTranscriptWord>,
        Vec<StoredSpeakerHint>,
    )>,
    mut request: RenderTranscriptRequest,
) -> Vec<RenderedTranscriptSegment> {
    request.transcripts = rows
        .into_iter()
        .filter_map(|(started_at, words, hints)| {
            render_input_from_stored(started_at, &words, &hints)
        })
        .collect();
    crate::render_transcript_segments(request)
}

fn word_ids(segments: &[RenderedTranscriptSegment]) -> Vec<Vec<&str>> {
    segments
        .iter()
        .map(|segment| {
            segment
                .words
                .iter()
                .map(|word| word.id.as_deref().unwrap())
                .collect()
        })
        .collect()
}

#[test]
fn synthetic_chunks_keep_channel_sentences_and_word_ids_with_assignments() {
    let words = vec![
        stored_word("mic-1", 0, 0, synthetic(Some(0))),
        stored_word("remote-1", 0, 1, synthetic(Some(0))),
        stored_word("mic-2", 400, 0, synthetic(Some(0))),
        stored_word("remote-2", 400, 1, synthetic(Some(0))),
        stored_word("mic-next", 10_000, 0, synthetic(Some(10_000))),
        stored_word("remote-next", 10_000, 1, synthetic(Some(10_000))),
    ];
    let mut hints = vec![StoredSpeakerHint {
        id: "remote-assignment".into(),
        word_id: Some("remote-1".into()),
        hint_type: "user_speaker_assignment".into(),
        value: json!({"human_id": "guest", "scope": "speaker", "channel": 1, "speaker_index": 7}),
    }];
    hints.extend(
        ["remote-1", "remote-2", "remote-next"].map(|id| StoredSpeakerHint {
            id: format!("{id}:provider_speaker_index"),
            word_id: Some(id.into()),
            hint_type: "provider_speaker_index".into(),
            value: json!({"channel": 1, "speaker_index": 7}),
        }),
    );
    let mut context = request();
    context.humans.push(crate::RenderTranscriptHuman {
        human_id: "guest".into(),
        name: "Guest".into(),
    });
    let segments = render_rows(vec![(Some(0), words, hints)], context);
    assert_eq!(
        word_ids(&segments),
        vec![
            vec!["mic-1", "mic-2"],
            vec!["remote-1", "remote-2"],
            vec!["mic-next"],
            vec!["remote-next"]
        ]
    );
    assert_eq!(segments[1].speaker_label, "Guest");
    assert_eq!(segments[3].key.speaker_human_id.as_deref(), Some("guest"));
    assert_eq!(segments[1].words[1].start_ms, 400);
}

#[test]
fn legacy_channel_runs_do_not_pull_later_rows_across_accurate_provider_words() {
    let rows = vec![
        (
            Some(1000),
            vec![
                stored_word("mic-old", 0, 0, synthetic(None)),
                stored_word("mic-old-2", 400, 0, synthetic(None)),
            ],
            vec![],
        ),
        (
            Some(1000),
            vec![
                stored_word("remote-old", 0, 1, synthetic(None)),
                stored_word("remote-old-2", 400, 1, synthetic(None)),
            ],
            vec![],
        ),
        (
            Some(2000),
            vec![
                stored_word("timed-remote", 0, 1, None),
                stored_word("timed-mic", 1000, 0, None),
            ],
            vec![],
        ),
        (
            Some(4000),
            vec![
                stored_word("remote-later", 0, 1, synthetic(None)),
                stored_word("mic-later", 400, 0, synthetic(None)),
            ],
            vec![],
        ),
    ];
    let segments = render_rows(rows, request());
    assert_eq!(
        word_ids(&segments),
        vec![
            vec!["mic-old", "mic-old-2"],
            vec!["remote-old", "remote-old-2"],
            vec!["timed-remote"],
            vec!["timed-mic"],
            vec!["mic-later"],
            vec!["remote-later"]
        ]
    );
    assert_eq!(segments[2].start_ms, 1000);
    assert_eq!(segments[3].start_ms, 2000);
}

#[test]
fn synthetic_order_uses_row_offsets_and_preserves_accurate_word_chronology() {
    let mut encoded = stored_word("encoded-mic", 400, 0, synthetic(Some(0)));
    encoded.metadata = Some(Value::String(encoded.metadata.unwrap().to_string()));
    let rows = vec![
        (
            Some(5000),
            vec![
                stored_word("late-remote", 0, 1, synthetic(Some(0))),
                encoded,
            ],
            vec![],
        ),
        (
            Some(1000),
            vec![
                stored_word("early-timed-remote", 0, 1, None),
                stored_word("early-timed-mic", 1000, 0, None),
            ],
            vec![],
        ),
        (
            Some(3000),
            vec![
                stored_word("mixed-remote", 0, 1, synthetic(None)),
                stored_word("mixed-timed", 1000, 0, None),
            ],
            vec![],
        ),
    ];
    let segments = render_rows(rows, request());
    assert_eq!(
        word_ids(&segments),
        vec![
            vec!["early-timed-remote"],
            vec!["early-timed-mic"],
            vec!["mixed-remote"],
            vec!["mixed-timed"],
            vec!["encoded-mic"],
            vec!["late-remote"]
        ]
    );
    assert_eq!(segments[4].start_ms, 4400);
    assert_eq!(segments[5].start_ms, 4000);
}

#[test]
fn accurate_provider_timestamps_keep_chronology_without_synthetic_grouping() {
    let rows = vec![
        (
            Some(5000),
            vec![stored_word("late-remote", 0, 1, None)],
            vec![],
        ),
        (
            Some(1000),
            vec![stored_word("early-mic", 0, 0, None)],
            vec![],
        ),
        (
            Some(2000),
            vec![stored_word("middle-remote", 0, 1, None)],
            vec![],
        ),
        (
            Some(3000),
            vec![stored_word("middle-mic", 0, 0, None)],
            vec![],
        ),
    ];
    let segments = render_rows(rows, request());
    assert_eq!(
        word_ids(&segments),
        vec![
            vec!["early-mic"],
            vec!["middle-remote"],
            vec!["middle-mic"],
            vec!["late-remote"]
        ]
    );
    assert_eq!(
        segments
            .iter()
            .map(|segment| segment.start_ms)
            .collect::<Vec<_>>(),
        vec![0, 1000, 2000, 4000]
    );
}

#[test]
fn synthetic_channel_grouping_preserves_speaker_context_boundaries() {
    let rows = vec![(
        Some(1000),
        vec![
            stored_word("remote-a", 0, 1, synthetic(Some(0))),
            stored_word("mic-a", 0, 0, synthetic(Some(0))),
            stored_word("remote-b", 1000, 1, synthetic(Some(0))),
            stored_word("mic-b", 1000, 0, synthetic(Some(0))),
        ],
        vec![],
    )];
    let mut context = request();
    context.self_human_id = Some("owner".into());
    context.speaker_context = Some(crate::SpeakerContext {
        intervals: [(1000, 1600, "a", "Alice"), (1600, 4000, "b", "Bob")]
            .map(
                |(start_ms, end_ms, human_id, name)| crate::SpeakerContextInterval {
                    start_ms,
                    end_ms,
                    active_call: true,
                    calendar_call: None,
                    mic_isolated: None,
                    shared_microphone: false,
                    title: String::new(),
                    self_names: vec![],
                    participants: vec![crate::RenderTranscriptHuman {
                        human_id: human_id.into(),
                        name: name.into(),
                    }],
                },
            )
            .into(),
    });
    let segments = render_rows(rows, context);
    let remote: Vec<_> = segments
        .iter()
        .filter(|segment| segment.key.channel == ChannelProfile::RemoteParty)
        .collect();
    assert_eq!(
        remote
            .iter()
            .map(|segment| segment.speaker_label.as_str())
            .collect::<Vec<_>>(),
        vec!["Alice", "Bob"]
    );
    assert_eq!(remote[0].words[0].id.as_deref(), Some("remote-a"));
    assert_eq!(remote[1].words[0].id.as_deref(), Some("remote-b"));
    assert_eq!(remote[1].start_ms, 1000);
}

#[test]
fn timed_words_split_into_their_own_chunk_windows() {
    let rows = vec![(
        Some(0),
        vec![
            stored_word("mic-first", 0, 0, synthetic(Some(0))),
            stored_word("remote-first", 0, 1, synthetic(Some(0))),
            stored_word("timed-early", 5_000, 2, None),
            stored_word("mic-second", 30_000, 0, synthetic(Some(30_000))),
            stored_word("remote-second", 30_000, 1, synthetic(Some(30_000))),
            stored_word("timed-late", 35_000, 2, None),
        ],
        vec![StoredSpeakerHint {
            id: "timed-provider".into(),
            word_id: None,
            hint_type: "provider_speaker_index".into(),
            value: json!({"channel": 2, "speaker_index": 3}),
        }],
    )];
    let segments = render_rows(rows, request());
    assert_eq!(
        word_ids(&segments),
        vec![
            vec!["mic-first"],
            vec!["remote-first"],
            vec!["timed-early"],
            vec!["mic-second"],
            vec!["remote-second"],
            vec!["timed-late"]
        ]
    );
}

#[test]
fn request_words_can_carry_synthetic_timing_directly() {
    fn word(
        id: &str,
        start_ms: i64,
        channel: i32,
        chunk_start_ms: i64,
    ) -> RenderTranscriptWordInput {
        RenderTranscriptWordInput {
            id: id.to_string(),
            text: format!(" {id}"),
            start_ms,
            end_ms: start_ms + 400,
            channel,
            speaker_index: None,
            synthetic_timing: Some(SyntheticTiming {
                chunk_start_ms: Some(chunk_start_ms as f64),
            }),
        }
    }
    let mut context = request();
    context.transcripts = vec![RenderTranscriptInput {
        started_at: Some(0),
        words: vec![
            word("mic-1", 0, 0, 0),
            word("remote-1", 0, 1, 0),
            word("mic-2", 400, 0, 0),
            word("remote-2", 400, 1, 0),
        ],
        assignments: vec![],
    }];
    let segments = crate::render_transcript_segments(context);
    assert_eq!(
        word_ids(&segments),
        vec![vec!["mic-1", "mic-2"], vec!["remote-1", "remote-2"]]
    );
}
