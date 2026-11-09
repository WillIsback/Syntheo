use super::*;
use crate::{ChannelProfile, IdentityScope};

fn word(
    id: &str,
    text: &str,
    start_ms: i64,
    end_ms: i64,
    channel: i32,
) -> RenderTranscriptWordInput {
    RenderTranscriptWordInput {
        id: id.to_string(),
        text: text.to_string(),
        start_ms,
        end_ms,
        channel,
        speaker_index: None,
        synthetic_timing: None,
    }
}

fn word_si(
    id: &str,
    text: &str,
    start_ms: i64,
    end_ms: i64,
    channel: i32,
    speaker_index: i32,
) -> RenderTranscriptWordInput {
    RenderTranscriptWordInput {
        id: id.to_string(),
        text: text.to_string(),
        start_ms,
        end_ms,
        channel,
        speaker_index: Some(speaker_index),
        synthetic_timing: None,
    }
}

fn channel_assignment(human_id: &str, channel: ChannelProfile) -> IdentityAssignment {
    IdentityAssignment {
        human_id: human_id.to_string(),
        scope: IdentityScope::Channel { channel },
    }
}

fn speaker_assignment(
    human_id: &str,
    channel: ChannelProfile,
    speaker_index: i32,
) -> IdentityAssignment {
    IdentityAssignment {
        human_id: human_id.to_string(),
        scope: IdentityScope::ChannelSpeaker {
            channel,
            speaker_index,
        },
    }
}

#[test]
fn renders_segments_with_labels() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![RenderTranscriptInput {
            started_at: Some(0),
            words: vec![
                word("w1", " hello", 0, 100, 0),
                word("w2", " world", 120, 240, 1),
            ],
            assignments: vec![],
        }],
        participant_human_ids: vec!["human-1".to_string(), "human-2".to_string()],
        self_human_id: Some("human-1".to_string()),
        humans: vec![
            RenderTranscriptHuman {
                human_id: "human-1".to_string(),
                name: "Alice".to_string(),
            },
            RenderTranscriptHuman {
                human_id: "human-2".to_string(),
                name: "Bob".to_string(),
            },
        ],
    });

    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].speaker_label, "Alice");
    assert_eq!(segments[0].text, "hello");
    assert_eq!(segments[1].speaker_label, "Bob");
    assert_eq!(segments[1].text, "world");
}

#[test]
fn grouped_channel_inputs_keep_words_in_sentence_segments() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![
            RenderTranscriptInput {
                started_at: Some(0),
                words: vec![
                    word("mic-1", " Hello", 0, 400, 0),
                    word("mic-2", " world.", 400, 800, 0),
                ],
                assignments: vec![],
            },
            RenderTranscriptInput {
                started_at: Some(0),
                words: vec![
                    word("remote-1", " Remote", 0, 400, 1),
                    word("remote-2", " reply.", 400, 800, 1),
                ],
                assignments: vec![],
            },
        ],
        participant_human_ids: vec![],
        self_human_id: None,
        humans: vec![],
    });

    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].text, "Hello world.");
    assert_eq!(segments[1].text, "Remote reply.");
    assert_eq!(
        segments[0]
            .words
            .iter()
            .map(|word| word.id.as_deref())
            .collect::<Vec<_>>(),
        vec![Some("mic-1"), Some("mic-2")]
    );
    assert_eq!(
        segments[1]
            .words
            .iter()
            .map(|word| word.id.as_deref())
            .collect::<Vec<_>>(),
        vec![Some("remote-1"), Some("remote-2")]
    );
}

#[test]
fn caps_unknown_speaker_labels_to_participant_count() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![RenderTranscriptInput {
            started_at: Some(0),
            words: vec![
                word_si("w1", " one", 0, 100, 2, 0),
                word_si("w2", " two", 200, 300, 2, 1),
                word_si("w3", " three", 400, 500, 2, 2),
            ],
            assignments: vec![],
        }],
        participant_human_ids: vec!["self".to_string(), "remote".to_string()],
        self_human_id: Some("self".to_string()),
        humans: vec![],
    });

    assert_eq!(segments.len(), 3);
    assert_eq!(segments[0].speaker_label, "Speaker 1");
    assert_eq!(segments[1].speaker_label, "Speaker 2");
    assert_eq!(segments[2].speaker_label, "Speaker 2");
}

#[test]
fn labels_diarized_direct_mic_as_self_without_remote_participant() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![RenderTranscriptInput {
            started_at: Some(0),
            words: vec![word_si("w1", " hello", 0, 100, 0, 2)],
            assignments: vec![],
        }],
        participant_human_ids: vec![],
        self_human_id: Some("self".to_string()),
        humans: vec![RenderTranscriptHuman {
            human_id: "self".to_string(),
            name: "Me".to_string(),
        }],
    });

    assert_eq!(segments.len(), 1);
    assert_eq!(segments[0].speaker_label, "Me");
    assert_eq!(segments[0].key.speaker_index, Some(2));
    assert_eq!(segments[0].key.speaker_human_id.as_deref(), Some("self"));
}

#[test]
fn explicit_channel_assignment_wins_over_participant_default() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![RenderTranscriptInput {
            started_at: Some(0),
            words: vec![
                word("w1", " hello", 0, 100, 0),
                word("w2", " world", 120, 240, 1),
            ],
            assignments: vec![channel_assignment(
                "human-pinned",
                ChannelProfile::RemoteParty,
            )],
        }],
        participant_human_ids: vec!["self".to_string(), "remote".to_string()],
        self_human_id: Some("self".to_string()),
        humans: vec![
            RenderTranscriptHuman {
                human_id: "self".to_string(),
                name: "Me".to_string(),
            },
            RenderTranscriptHuman {
                human_id: "human-pinned".to_string(),
                name: "Pinned".to_string(),
            },
            RenderTranscriptHuman {
                human_id: "remote".to_string(),
                name: "Remote".to_string(),
            },
        ],
    });

    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].speaker_label, "Me");
    assert_eq!(segments[1].speaker_label, "Pinned");
}

#[test]
fn normalizes_word_spacing_for_rendered_segments() {
    let words = normalize_rendered_segment_words(vec![
        SegmentWord {
            text: "What".to_string(),
            start_ms: 0,
            end_ms: 100,
            channel: crate::ChannelProfile::DirectMic,
            is_final: true,
            id: Some("w1".to_string()),
        },
        SegmentWord {
            text: "do".to_string(),
            start_ms: 100,
            end_ms: 200,
            channel: crate::ChannelProfile::DirectMic,
            is_final: true,
            id: Some("w2".to_string()),
        },
        SegmentWord {
            text: "'s".to_string(),
            start_ms: 200,
            end_ms: 250,
            channel: crate::ChannelProfile::DirectMic,
            is_final: true,
            id: Some("w3".to_string()),
        },
    ]);

    assert_eq!(words[0].text, "What");
    assert_eq!(words[1].text, " do");
    assert_eq!(words[2].text, "'s");
}

#[test]
fn propagates_remote_labels_when_complete_channel_is_requested() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![RenderTranscriptInput {
            started_at: Some(0),
            words: vec![
                word("w1", " remote", 0, 100, 1),
                word("w2", " reply", 120, 220, 1),
            ],
            assignments: vec![channel_assignment("remote", ChannelProfile::RemoteParty)],
        }],
        participant_human_ids: vec!["self".to_string(), "remote".to_string()],
        self_human_id: None,
        humans: vec![RenderTranscriptHuman {
            human_id: "remote".to_string(),
            name: "Remote".to_string(),
        }],
    });

    assert_eq!(segments.len(), 1);
    assert_eq!(segments[0].speaker_label, "Remote");
    assert_eq!(segments[0].text, "remote reply");
}

#[test]
fn keeps_same_provider_speaker_index_isolated_per_channel() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![RenderTranscriptInput {
            started_at: Some(0),
            words: vec![
                word_si("w1", " john", 0, 100, 0, 0),
                word_si("w1b", " says", 120, 220, 0, 0),
                word_si("w1c", " hi", 240, 340, 0, 0),
                word_si("w2", " janet", 500, 600, 1, 0),
                word_si("w2b", " replies", 620, 720, 1, 0),
                word_si("w2c", " back", 740, 840, 1, 0),
                word_si("w3", " again", 1_000, 1_100, 0, 0),
            ],
            assignments: vec![
                speaker_assignment("john", ChannelProfile::DirectMic, 0),
                speaker_assignment("janet", ChannelProfile::RemoteParty, 0),
            ],
        }],
        participant_human_ids: vec![],
        self_human_id: None,
        humans: vec![
            RenderTranscriptHuman {
                human_id: "john".to_string(),
                name: "John".to_string(),
            },
            RenderTranscriptHuman {
                human_id: "janet".to_string(),
                name: "Janet".to_string(),
            },
        ],
    });

    assert_eq!(segments.len(), 3);
    assert_eq!(segments[0].speaker_label, "John");
    assert_eq!(segments[1].speaker_label, "Janet");
    assert_eq!(segments[2].speaker_label, "John");
}

#[test]
fn normalizes_multi_row_offsets_from_earliest_transcript() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![
            RenderTranscriptInput {
                started_at: Some(5_000),
                words: vec![word("late", " later", 100, 200, 1)],
                assignments: vec![],
            },
            RenderTranscriptInput {
                started_at: Some(1_000),
                words: vec![word("early", " hello", 0, 100, 0)],
                assignments: vec![],
            },
        ],
        participant_human_ids: vec!["self".to_string(), "remote".to_string()],
        self_human_id: Some("self".to_string()),
        humans: vec![RenderTranscriptHuman {
            human_id: "self".to_string(),
            name: "Me".to_string(),
        }],
    });

    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].text, "hello");
    assert_eq!(segments[0].start_ms, 0);
    assert_eq!(segments[1].text, "later");
    assert_eq!(segments[1].start_ms, 4_100);
}

#[test]
fn propagates_remote_labels_when_self_not_in_participant_list() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![RenderTranscriptInput {
            started_at: Some(0),
            words: vec![
                word("w1", " hello", 0, 100, 0),
                word("w2", " remote", 120, 220, 1),
                word("w3", " more", 240, 340, 1),
            ],
            assignments: vec![channel_assignment("remote", ChannelProfile::RemoteParty)],
        }],
        participant_human_ids: vec!["remote".to_string()],
        self_human_id: Some("self".to_string()),
        humans: vec![
            RenderTranscriptHuman {
                human_id: "self".to_string(),
                name: "Me".to_string(),
            },
            RenderTranscriptHuman {
                human_id: "remote".to_string(),
                name: "Remote".to_string(),
            },
        ],
    });

    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].speaker_label, "Me");
    assert_eq!(segments[1].speaker_label, "Remote");
    assert_eq!(segments[1].text, "remote more");
}

#[test]
fn keeps_missing_started_at_rows_anchored_at_zero() {
    let segments = render_transcript_segments(RenderTranscriptRequest {
        speaker_context: None,
        preview: None,
        transcripts: vec![
            RenderTranscriptInput {
                started_at: None,
                words: vec![word("missing-start", " hello", 0, 100, 0)],
                assignments: vec![],
            },
            RenderTranscriptInput {
                started_at: Some(1_000),
                words: vec![word("known-start", " later", 100, 200, 1)],
                assignments: vec![],
            },
        ],
        participant_human_ids: vec!["self".to_string(), "remote".to_string()],
        self_human_id: Some("self".to_string()),
        humans: vec![RenderTranscriptHuman {
            human_id: "self".to_string(),
            name: "Me".to_string(),
        }],
    });

    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].text, "hello");
    assert_eq!(segments[0].start_ms, 0);
    assert_eq!(segments[1].text, "later");
    assert_eq!(segments[1].start_ms, 100);
}
