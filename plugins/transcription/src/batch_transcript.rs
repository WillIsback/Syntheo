use serde::Serialize;
use sqlx::SqlitePool;
use syntheo_db_app::{
    BatchTranscriptInsert, BatchTranscriptReplace, BatchTranscriptRow,
    clear_incomplete_capture_markers, insert_batch_transcript, load_batch_transcript_by_id,
    load_session_batch_transcripts, mark_session_audio_transcription_complete,
};
use syntheo_transcript::{
    BatchRefinementOutcome, BatchRefinementRequest, BatchRefinementSource,
    BatchTranscriptPromotion, StoredLiveTranscriptDelta, StoredSpeakerHint, StoredTranscriptWord,
    materialize_live_transcript, parse_stored_speaker_hints, parse_stored_transcript_words,
    refine_batch_transcript, serialize_batch_transcript_hints, serialize_batch_transcript_words,
};

#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct SaveBatchTranscriptRequest {
    pub session_id: String,
    pub transcript_id: Option<String>,
    pub owner_user_id: String,
    pub created_at: String,
    pub started_at: f64,
    pub memo: String,
    pub provider: String,
    pub model: String,
    pub words: Vec<StoredTranscriptWord>,
    pub hints: Vec<StoredSpeakerHint>,
    pub promotion: BatchTranscriptPromotion,
    pub mark_audio_complete: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SaveBatchTranscriptOutcome {
    Saved { transcript_id: Option<String> },
    EmptyCurrentCapture,
    Truncated,
}

pub async fn save_batch_transcript(
    pool: &SqlitePool,
    request: SaveBatchTranscriptRequest,
) -> Result<SaveBatchTranscriptOutcome, String> {
    let SaveBatchTranscriptRequest {
        session_id,
        transcript_id,
        owner_user_id,
        created_at,
        started_at,
        memo,
        provider,
        model,
        words,
        hints,
        promotion,
        mark_audio_complete,
    } = request;
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;

    let source_rows = match &promotion {
        BatchTranscriptPromotion::WholeSession => {
            load_session_batch_transcripts(&mut transaction, &session_id)
                .await
                .map_err(|error| error.to_string())?
        }
        BatchTranscriptPromotion::CurrentCapture {
            replace_transcript_id: Some(replace_transcript_id),
            ..
        } => load_batch_transcript_by_id(&mut transaction, replace_transcript_id)
            .await
            .map_err(|error| error.to_string())?
            .into_iter()
            .collect(),
        BatchTranscriptPromotion::PreserveExisting
        | BatchTranscriptPromotion::CurrentCapture {
            replace_transcript_id: None,
            ..
        } => Vec::new(),
    };
    let previous_transcripts = source_rows
        .into_iter()
        .map(materialize_source_row)
        .collect::<Vec<_>>();

    let refinement = refine_batch_transcript(BatchRefinementRequest {
        words,
        hints,
        promotion,
        previous_transcripts,
    });

    let (words, speaker_hints, replace_session, replace_transcript_id, refined_started_at) =
        match refinement {
            BatchRefinementOutcome::Ready {
                words,
                speaker_hints,
                replace_session,
                replace_transcript_id,
                started_at,
            } => (
                words,
                speaker_hints,
                replace_session,
                replace_transcript_id,
                started_at,
            ),
            BatchRefinementOutcome::EmptyCurrentCapture => {
                transaction
                    .rollback()
                    .await
                    .map_err(|error| error.to_string())?;
                return Ok(SaveBatchTranscriptOutcome::EmptyCurrentCapture);
            }
            BatchRefinementOutcome::Truncated => {
                transaction
                    .rollback()
                    .await
                    .map_err(|error| error.to_string())?;
                return Ok(SaveBatchTranscriptOutcome::Truncated);
            }
        };

    let inserted_transcript_id =
        if let Some(transcript_id) = transcript_id.filter(|_| !words.is_empty()) {
            let insert = BatchTranscriptInsert {
                id: transcript_id.clone(),
                session_id: session_id.clone(),
                owner_user_id,
                created_at,
                started_at_ms: refined_started_at.unwrap_or(started_at),
                memo,
                provider,
                model,
                words_json: serialize_batch_transcript_words(&words)
                    .map_err(|error| error.to_string())?,
                speaker_hints_json: serialize_batch_transcript_hints(&speaker_hints)
                    .map_err(|error| error.to_string())?,
            };
            let inserted = insert_batch_transcript(
                &mut transaction,
                &insert,
                &BatchTranscriptReplace {
                    replace_session,
                    replace_transcript_id,
                },
            )
            .await
            .map_err(|error| error.to_string())?;
            inserted.then_some(transcript_id)
        } else {
            None
        };

    if replace_session {
        clear_incomplete_capture_markers(&mut transaction, &session_id)
            .await
            .map_err(|error| error.to_string())?;
    }
    if mark_audio_complete {
        mark_session_audio_transcription_complete(&mut transaction, &session_id)
            .await
            .map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;

    Ok(SaveBatchTranscriptOutcome::Saved {
        transcript_id: inserted_transcript_id,
    })
}

fn materialize_source_row(row: BatchTranscriptRow) -> BatchRefinementSource {
    let words = parse_stored_transcript_words(&row.words_json);
    let hints = parse_stored_speaker_hints(&row.speaker_hints_json);
    let deltas: Vec<StoredLiveTranscriptDelta> = row
        .pending_delta_jsons
        .iter()
        .filter_map(|delta_json| serde_json::from_str(delta_json).ok())
        .collect();
    let (words, speaker_hints) = materialize_live_transcript(words, hints, &deltas);

    BatchRefinementSource {
        id: row.id,
        started_at: row.started_at_ms as f64,
        words,
        speaker_hints,
    }
}

#[cfg(test)]
mod tests;
