use std::collections::HashSet;

use crate::transaction_utils::{js_iso8601_timestamp, rollback_row_count_mismatch};
use serde::{Deserialize, Serialize};
use specta::Type;
use sqlx::SqlitePool;
use syntheo_db_app::{
    GeneratedSummaryBodyUpdate, PendingAutoEnhanceMatch, delete_pending_auto_enhance,
    update_generated_summary_body, upsert_session_tag, upsert_tag,
};

const DEFAULT_USER_ID: &str = "00000000-0000-0000-0000-000000000000";
const PENDING_AUTO_ENHANCE_SETTING_PREFIX: &str = "auto_enhance_pending:";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PendingAutoEnhanceGuard {
    pub generation: String,
    pub expected_body: String,
    pub expected_body_format: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SaveGeneratedSummaryRequest {
    pub session_id: String,
    pub owner_user_id: String,
    pub note_id: String,
    pub current_body: String,
    pub current_body_format: String,
    pub next_body: String,
    pub tag_names: Vec<String>,
    pub pending_auto_enhance: Option<PendingAutoEnhanceGuard>,
    /// Empreinte de la note brute qui a servi à générer la synthèse (issue
    /// 415) : la note modifiée ensuite propose « Régénérer avec mes notes ».
    #[serde(default)]
    pub source_note_fingerprint: Option<String>,
    /// Passages balisés par le modèle et validés contre la note brute (issue
    /// 417). Les balises sont déjà retirées du corps ; `None` : aucune balise.
    #[serde(default)]
    pub note_passages: Option<Vec<String>>,
}

pub async fn save_generated_summary(
    pool: &SqlitePool,
    request: SaveGeneratedSummaryRequest,
) -> Result<(), String> {
    let SaveGeneratedSummaryRequest {
        session_id,
        owner_user_id,
        note_id,
        current_body,
        current_body_format,
        next_body,
        tag_names,
        pending_auto_enhance,
        source_note_fingerprint,
        note_passages,
    } = request;
    let note_passages_json = note_passages
        .map(|passages| serde_json::to_string(&passages))
        .transpose()
        .map_err(|error| error.to_string())?;

    let timestamp = js_iso8601_timestamp();
    let trimmed_user_id = owner_user_id.trim();
    let user_id = if trimmed_user_id.is_empty() {
        DEFAULT_USER_ID
    } else {
        trimmed_user_id
    };
    let pending_setting_id = format!("{PENDING_AUTO_ENHANCE_SETTING_PREFIX}{session_id}");
    let pending_match = pending_auto_enhance
        .as_ref()
        .map(|pending| PendingAutoEnhanceMatch {
            pending_setting_id: &pending_setting_id,
            generation: &pending.generation,
            expected_body: &pending.expected_body,
            expected_body_format: &pending.expected_body_format,
        });
    let mut unique_tags = HashSet::new();
    let tag_names = tag_names
        .into_iter()
        .filter(|tag_name| !tag_name.is_empty() && unique_tags.insert(tag_name.clone()))
        .collect::<Vec<_>>();

    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;

    let updated = update_generated_summary_body(
        &mut transaction,
        GeneratedSummaryBodyUpdate {
            note_id: &note_id,
            session_id: &session_id,
            current_body: &current_body,
            current_body_format: &current_body_format,
            next_body: &next_body,
            updated_at: &timestamp,
            pending_auto_enhance: pending_match,
            source_note_fingerprint: source_note_fingerprint.as_deref(),
            note_passages_json: note_passages_json.as_deref(),
        },
    )
    .await
    .map_err(|error| error.to_string())?;
    if updated != 1 {
        return Err(rollback_row_count_mismatch(transaction, 0, updated, 1).await);
    }

    let deleted = delete_pending_auto_enhance(
        &mut transaction,
        &pending_setting_id,
        &note_id,
        &current_body,
        pending_match.as_ref(),
    )
    .await
    .map_err(|error| error.to_string())?;
    if pending_match.is_some() && deleted != 1 {
        return Err(rollback_row_count_mismatch(transaction, 1, deleted, 1).await);
    }

    let mut statement_index = 2;
    for tag_name in tag_names {
        let tag_rows = upsert_tag(&mut transaction, user_id, &tag_name, &timestamp)
            .await
            .map_err(|error| error.to_string())?;
        if tag_rows != 1 {
            return Err(
                rollback_row_count_mismatch(transaction, statement_index, tag_rows, 1).await,
            );
        }
        statement_index += 1;

        let session_tag_rows = upsert_session_tag(
            &mut transaction,
            &session_id,
            user_id,
            &tag_name,
            &timestamp,
        )
        .await
        .map_err(|error| error.to_string())?;
        if session_tag_rows != 1 {
            return Err(rollback_row_count_mismatch(
                transaction,
                statement_index,
                session_tag_rows,
                1,
            )
            .await);
        }
        statement_index += 1;
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests;
