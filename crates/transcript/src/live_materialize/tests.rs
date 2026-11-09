use super::*;
use crate::WordState;

fn word(id: &str, text: &str, start_ms: i64, end_ms: i64, channel: i32) -> StoredTranscriptWord {
    StoredTranscriptWord {
        id: id.to_string(),
        text: Some(text.to_string()),
        start_ms: Some(start_ms as f64),
        end_ms: Some(end_ms as f64),
        channel: Some(channel as f64),
        speaker: None,
        metadata: None,
    }
}

fn finalized_word(
    id: &str,
    text: &str,
    start_ms: i64,
    end_ms: i64,
    channel: i32,
    speaker_index: Option<i32>,
) -> FinalizedWord {
    FinalizedWord {
        id: id.to_string(),
        text: text.to_string(),
        start_ms,
        end_ms,
        channel,
        state: WordState::Final,
        speaker_index,
    }
}

fn delta(new_words: Vec<FinalizedWord>, replaced_ids: &[&str]) -> StoredLiveTranscriptDelta {
    StoredLiveTranscriptDelta {
        new_words,
        replaced_ids: replaced_ids.iter().map(|id| (*id).to_string()).collect(),
    }
}

fn hint(id: &str, word_id: Option<&str>, hint_type: &str, value: Value) -> StoredSpeakerHint {
    StoredSpeakerHint {
        id: id.to_string(),
        word_id: word_id.map(str::to_string),
        hint_type: hint_type.to_string(),
        value,
    }
}

fn assignment_hint(
    anchor: &str,
    word_ids: &[&str],
    extend_to_adjacent: Option<bool>,
) -> StoredSpeakerHint {
    let mut value = serde_json::Map::new();
    value.insert("human_id".to_string(), Value::String("human-1".to_string()));
    value.insert("scope".to_string(), Value::String("segment".to_string()));
    value.insert(
        "word_ids".to_string(),
        Value::Array(
            word_ids
                .iter()
                .map(|word_id| Value::String((*word_id).to_string()))
                .collect(),
        ),
    );
    if let Some(extend_to_adjacent) = extend_to_adjacent {
        value.insert(
            "extend_to_adjacent".to_string(),
            Value::Bool(extend_to_adjacent),
        );
    }
    hint(
        &format!("{anchor}:user_speaker_assignment:segment"),
        Some(anchor),
        "user_speaker_assignment",
        Value::String(Value::Object(value).to_string()),
    )
}

fn provider_hint(word_id: &str, channel: i32, speaker_index: i32) -> StoredSpeakerHint {
    hint(
        &format!("{word_id}:provider_speaker_index"),
        Some(word_id),
        "provider_speaker_index",
        Value::String(
            serde_json::json!({
                "channel": channel,
                "speaker_index": speaker_index
            })
            .to_string(),
        ),
    )
}

fn segment_word_ids(hint: &StoredSpeakerHint) -> Vec<String> {
    let Value::String(value) = &hint.value else {
        panic!("assignment value should be stored as JSON text");
    };
    serde_json::from_str::<Value>(value)
        .unwrap()
        .get("word_ids")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap().to_string())
        .collect()
}

#[test]
fn applies_replacements_and_discards_hints_for_replaced_words() {
    let old_word = word("word-1", "hello", 100, 200, 0);
    let old_hint = provider_hint("word-1", 0, 1);
    let (words, hints) = apply_live_transcript_delta(
        vec![old_word],
        vec![old_hint],
        &delta(
            vec![finalized_word("word-2", "hello", 100, 220, 0, None)],
            &["word-1"],
        ),
    );

    assert_eq!(words, vec![word("word-2", "hello", 100, 220, 0)]);
    assert!(hints.is_empty());
}

#[test]
fn keeps_segment_assignment_word_ids_current_when_a_scoped_word_is_replaced() {
    let assignment = assignment_hint("word-1", &["word-1", "word-2"], None);
    let (_, hints) = apply_live_transcript_delta(
        vec![
            word("word-1", "hello", 0, 100, 0),
            word("word-2", "there", 100, 200, 0),
        ],
        vec![assignment],
        &delta(
            vec![finalized_word("word-2b", "there", 100, 220, 0, None)],
            &["word-2"],
        ),
    );

    assert_eq!(hints.len(), 1);
    assert_eq!(hints[0].id, "word-1:user_speaker_assignment:segment");
    assert_eq!(hints[0].word_id.as_deref(), Some("word-1"));
    assert_eq!(segment_word_ids(&hints[0]), ["word-1", "word-2b"]);
}

#[test]
fn moves_a_segment_assignment_anchor_when_the_anchor_word_is_replaced() {
    let assignment = assignment_hint("word-1", &["word-1", "word-2"], None);
    let (_, hints) = apply_live_transcript_delta(
        vec![
            word("word-1", "hello", 0, 100, 0),
            word("word-2", "there", 100, 200, 0),
        ],
        vec![assignment],
        &delta(
            vec![
                finalized_word("word-1b", "hello", 0, 110, 0, None),
                finalized_word("word-2b", "there", 110, 220, 0, None),
            ],
            &["word-1", "word-2"],
        ),
    );

    assert_eq!(hints.len(), 1);
    assert_eq!(hints[0].id, "word-1b:user_speaker_assignment:segment");
    assert_eq!(hints[0].word_id.as_deref(), Some("word-1b"));
    assert_eq!(segment_word_ids(&hints[0]), ["word-1b", "word-2b"]);
}

#[test]
fn does_not_expand_an_unindexed_assignment_as_live_words_arrive() {
    for replace in [false, true] {
        let assignment = assignment_hint("selected", &["selected"], None);
        let mut new_words = Vec::new();
        let mut replaced_ids = Vec::new();
        if replace {
            new_words.push(finalized_word("replacement", "hello", 0, 100, 2, None));
            replaced_ids.push("selected");
        }
        new_words.push(finalized_word("other", "another voice", 100, 200, 2, None));

        let (_, hints) = apply_live_transcript_delta(
            vec![word("selected", "hello", 0, 100, 2)],
            vec![assignment],
            &delta(new_words, &replaced_ids),
        );

        assert_eq!(
            segment_word_ids(&hints[0]),
            [if replace { "replacement" } else { "selected" }]
        );
    }
}

#[test]
fn keeps_reconstructed_indexed_word_selections_fixed_during_live_persistence() {
    let words = vec![
        word("first", "first", 0, 100, 1),
        word("other", "other", 100, 200, 1),
        word("last", "last", 200, 300, 1),
    ];
    let hints = vec![
        provider_hint("first", 1, 0),
        provider_hint("other", 1, 0),
        provider_hint("last", 1, 0),
        assignment_hint("first", &["first", "last"], Some(false)),
    ];
    let (_, hints) = apply_live_transcript_delta(
        words,
        hints,
        &delta(
            vec![finalized_word("appended", "another", 300, 400, 1, Some(0))],
            &[],
        ),
    );
    let assignment = hints
        .iter()
        .find(|hint| hint.hint_type == "user_speaker_assignment")
        .unwrap();

    assert_eq!(segment_word_ids(assignment), ["first", "last"]);
}

#[test]
fn adds_appended_live_words_to_a_continuing_segment_assignment() {
    let words = vec![
        word("word-1", "hello", 0, 100, 0),
        word("word-2", "there", 100, 200, 0),
    ];
    let hints = vec![
        provider_hint("word-1", 0, 2),
        provider_hint("word-2", 0, 2),
        assignment_hint("word-1", &["word-1", "word-2"], None),
    ];
    let (_, hints) = apply_live_transcript_delta(
        words,
        hints,
        &delta(
            vec![finalized_word("word-3", "again", 200, 300, 0, Some(2))],
            &[],
        ),
    );
    let assignment = hints
        .iter()
        .find(|hint| hint.hint_type == "user_speaker_assignment")
        .unwrap();

    assert_eq!(segment_word_ids(assignment), ["word-1", "word-2", "word-3"]);
}

#[test]
fn does_not_add_unrelated_words_from_a_delta_to_a_segment_assignment() {
    let words = vec![
        word("word-1", "hello", 0, 100, 0),
        word("word-2", "there", 100, 200, 0),
    ];
    let hints = vec![
        provider_hint("word-1", 0, 2),
        provider_hint("word-2", 0, 2),
        assignment_hint("word-1", &["word-1", "word-2"], None),
    ];
    let (_, hints) = apply_live_transcript_delta(
        words,
        hints,
        &delta(
            vec![
                finalized_word("word-3", "again", 200, 300, 0, Some(2)),
                finalized_word("word-4", "other", 300, 400, 0, Some(3)),
                finalized_word("word-5", "later", 400, 500, 0, Some(2)),
            ],
            &[],
        ),
    );
    let assignment = hints
        .iter()
        .find(|hint| hint.hint_type == "user_speaker_assignment")
        .unwrap();

    assert_eq!(segment_word_ids(assignment), ["word-1", "word-2", "word-3"]);
}

#[test]
fn coalesces_a_word_that_is_replaced_then_readded() {
    let deltas = vec![
        delta(
            vec![finalized_word("word-1", "first", 0, 100, 0, None)],
            &[],
        ),
        delta(
            vec![finalized_word("word-2", "interim", 0, 110, 0, None)],
            &["word-1"],
        ),
        delta(
            vec![finalized_word("word-1", "final", 0, 120, 0, None)],
            &["word-2"],
        ),
    ];
    let coalesced = coalesce_live_transcript_deltas(&deltas);

    assert_eq!(coalesced.replaced_ids, ["word-1"]);
    assert_eq!(coalesced.new_words.len(), 1);
    assert_eq!(coalesced.new_words[0].id, "word-1");
    assert_eq!(coalesced.new_words[0].text, "final");
}

#[test]
fn materialization_without_deltas_is_a_noop() {
    let words = vec![
        word("word-2", "second", 100, 200, 0),
        word("word-1", "first", 0, 100, 0),
    ];
    let hints = vec![hint("z", Some("z"), "custom", Value::Null)];
    let (actual_words, actual_hints) =
        materialize_live_transcript(words.clone(), hints.clone(), &[]);

    assert_eq!(actual_words, words);
    assert_eq!(actual_hints, hints);
}

#[test]
fn serializes_batch_words_and_hints_with_integer_numbers() {
    let words = vec![StoredTranscriptWord {
        id: "word-1".to_string(),
        text: None,
        start_ms: Some(1200.0),
        end_ms: None,
        channel: Some(0.0),
        speaker: None,
        metadata: Some(Value::Null),
    }];
    let hints = vec![hint(
        "hint-1",
        None,
        "custom",
        Value::String("value".to_string()),
    )];

    assert_eq!(
        serde_json::from_str::<Value>(&serialize_batch_transcript_words(&words).unwrap()).unwrap(),
        serde_json::json!([{
            "id": "word-1",
            "text": "",
            "start_ms": 1200,
            "end_ms": 1200,
            "channel": 0,
        }])
    );
    assert_eq!(
        serde_json::from_str::<Value>(&serialize_batch_transcript_hints(&hints).unwrap()).unwrap(),
        serde_json::json!([{
            "id": "hint-1",
            "word_id": "",
            "type": "custom",
            "value": "value",
        }])
    );
}
