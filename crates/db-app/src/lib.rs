#![forbid(unsafe_code)]

mod attachment_ops;
mod capture_lifecycle_ops;
mod contact_ops;
mod folder_catalog_ops;
mod legacy_voiceprints;
mod managed_settings;
mod migrations;
mod pilot_usage_ops;
mod session_audio_ops;
mod session_content_ops;
mod session_hold;
mod session_lifecycle_ops;
mod session_move_ops;
mod session_ops;
mod session_participant_ops;
mod session_purge;
mod session_review_ops;
mod session_transcript_ops;
mod session_types;
mod summary_ops;
mod template_ops;
mod template_types;
mod transcript_batch_ops;
mod transcript_live_ops;
mod webhook_ops;
mod webhook_types;

pub use attachment_ops::*;
pub use capture_lifecycle_ops::*;
pub use contact_ops::*;
pub use folder_catalog_ops::*;
pub use legacy_voiceprints::*;
pub use managed_settings::*;
pub use migrations::APP_MIGRATION_STEPS;
pub use pilot_usage_ops::*;
pub use session_audio_ops::*;
pub use session_content_ops::*;
pub use session_hold::*;
pub use session_lifecycle_ops::*;
pub use session_move_ops::*;
pub use session_ops::*;
pub use session_participant_ops::*;
pub use session_purge::*;
pub use session_review_ops::*;
pub use session_transcript_ops::*;
pub use session_types::*;
use sha2::{Digest, Sha384};
pub use summary_ops::*;
pub use template_ops::*;
pub use template_types::*;
pub use transcript_batch_ops::*;
pub use transcript_live_ops::*;
pub use webhook_ops::*;
pub use webhook_types::*;

pub const DEFAULT_USER_ID: &str = "00000000-0000-0000-0000-000000000000";

pub fn schema() -> syntheo_db_migrate::DbSchema {
    syntheo_db_migrate::DbSchema {
        steps: APP_MIGRATION_STEPS,
    }
}

/// Local-only workspace identity. It used to be provisioned by the CloudSync
/// binding; Syntheo is fully local, so we keep the same `app_settings` key (many
/// hot SQL paths read it) but create it locally with no account.
pub const LOCAL_WORKSPACE_BINDING_ID: &str = "cloudsync_workspace_binding";

pub async fn ensure_local_workspace_binding(pool: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
    let workspace_id = uuid::Uuid::new_v4().to_string();
    let value_json = format!("{{\"workspace_id\":\"{workspace_id}\",\"account_user_id\":null}}");
    sqlx::query(
        "INSERT INTO app_settings (id, value_json) VALUES (?, ?)
         ON CONFLICT(id) DO NOTHING",
    )
    .bind(LOCAL_WORKSPACE_BINDING_ID)
    .bind(value_json)
    .execute(pool)
    .await?;
    Ok(())
}

const SHARED_SESSION_CACHE_MIGRATION_VERSION: i64 = 20260716173000;
const LEGACY_SHARED_SESSION_CACHE_CHECKSUM: &str = "4813db532e44e6db8a3ba85e0b248ff99a927ec40b6aa971210452b588bcb2361d3661bd23d045a32ac3a9fcbed99b4a";
const CURRENT_SHARED_SESSION_CACHE_CHECKSUM: &str = "84376d223c0b1ca3298810b101fef7f599d50267dca4e5693feaddd481e4a082b87a12d37360e11b94b3cb39e8c58dee";
const ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION: i64 = 20260717150000;
const LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM: &str = "fd846a54c653d8e737371a950747b442bba2da055566dbcd35907b36fe7829a3a09c81052346bb05100ba71be552efc0";
const CURRENT_ATTACHMENT_TRANSFER_JOBS_CHECKSUM: &str = "9250233e7b51b83bb74ef4e4af159a9c2bbc753ee64751cac8316968b66bb1b2e0e224770d8b63a631350183dc81c2e0";

#[derive(Debug)]
pub enum AppSchemaError {
    Migrate(syntheo_db_migrate::MigrateError),
    Sqlx(sqlx::Error),
    SharedSessionCacheRepair(&'static str),
    AttachmentTransferJobsRepair(&'static str),
    LegacyMobileSchema(&'static str),
}

impl std::fmt::Display for AppSchemaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Migrate(error) => write!(f, "{error}"),
            Self::Sqlx(error) => write!(f, "{error}"),
            Self::SharedSessionCacheRepair(error) => write!(f, "{error}"),
            Self::AttachmentTransferJobsRepair(error) => write!(f, "{error}"),
            Self::LegacyMobileSchema(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for AppSchemaError {}

impl From<syntheo_db_migrate::MigrateError> for AppSchemaError {
    fn from(error: syntheo_db_migrate::MigrateError) -> Self {
        Self::Migrate(error)
    }
}

impl From<sqlx::Error> for AppSchemaError {
    fn from(error: sqlx::Error) -> Self {
        Self::Sqlx(error)
    }
}

pub async fn prepare_schema(db: &syntheo_db_core::Db) -> Result<(), AppSchemaError> {
    prepare_schema_with_progress(db, |_| {}).await
}

pub async fn prepare_schema_with_progress(
    db: &syntheo_db_core::Db,
    on_migration_progress: impl FnMut(syntheo_db_migrate::MigrationProgress) + Send,
) -> Result<(), AppSchemaError> {
    let templates_missing_before_migration = !templates_table_exists(db.pool()).await?;
    adopt_legacy_mobile_schema_migration(db.pool()).await?;
    repair_legacy_shared_session_cache_migration(db.pool()).await?;
    repair_legacy_attachment_transfer_jobs_migration(db.pool()).await?;
    syntheo_db_migrate::migrate_with_progress(db, schema(), on_migration_progress).await?;
    repair_missing_core_tables(db.pool(), templates_missing_before_migration).await?;
    ensure_local_workspace_binding(db.pool()).await?;
    apply_managed_settings(db.pool()).await?;
    Ok(())
}

const CALENDAR_EVENT_TOMBSTONES_MIGRATION_VERSION: i64 = 20260711000000;
const ATTACHMENT_CLOUD_SYNC_INTENT_MIGRATION_VERSION: i64 = 20260717170000;

async fn adopt_legacy_mobile_schema_migration(
    pool: &sqlx::SqlitePool,
) -> Result<(), AppSchemaError> {
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    let user_version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&mut *transaction)
        .await?;
    if user_version != 1 {
        transaction.commit().await?;
        return Ok(());
    }

    let has_legacy_schema: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'
         )",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if !has_legacy_schema {
        transaction.commit().await?;
        return Ok(());
    }

    sqlx::raw_sql(
        "CREATE TABLE IF NOT EXISTS _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL,
            checksum BLOB NOT NULL,
            execution_time BIGINT NOT NULL
        );",
    )
    .execute(&mut *transaction)
    .await?;

    let calendar_tombstones_present: bool = sqlx::query_scalar(
        "SELECT
            EXISTS(SELECT 1 FROM pragma_table_info('calendars') WHERE name = 'deleted_at')
            AND EXISTS(SELECT 1 FROM pragma_table_info('events') WHERE name = 'deleted_at')",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if calendar_tombstones_present {
        adopt_legacy_mobile_migration(
            &mut transaction,
            CALENDAR_EVENT_TOMBSTONES_MIGRATION_VERSION,
            "calendar_event_tombstones",
            include_str!("../migrations/20260711000000_calendar_event_tombstones.sql"),
        )
        .await?;
    }

    let attachment_cloud_sync_intent_present: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM pragma_table_info('session_attachments')
            WHERE name = 'cloud_sync_enabled'
         )",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if attachment_cloud_sync_intent_present {
        adopt_legacy_mobile_migration(
            &mut transaction,
            ATTACHMENT_CLOUD_SYNC_INTENT_MIGRATION_VERSION,
            "attachment_cloud_sync_intent",
            include_str!("../migrations/20260717170000_attachment_cloud_sync_intent.sql"),
        )
        .await?;
    }

    transaction.commit().await?;
    Ok(())
}

async fn adopt_legacy_mobile_migration(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    version: i64,
    description: &'static str,
    sql: &'static str,
) -> Result<(), AppSchemaError> {
    let expected_checksum = migration_checksum(sql);
    let existing: Option<(bool, Vec<u8>)> =
        sqlx::query_as("SELECT success, checksum FROM _sqlx_migrations WHERE version = ?")
            .bind(version)
            .fetch_optional(&mut **transaction)
            .await?;
    if let Some((success, checksum)) = existing {
        if !success || checksum != expected_checksum {
            return Err(AppSchemaError::LegacyMobileSchema(
                "legacy mobile migration history contains an unexpected record",
            ));
        }
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO _sqlx_migrations (
            version, description, success, checksum, execution_time
         ) VALUES (?, ?, 1, ?, 0)",
    )
    .bind(version)
    .bind(description)
    .bind(expected_checksum)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

// Une base créée par une préversion garde l'empreinte d'une ancienne version
// de la migration `attachment_transfer_jobs`. La table est supprimée par
// `20261109130000_drop_cloud_sharing` : il suffit d'enregistrer l'empreinte
// actuelle pour que l'historique des migrations reste cohérent.
async fn repair_legacy_attachment_transfer_jobs_migration(
    pool: &sqlx::SqlitePool,
) -> Result<(), AppSchemaError> {
    if !migration_table_exists(pool).await? {
        return Ok(());
    }

    let checksum =
        applied_migration_checksum_hex(pool, ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION).await?;
    match checksum.as_deref() {
        None | Some(CURRENT_ATTACHMENT_TRANSFER_JOBS_CHECKSUM) => return Ok(()),
        Some(LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM) => {}
        Some(_) => {
            return Err(AppSchemaError::AttachmentTransferJobsRepair(
                "attachment-transfer jobs migration has an unknown checksum",
            ));
        }
    }

    let current_migration_checksum = migration_checksum(include_str!(
        "../migrations/20260717150000_attachment_transfer_jobs.sql"
    ));
    let result = sqlx::query(
        "UPDATE _sqlx_migrations
         SET checksum = ?
         WHERE version = ? AND success = 1 AND lower(hex(checksum)) = ?",
    )
    .bind(current_migration_checksum.as_slice())
    .bind(ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION)
    .bind(LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM)
    .execute(pool)
    .await?;
    if result.rows_affected() != 1 {
        return Err(AppSchemaError::AttachmentTransferJobsRepair(
            "attachment-transfer jobs migration changed during repair",
        ));
    }
    Ok(())
}

// Même cas pour `shared_session_cache` : l'ancienne table n'a pas la même
// forme. Elle est recréée vide dans sa forme actuelle, pour que les
// migrations suivantes s'appliquent, puis `20261109130000_drop_cloud_sharing`
// la supprime.
async fn repair_legacy_shared_session_cache_migration(
    pool: &sqlx::SqlitePool,
) -> Result<(), AppSchemaError> {
    if !migration_table_exists(pool).await? {
        return Ok(());
    }

    let checksum =
        applied_migration_checksum_hex(pool, SHARED_SESSION_CACHE_MIGRATION_VERSION).await?;
    match checksum.as_deref() {
        None | Some(CURRENT_SHARED_SESSION_CACHE_CHECKSUM) => return Ok(()),
        Some(LEGACY_SHARED_SESSION_CACHE_CHECKSUM) => {}
        Some(_) => {
            return Err(AppSchemaError::SharedSessionCacheRepair(
                "shared-session cache migration has an unknown checksum",
            ));
        }
    }

    let current_sql = include_str!("../migrations/20260716173000_shared_session_cache.sql");
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("DROP TABLE IF EXISTS shared_session_cache")
        .execute(&mut *transaction)
        .await?;
    sqlx::raw_sql(current_sql)
        .execute(&mut *transaction)
        .await?;
    let result = sqlx::query(
        "UPDATE _sqlx_migrations
         SET checksum = ?
         WHERE version = ? AND success = 1 AND lower(hex(checksum)) = ?",
    )
    .bind(migration_checksum(current_sql).as_slice())
    .bind(SHARED_SESSION_CACHE_MIGRATION_VERSION)
    .bind(LEGACY_SHARED_SESSION_CACHE_CHECKSUM)
    .execute(&mut *transaction)
    .await?;
    if result.rows_affected() != 1 {
        return Err(AppSchemaError::SharedSessionCacheRepair(
            "legacy shared-session cache migration changed during repair",
        ));
    }

    transaction.commit().await?;
    Ok(())
}

async fn migration_table_exists(pool: &sqlx::SqlitePool) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master
            WHERE type = 'table' AND name = '_sqlx_migrations'
        )",
    )
    .fetch_one(pool)
    .await
}

async fn applied_migration_checksum_hex(
    pool: &sqlx::SqlitePool,
    version: i64,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT lower(hex(checksum))
         FROM _sqlx_migrations
         WHERE version = ? AND success = 1",
    )
    .bind(version)
    .fetch_optional(pool)
    .await
}

fn migration_checksum(sql: &str) -> Vec<u8> {
    Sha384::digest(sql.as_bytes()).to_vec()
}

#[cfg(test)]
fn checksum_hex(checksum: &[u8]) -> String {
    use std::fmt::Write as _;

    checksum.iter().fold(
        String::with_capacity(checksum.len() * 2),
        |mut hex, byte| {
            write!(hex, "{byte:02x}").expect("writing to a string cannot fail");
            hex
        },
    )
}

async fn templates_table_exists(pool: &sqlx::SqlitePool) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = 'templates'
        )",
    )
    .fetch_one(pool)
    .await
}

async fn repair_missing_core_tables(
    pool: &sqlx::SqlitePool,
    templates_missing_before_migration: bool,
) -> Result<(), sqlx::Error> {
    if !templates_table_exists(pool).await? {
        sqlx::query(include_str!("../migrations/20260413020000_templates.sql"))
            .execute(pool)
            .await?;
    }

    let has_icon_json = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('templates') WHERE name = 'icon_json')",
    )
    .fetch_one(pool)
    .await?;
    if !has_icon_json {
        sqlx::query(include_str!(
            "../migrations/20260712170000_template_icons.sql"
        ))
        .execute(pool)
        .await?;
    }

    if templates_missing_before_migration {
        sqlx::query(include_str!(
            "../migrations/20260524000000_default_templates.sql"
        ))
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[cfg(test)]
mod schema_tests;
