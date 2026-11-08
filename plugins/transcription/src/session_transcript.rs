use std::collections::HashSet;

use serde_json::Value;
use sqlx::SqlitePool;
use syntheo_db_app::{
    load_render_humans, load_session_render_participant_ids, load_session_render_transcripts,
};
use syntheo_transcript::{
    RenderTranscriptHuman, RenderTranscriptInput, RenderTranscriptRequest,
    RenderedTranscriptSegment, StoredLiveTranscriptDelta, StoredSpeakerHint,
    materialize_live_transcript, parse_stored_speaker_hints, parse_stored_transcript_words,
    render_input_from_stored, render_transcript_segments,
};

#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct RenderSessionTranscriptRequest {
    pub session_id: String,
    pub self_human_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct RenderedSessionTranscript {
    pub segments: Vec<RenderedTranscriptSegment>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
}

pub async fn render_session_transcript(
    pool: &SqlitePool,
    request: RenderSessionTranscriptRequest,
) -> Result<Option<RenderedSessionTranscript>, String> {
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let rows = load_session_render_transcripts(&mut transaction, &request.session_id)
        .await
        .map_err(|error| error.to_string())?;
    if rows.is_empty() {
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())?;
        return Ok(None);
    }

    let started_at = rows.iter().map(|transcript| transcript.started_at_ms).min();
    let ended_at = rows
        .iter()
        .filter_map(|transcript| transcript.ended_at_ms)
        .max();
    let participant_human_ids =
        load_session_render_participant_ids(&mut transaction, &request.session_id)
            .await
            .map_err(|error| error.to_string())?;
    let self_human_id = request.self_human_id.filter(|id| !id.is_empty());
    let mut human_ids = Vec::new();
    let mut seen_human_ids = HashSet::new();
    if let Some(self_id) = &self_human_id {
        insert_human_id(&mut human_ids, &mut seen_human_ids, self_id);
    }
    for participant_id in &participant_human_ids {
        insert_human_id(&mut human_ids, &mut seen_human_ids, participant_id);
    }

    let mut transcripts = Vec::new();
    for row in rows {
        let words = parse_stored_transcript_words(&row.words_json);
        let hints = parse_stored_speaker_hints(&row.speaker_hints_json);
        let deltas = row
            .pending_delta_jsons
            .iter()
            .filter_map(|json| serde_json::from_str::<StoredLiveTranscriptDelta>(json).ok())
            .collect::<Vec<_>>();
        let (words, hints) = materialize_live_transcript(words, hints, &deltas);

        for hint in &hints {
            if let Some(human_id) = assigned_human_id(hint) {
                insert_human_id(&mut human_ids, &mut seen_human_ids, &human_id);
            }
        }
        if let Some(transcript) = render_input_from_stored(Some(row.started_at_ms), &words, &hints)
        {
            transcripts.push(transcript);
        }
    }

    if transcripts.is_empty() {
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())?;
        return Ok(None);
    }

    let humans = load_render_humans(&mut transaction, &human_ids)
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|(human_id, name)| RenderTranscriptHuman { human_id, name })
        .collect();
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;

    let segments = render_captures(transcripts, participant_human_ids, self_human_id, humans);
    Ok(Some(RenderedSessionTranscript {
        segments,
        started_at,
        ended_at,
    }))
}

/// Renders each capture on its own, as the transcript tab and the speaker
/// naming cards do, then lays every capture on one timeline that starts with
/// the earliest one. Provider speaker indices restart with each capture (a
/// pause starts a new one, issue 353), so an anonymous "Speaker 1" of part 2
/// is not known to be the "Speaker 1" of part 1: when the note has several
/// captures, anonymous labels carry their part (issue 414). Named speakers are
/// resolved per capture already and keep their names.
fn render_captures(
    transcripts: Vec<RenderTranscriptInput>,
    participant_human_ids: Vec<String>,
    self_human_id: Option<String>,
    humans: Vec<RenderTranscriptHuman>,
) -> Vec<RenderedTranscriptSegment> {
    let base_started_at = transcripts
        .iter()
        .filter_map(|transcript| transcript.started_at)
        .min()
        .unwrap_or(0);
    let mut captures = transcripts
        .into_iter()
        .map(|transcript| {
            let offset = transcript
                .started_at
                .map_or(0, |started_at| started_at - base_started_at);
            let mut segments = render_transcript_segments(RenderTranscriptRequest {
                transcripts: vec![transcript],
                participant_human_ids: participant_human_ids.clone(),
                self_human_id: self_human_id.clone(),
                humans: humans.clone(),
                speaker_context: None,
                preview: None,
            });
            for segment in &mut segments {
                shift_segment(segment, offset);
            }
            (offset, segments)
        })
        .filter(|(_, segments)| segments.iter().any(|segment| !segment.words.is_empty()))
        .collect::<Vec<_>>();
    captures.sort_by_key(|(offset, _)| *offset);

    let several = captures.len() > 1;
    let mut segments = Vec::new();
    for (index, (_, capture)) in captures.into_iter().enumerate() {
        for mut segment in capture {
            if several && is_anonymous_speaker(&segment) {
                segment.speaker_label = format!("{} (part {})", segment.speaker_label, index + 1);
            }
            segments.push(segment);
        }
    }
    segments.sort_by_key(|segment| segment.start_ms);
    segments
}

fn shift_segment(segment: &mut RenderedTranscriptSegment, offset: i64) {
    if offset == 0 {
        return;
    }
    segment.start_ms += offset;
    segment.end_ms += offset;
    for word in &mut segment.words {
        word.start_ms += offset;
        word.end_ms += offset;
    }
}

/// Same rule as `isAnonymousSpeakerLabel` on the desktop side.
fn is_anonymous_speaker(segment: &RenderedTranscriptSegment) -> bool {
    if segment.key.speaker_human_id.is_some() || segment.provisional_speaker.is_some() {
        return false;
    }
    segment
        .speaker_label
        .strip_prefix("Speaker ")
        .is_some_and(|rest| {
            matches!(rest, "A" | "B" | "C")
                || (!rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
        })
}

fn assigned_human_id(hint: &StoredSpeakerHint) -> Option<String> {
    if hint.hint_type != "automatic_speaker_assignment"
        && hint.hint_type != "user_speaker_assignment"
    {
        return None;
    }
    let value = match &hint.value {
        Value::String(json) => serde_json::from_str::<Value>(json).ok()?,
        value => value.clone(),
    };
    let human_id = value.get("human_id")?.as_str()?;
    (!human_id.is_empty()).then(|| human_id.to_string())
}

fn insert_human_id(
    human_ids: &mut Vec<String>,
    seen_human_ids: &mut HashSet<String>,
    human_id: &str,
) {
    if !human_id.is_empty() && seen_human_ids.insert(human_id.to_string()) {
        human_ids.push(human_id.to_string());
    }
}

#[cfg(test)]
mod tests {
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
}
