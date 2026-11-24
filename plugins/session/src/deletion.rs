use serde::{Deserialize, Serialize};
use specta::Type;
use sqlx::SqlitePool;

const SESSION_CHILD_TABLES: &[&str] = &[
    "session_documents",
    "transcripts",
    "session_participants",
    "session_tags",
    "action_items",
    "session_attachments",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TombstoneSessionRequest {
    pub session_id: String,
    pub tombstone: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DeletedSessionRow {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PurgeDeletedSessionOutcome {
    Purged,
    NotDeleted,
    Refused,
}

/// Session supprimée en entier dont le délai de purge est écoulé.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ExpiredDeletedSession {
    pub session_id: String,
    pub tombstone: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum RestoreDeletedSessionOutcome {
    Restored,
    Alive,
    NotDeleted,
}

async fn run_tombstone_statements(
    conn: &mut sqlx::SqliteConnection,
    session_id: &str,
    tombstone: &str,
    restore: bool,
) -> Result<u64, String> {
    for table in SESSION_CHILD_TABLES {
        syntheo_db_app::update_session_child_tombstone(conn, table, session_id, tombstone, restore)
            .await
            .map_err(|error| error.to_string())?;
    }
    syntheo_db_app::update_entity_mentions_tombstone(conn, session_id, tombstone, restore)
        .await
        .map_err(|error| error.to_string())?;
    syntheo_db_app::update_sessions_tombstone(conn, session_id, tombstone, restore)
        .await
        .map_err(|error| error.to_string())
}

pub async fn soft_delete_session(
    pool: &SqlitePool,
    request: TombstoneSessionRequest,
) -> Result<Option<DeletedSessionRow>, String> {
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;

    let Some(session) =
        syntheo_db_app::load_session_delete_row(&mut transaction, &request.session_id)
            .await
            .map_err(|error| error.to_string())?
    else {
        transaction
            .rollback()
            .await
            .map_err(|error| error.to_string())?;
        return Ok(None);
    };

    let tombstoned = run_tombstone_statements(
        &mut transaction,
        &request.session_id,
        &request.tombstone,
        false,
    )
    .await?;

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;

    if tombstoned != 1 {
        return Ok(None);
    }

    Ok(Some(DeletedSessionRow {
        id: session.id,
        title: session.title,
    }))
}

pub async fn restore_deleted_session(
    pool: &SqlitePool,
    request: TombstoneSessionRequest,
) -> Result<RestoreDeletedSessionOutcome, String> {
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;

    let restored = run_tombstone_statements(
        &mut transaction,
        &request.session_id,
        &request.tombstone,
        true,
    )
    .await?;
    let outcome = if restored == 1 {
        RestoreDeletedSessionOutcome::Restored
    } else if syntheo_db_app::session_is_alive(&mut transaction, &request.session_id)
        .await
        .map_err(|error| error.to_string())?
    {
        RestoreDeletedSessionOutcome::Alive
    } else {
        RestoreDeletedSessionOutcome::NotDeleted
    };

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;

    Ok(outcome)
}

/// Purge définitive d'une session supprimée sous `tombstone`, une fois le
/// délai d'annulation écoulé et son dossier supprimé (issue 712). Le journal
/// ne porte que l'identifiant et un nombre de lignes, jamais de titre ni de
/// contenu.
pub async fn purge_deleted_session(
    pool: &SqlitePool,
    request: TombstoneSessionRequest,
) -> Result<PurgeDeletedSessionOutcome, String> {
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;
    let outcome = syntheo_db_app::purge_deleted_session(
        &mut transaction,
        &request.session_id,
        &request.tombstone,
    )
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(match outcome {
        syntheo_db_app::DeletedSessionPurge::Purged { rows } => {
            tracing::info!(session_id = %request.session_id, rows, "deleted_session_purged");
            PurgeDeletedSessionOutcome::Purged
        }
        syntheo_db_app::DeletedSessionPurge::NotDeleted => PurgeDeletedSessionOutcome::NotDeleted,
        syntheo_db_app::DeletedSessionPurge::Refused(reason) => {
            tracing::warn!(session_id = %request.session_id, reason, "deleted_session_purge_refused");
            PurgeDeletedSessionOutcome::Refused
        }
    })
}

/// Sessions supprimées en attente de purge (voir
/// `syntheo_db_app::expired_deleted_sessions`).
pub async fn list_expired_deleted_sessions(
    pool: &SqlitePool,
) -> Result<Vec<ExpiredDeletedSession>, String> {
    Ok(syntheo_db_app::expired_deleted_sessions(pool)
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|(session_id, tombstone)| ExpiredDeletedSession {
            session_id,
            tombstone,
        })
        .collect())
}
