use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use sqlx::{SqliteConnection, SqlitePool};

use crate::contacts::run_write;
use crate::transaction_utils::js_iso8601_timestamp;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct MergeHumansRequest {
    pub selected_human_id: String,
    pub duplicate_human_id: String,
}

fn merge_text(primary: &str, duplicate: &str) -> String {
    if duplicate.is_empty() {
        return primary.to_string();
    }
    if !primary.is_empty() {
        return format!("{primary}, {duplicate}");
    }
    duplicate.to_string()
}

fn reassign_human_id(value: &mut Value, primary_id: &str, duplicate_id: &str) -> bool {
    if value.get("human_id").and_then(Value::as_str) != Some(duplicate_id) {
        return false;
    }
    value["human_id"] = Value::String(primary_id.to_owned());
    true
}

async fn reassign_speaker_references(
    conn: &mut SqliteConnection,
    primary_id: &str,
    primary_name: &str,
    duplicate_id: &str,
    now: &str,
) -> Result<(), String> {
    let transcripts: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, speaker_hints_json FROM transcripts WHERE instr(speaker_hints_json, ?) > 0",
    )
    .bind(duplicate_id)
    .fetch_all(&mut *conn)
    .await
    .map_err(|error| error.to_string())?;
    for (id, json) in transcripts {
        let Ok(mut hints) = serde_json::from_str::<Value>(&json) else {
            continue;
        };
        let Some(hints_array) = hints.as_array_mut() else {
            continue;
        };
        let mut changed = false;
        for hint in hints_array {
            if !matches!(
                hint.get("type").and_then(Value::as_str),
                Some("automatic_speaker_assignment" | "user_speaker_assignment")
            ) {
                continue;
            }
            let Some(value) = hint.get_mut("value") else {
                continue;
            };
            // Older imports encode assignment values as JSON strings.
            if let Some(encoded) = value.as_str() {
                let Ok(mut assignment) = serde_json::from_str::<Value>(encoded) else {
                    continue;
                };
                if reassign_human_id(&mut assignment, primary_id, duplicate_id) {
                    *value = Value::String(assignment.to_string());
                    changed = true;
                }
            } else {
                changed |= reassign_human_id(value, primary_id, duplicate_id);
            }
        }
        if changed {
            sqlx::query(
                "UPDATE transcripts SET speaker_hints_json = ?, updated_at = ? WHERE id = ?",
            )
            .bind(hints.to_string())
            .bind(now)
            .bind(id)
            .execute(&mut *conn)
            .await
            .map_err(|error| error.to_string())?;
        }
    }

    let sessions: Vec<(String, String)> =
        sqlx::query_as("SELECT id, metadata_json FROM sessions WHERE instr(metadata_json, ?) > 0")
            .bind(duplicate_id)
            .fetch_all(&mut *conn)
            .await
            .map_err(|error| error.to_string())?;
    for (id, json) in sessions {
        let Ok(mut metadata) = serde_json::from_str::<Value>(&json) else {
            continue;
        };
        let Some(intervals) = metadata
            .pointer_mut("/speaker_context/intervals")
            .and_then(Value::as_array_mut)
        else {
            continue;
        };
        let mut changed = false;
        for interval in intervals {
            if let Some(participants) = interval
                .get_mut("participants")
                .and_then(Value::as_array_mut)
            {
                for participant in participants {
                    changed |= reassign_human_id(participant, primary_id, duplicate_id);
                    if !primary_name.trim().is_empty()
                        && participant.get("human_id").and_then(Value::as_str) == Some(primary_id)
                        && participant.get("name").and_then(Value::as_str) != Some(primary_name)
                    {
                        participant["name"] = Value::String(primary_name.to_owned());
                        changed = true;
                    }
                }
            }
        }
        if changed {
            sqlx::query("UPDATE sessions SET metadata_json = ?, updated_at = ? WHERE id = ?")
                .bind(metadata.to_string())
                .bind(now)
                .bind(id)
                .execute(&mut *conn)
                .await
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub async fn merge_humans(pool: &SqlitePool, request: MergeHumansRequest) -> Result<(), String> {
    let now = js_iso8601_timestamp();
    let selected = request.selected_human_id;
    let duplicate = request.duplicate_human_id;
    run_write(pool, |conn| {
        let now = now.clone();
        Box::pin(async move {
            let rows = syntheo_db_app::list_merge_humans(conn, &selected, &duplicate)
                .await
                .map_err(|error| error.to_string())?;
            let self_human_id = rows
                .iter()
                .find(|row| row.id == row.owner_user_id)
                .map(|row| row.id.clone())
                .unwrap_or_else(|| {
                    if duplicate == syntheo_db_app::DEFAULT_USER_ID {
                        duplicate.clone()
                    } else {
                        selected.clone()
                    }
                });
            let primary_id = if self_human_id == duplicate {
                duplicate.clone()
            } else {
                selected.clone()
            };
            let duplicate_id = if primary_id == selected {
                duplicate.clone()
            } else {
                selected.clone()
            };
            let Some(primary) = rows.iter().find(|row| row.id == primary_id) else {
                return Err("Both contacts must exist before they can be merged".to_string());
            };
            let Some(duplicate_row) = rows.iter().find(|row| row.id == duplicate_id) else {
                return Err("Both contacts must exist before they can be merged".to_string());
            };
            let organization_id = if primary.organization_id.is_empty() {
                duplicate_row.organization_id.clone()
            } else {
                primary.organization_id.clone()
            };
            let job_title = merge_text(&primary.job_title, &duplicate_row.job_title);
            let linkedin_username =
                merge_text(&primary.linkedin_username, &duplicate_row.linkedin_username);
            let phone = merge_text(&primary.phone, &duplicate_row.phone);
            let memo = merge_text(&primary.memo, &duplicate_row.memo);

            let mut extra_emails =
                syntheo_db_app::human_additional_emails_from_metadata(&primary.metadata_json);
            let email = if primary.email.trim().is_empty() {
                duplicate_row.email.clone()
            } else {
                extra_emails.push(duplicate_row.email.clone());
                primary.email.clone()
            };
            extra_emails.extend(syntheo_db_app::human_additional_emails_from_metadata(
                &duplicate_row.metadata_json,
            ));
            let additional_emails =
                syntheo_db_app::normalize_additional_emails(&email, extra_emails);
            let additional_emails_json = if additional_emails.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&additional_emails).map_err(|error| error.to_string())?)
            };

            syntheo_db_app::tombstone_duplicate_participant_mappings(
                conn,
                &now,
                &duplicate_id,
                &primary_id,
            )
            .await
            .map_err(|error| error.to_string())?;
            syntheo_db_app::reassign_participant_mappings(conn, &primary_id, &duplicate_id, &now)
                .await
                .map_err(|error| error.to_string())?;
            reassign_speaker_references(conn, &primary_id, &primary.name, &duplicate_id, &now)
                .await?;
            syntheo_db_app::update_merged_human(
                conn,
                &job_title,
                &linkedin_username,
                &phone,
                &memo,
                &organization_id,
                &email,
                additional_emails_json.as_deref(),
                &now,
                &primary_id,
            )
            .await
            .map_err(|error| error.to_string())?;
            syntheo_db_app::soft_delete_contact(conn, "humans", &duplicate_id, &now)
                .await
                .map_err(|error| error.to_string())?;
            Ok(())
        })
    })
    .await
}

#[cfg(test)]
mod tests;
