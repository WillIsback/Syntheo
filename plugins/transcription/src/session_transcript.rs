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
mod tests;
