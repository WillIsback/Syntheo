use syntheo_db_app::prepare_schema;
use syntheo_db_core::Db;

use super::*;

async fn test_db() -> Db {
    let db = Db::connect_memory_plain().await.unwrap();
    prepare_schema(&db).await.unwrap();
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, owner_user_id)
             VALUES ('session-1', 'workspace-1', 'owner-human')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO humans (id, name, email)
             VALUES
                ('owner-human', 'Owner', 'owner@example.com'),
                ('speaker-human', 'Assigned Speaker', 'speaker@example.com')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO session_participants
                (id, session_id, human_id, display_name, email, source, created_at)
             VALUES ('participant', 'session-1', 'speaker-human', '', '', 'manual', '2026-01-01')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    let words = serde_json::json!([{
        "id": "earlier-word",
        "text": "earlier",
        "start_ms": 0,
        "end_ms": 400,
        "channel": 0
    }]);
    sqlx::query(
        "INSERT INTO transcripts
                (id, session_id, started_at_ms, ended_at_ms, words_json, speaker_hints_json)
             VALUES ('transcript-1', 'session-1', 1000, 2000, ?, '[]')",
    )
    .bind(words.to_string())
    .execute(db.pool())
    .await
    .unwrap();

    let hints = serde_json::json!([
        {
            "id": "pending-word:provider_speaker_index",
            "word_id": "pending-word",
            "type": "provider_speaker_index",
            "value": r#"{"channel":1,"speaker_index":7}"#
        },
        {
            "word_id": "pending-word",
            "type": "user_speaker_assignment",
            "value": r#"{"human_id":"speaker-human","scope":"speaker","channel":1,"speaker_index":7}"#
        },
    ]);
    sqlx::query(
        "INSERT INTO transcripts
                (id, session_id, started_at_ms, ended_at_ms, words_json, speaker_hints_json)
             VALUES ('transcript-2', 'session-1', 500, 4000, '[]', ?)",
    )
    .bind(hints.to_string())
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO transcript_live_state (transcript_id, next_sequence)
             VALUES ('transcript-2', 1)",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let delta = serde_json::json!({
        "new_words": [{
            "id": "pending-word",
            "text": "pending word",
            "start_ms": 500,
            "end_ms": 900,
            "channel": 1,
            "speaker_index": 7,
            "state": "final"
        }],
        "replaced_ids": [],
        "partials": []
    });
    sqlx::query(
        "INSERT INTO transcript_live_deltas (id, transcript_id, sequence, delta_json)
             VALUES ('delta-1', 'transcript-2', 0, ?)",
    )
    .bind(delta.to_string())
    .execute(db.pool())
    .await
    .unwrap();
    db
}

#[tokio::test]
async fn render_session_transcript_materializes_pending_words_with_assigned_human_and_transcript_dates()
 {
    let db = test_db().await;
    let rendered = render_session_transcript(
        db.pool(),
        RenderSessionTranscriptRequest {
            session_id: "session-1".to_string(),
            self_human_id: Some("owner-human".to_string()),
        },
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(rendered.started_at, Some(500));
    assert_eq!(rendered.ended_at, Some(4000));
    assert!(rendered.segments.iter().any(|segment| {
        segment.speaker_label == "Assigned Speaker" && segment.text.contains("pending word")
    }));
}

// Issue 353 : une capture par reprise après une pause. La synthèse reçoit
// toutes les captures de la note, dans l'ordre chronologique, sur une
// seule chronologie qui part du début de la première capture.
#[tokio::test]
async fn render_session_transcript_chains_paused_captures_in_chronological_order() {
    let db = test_db().await;
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, owner_user_id)
             VALUES ('session-paused', 'workspace-1', 'owner-human')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    // Identifiants et ordre d'insertion à rebours du temps : seul
    // `started_at_ms` doit décider de l'ordre.
    for (id, started_at, ended_at, text) in [
        ("a-after-resume", 1_120_000_i64, 1_180_000_i64, "after"),
        ("b-before-pause", 1_000_000_i64, 1_060_000_i64, "before"),
    ] {
        let words = serde_json::json!([{
            "id": format!("{id}-word"),
            "text": text,
            "start_ms": 1000,
            "end_ms": 1500,
            "channel": 0
        }]);
        sqlx::query(
            "INSERT INTO transcripts
                    (id, session_id, started_at_ms, ended_at_ms, words_json, speaker_hints_json)
                 VALUES (?, 'session-paused', ?, ?, ?, '[]')",
        )
        .bind(id)
        .bind(started_at)
        .bind(ended_at)
        .bind(words.to_string())
        .execute(db.pool())
        .await
        .unwrap();
    }

    let rendered = render_session_transcript(
        db.pool(),
        RenderSessionTranscriptRequest {
            session_id: "session-paused".to_string(),
            self_human_id: Some("owner-human".to_string()),
        },
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(rendered.started_at, Some(1_000_000));
    assert_eq!(rendered.ended_at, Some(1_180_000));
    let words = rendered
        .segments
        .iter()
        .flat_map(|segment| segment.words.iter())
        .map(|word| (word.text.trim().to_string(), word.start_ms))
        .collect::<Vec<_>>();
    assert_eq!(
        words,
        vec![("before".to_string(), 1000), ("after".to_string(), 121_000)]
    );
}

fn remote_capture(started_at: i64, id: &str, text: &str) -> RenderTranscriptInput {
    RenderTranscriptInput {
        started_at: Some(started_at),
        words: vec![syntheo_transcript::RenderTranscriptWordInput {
            id: id.to_string(),
            text: text.to_string(),
            start_ms: 1000,
            end_ms: 1500,
            channel: 1,
            speaker_index: Some(0),
            synthetic_timing: None,
        }],
        assignments: vec![],
    }
}

fn labels(segments: &[RenderedTranscriptSegment]) -> Vec<(String, String, i64)> {
    segments
        .iter()
        .map(|segment| {
            (
                segment.speaker_label.clone(),
                segment.text.clone(),
                segment.start_ms,
            )
        })
        .collect()
}

// Issue 414 : après une pause, « Locuteur 1 » de la partie 2 n'est pas
// forcément « Locuteur 1 » de la partie 1. Chaque capture garde sa propre
// numérotation, comme dans la transcription et les cartes de nommage.
#[test]
fn anonymous_speakers_of_separate_captures_stay_distinct() {
    let segments = render_captures(
        vec![
            remote_capture(1_120_000, "after-word", "after"),
            remote_capture(1_000_000, "before-word", "before"),
        ],
        vec![],
        Some("owner-human".to_string()),
        vec![],
    );

    assert_eq!(
        labels(&segments),
        vec![
            ("Speaker 1 (part 1)".to_string(), "before".to_string(), 1000),
            (
                "Speaker 1 (part 2)".to_string(),
                "after".to_string(),
                121_000
            ),
        ]
    );
}

#[test]
fn single_capture_keeps_plain_anonymous_labels() {
    let segments = render_captures(
        vec![remote_capture(1_000_000, "only-word", "only")],
        vec![],
        Some("owner-human".to_string()),
        vec![],
    );

    assert_eq!(
        labels(&segments),
        vec![("Speaker 1".to_string(), "only".to_string(), 1000)]
    );
}

#[test]
fn named_speakers_are_not_suffixed_across_captures() {
    let mut named = remote_capture(1_000_000, "named-word", "named");
    named.words[0].channel = 0;
    let segments = render_captures(
        vec![named, remote_capture(1_120_000, "anon-word", "anon")],
        vec![],
        Some("owner-human".to_string()),
        vec![RenderTranscriptHuman {
            human_id: "owner-human".to_string(),
            name: "Owner".to_string(),
        }],
    );

    assert_eq!(
        labels(&segments),
        vec![
            ("Owner".to_string(), "named".to_string(), 1000),
            (
                "Speaker 1 (part 2)".to_string(),
                "anon".to_string(),
                121_000
            ),
        ]
    );
}
