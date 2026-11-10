use serde::{Deserialize, Serialize};
use specta::Type;
use sqlx::SqlitePool;

use crate::contacts::{ContactKind, run_write};
use crate::transaction_utils::js_iso8601_timestamp;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct UpdateHumanRequest {
    pub human_id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub job_title: Option<String>,
    pub linkedin_username: Option<String>,
    pub memo: Option<String>,
    pub organization_id: Option<String>,
    pub additional_emails: Option<Vec<String>>,
}

pub async fn update_human(pool: &SqlitePool, request: UpdateHumanRequest) -> Result<(), String> {
    let assignments: Vec<(&'static str, String)> = [
        ("name = ?", &request.name),
        ("email = ?", &request.email),
        ("phone = ?", &request.phone),
        ("job_title = ?", &request.job_title),
        ("linkedin_username = ?", &request.linkedin_username),
        ("memo = ?", &request.memo),
        ("organization_id = ?", &request.organization_id),
    ]
    .into_iter()
    .filter_map(|(column, value)| value.clone().map(|value| (column, value)))
    .collect();
    if assignments.is_empty() && request.additional_emails.is_none() {
        return Ok(());
    }

    let now = js_iso8601_timestamp();
    run_write(pool, |conn| {
        Box::pin(async move {
            if !assignments.is_empty() {
                syntheo_db_app::update_contact_fields(
                    conn,
                    "humans",
                    &assignments,
                    &now,
                    &request.human_id,
                )
                .await
                .map_err(|error| error.to_string())?;
            }
            let additional_emails = match &request.additional_emails {
                Some(emails) => {
                    let primary_email = match &request.email {
                        Some(email) => email.clone(),
                        None => sqlx::query_scalar::<_, String>(
                            "SELECT email FROM humans WHERE id = ? AND deleted_at IS NULL",
                        )
                        .bind(&request.human_id)
                        .fetch_optional(&mut *conn)
                        .await
                        .map_err(|error| error.to_string())?
                        .unwrap_or_default(),
                    };
                    Some(syntheo_db_app::normalize_additional_emails(
                        &primary_email,
                        emails.iter().cloned(),
                    ))
                }
                // A new primary must not also stay in the additional list.
                None if request.email.is_some() => {
                    let metadata_json: Option<String> = sqlx::query_scalar(
                        "SELECT metadata_json FROM humans WHERE id = ? AND deleted_at IS NULL",
                    )
                    .bind(&request.human_id)
                    .fetch_optional(&mut *conn)
                    .await
                    .map_err(|error| error.to_string())?;
                    let stored = syntheo_db_app::human_additional_emails_from_metadata(
                        metadata_json.as_deref().unwrap_or("{}"),
                    );
                    let normalized = syntheo_db_app::normalize_additional_emails(
                        request.email.as_deref().unwrap_or_default(),
                        stored.iter().cloned(),
                    );
                    (normalized != stored).then_some(normalized)
                }
                None => None,
            };
            if let Some(normalized) = additional_emails {
                let additional_emails_json = if normalized.is_empty() {
                    None
                } else {
                    Some(serde_json::to_string(&normalized).map_err(|error| error.to_string())?)
                };
                syntheo_db_app::update_human_additional_emails(
                    conn,
                    additional_emails_json.as_deref(),
                    &now,
                    &request.human_id,
                )
                .await
                .map_err(|error| error.to_string())?;
            }
            Ok(())
        })
    })
    .await
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct UpdateOrganizationRequest {
    pub organization_id: String,
    pub name: Option<String>,
    pub memo: Option<String>,
}

pub async fn update_organization(
    pool: &SqlitePool,
    request: UpdateOrganizationRequest,
) -> Result<(), String> {
    let assignments: Vec<(&'static str, String)> =
        [("name = ?", &request.name), ("memo = ?", &request.memo)]
            .into_iter()
            .filter_map(|(column, value)| value.clone().map(|value| (column, value)))
            .collect();
    if assignments.is_empty() {
        return Ok(());
    }

    let now = js_iso8601_timestamp();
    run_write(pool, |conn| {
        Box::pin(async move {
            syntheo_db_app::update_contact_fields(
                conn,
                "organizations",
                &assignments,
                &now,
                &request.organization_id,
            )
            .await
            .map_err(|error| error.to_string())?;
            Ok(())
        })
    })
    .await
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SoftDeleteContactRequest {
    pub kind: ContactKind,
    pub contact_id: String,
}

pub async fn soft_delete_contact(
    pool: &SqlitePool,
    request: SoftDeleteContactRequest,
) -> Result<(), String> {
    let now = js_iso8601_timestamp();
    run_write(pool, |conn| {
        Box::pin(async move {
            syntheo_db_app::soft_delete_contact(
                conn,
                request.kind.table(),
                &request.contact_id,
                &now,
            )
            .await
            .map_err(|error| error.to_string())?;
            Ok(())
        })
    })
    .await
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct UpdateContactAvatarRequest {
    pub kind: ContactKind,
    pub contact_id: String,
    pub avatar_data_url: Option<String>,
}

pub async fn update_contact_avatar(
    pool: &SqlitePool,
    request: UpdateContactAvatarRequest,
) -> Result<(), String> {
    let now = js_iso8601_timestamp();
    run_write(pool, |conn| {
        Box::pin(async move {
            syntheo_db_app::update_contact_avatar(
                conn,
                request.kind.table(),
                request.avatar_data_url.as_deref(),
                &request.contact_id,
                &now,
            )
            .await
            .map_err(|error| error.to_string())?;
            Ok(())
        })
    })
    .await
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct UpdateHumanContactSummaryRequest {
    pub human_id: String,
    pub summary_json: String,
}

pub async fn update_human_contact_summary(
    pool: &SqlitePool,
    request: UpdateHumanContactSummaryRequest,
) -> Result<(), String> {
    let now = js_iso8601_timestamp();
    run_write(pool, |conn| {
        Box::pin(async move {
            syntheo_db_app::update_human_contact_summary(
                conn,
                &request.summary_json,
                &now,
                &request.human_id,
            )
            .await
            .map_err(|error| error.to_string())?;
            Ok(())
        })
    })
    .await
}

#[cfg(test)]
mod tests;
