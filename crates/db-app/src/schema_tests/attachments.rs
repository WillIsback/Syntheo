use super::*;

#[test]
fn attachment_local_state_is_plain_and_excluded_from_cloudsync() {
    let migration = APP_MIGRATION_STEPS
        .iter()
        .find(|step| step.id == "20260717140000_attachment_local_state")
        .unwrap();

    assert_eq!(migration.scope, syntheo_db_migrate::MigrationScope::Plain);
}

#[test]
fn attachment_transfer_jobs_are_plain_and_excluded_from_cloudsync() {
    let migration = APP_MIGRATION_STEPS
        .iter()
        .find(|step| step.id == "20260717150000_attachment_transfer_jobs")
        .unwrap();

    assert_eq!(migration.scope, syntheo_db_migrate::MigrationScope::Plain);
}

#[test]
fn attachment_transfer_jobs_migration_checksums_are_pinned() {
    assert_eq!(
        checksum_hex(&migration_checksum(&legacy_attachment_transfer_jobs_sql())),
        LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM
    );
    assert_eq!(
        checksum_hex(&migration_checksum(include_str!(
            "../../migrations/20260717150000_attachment_transfer_jobs.sql"
        ))),
        CURRENT_ATTACHMENT_TRANSFER_JOBS_CHECKSUM
    );
}

#[tokio::test]
async fn unknown_attachment_transfer_jobs_checksum_fails_without_mutation() {
    let db = test_db().await;
    sqlx::query(
        "UPDATE _sqlx_migrations SET checksum = X'00'
             WHERE version = ?",
    )
    .bind(ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION)
    .execute(db.pool())
    .await
    .unwrap();

    let error = prepare_schema(&db).await.unwrap_err();
    assert!(matches!(
        error,
        AppSchemaError::AttachmentTransferJobsRepair(
            "attachment-transfer jobs migration has an unknown checksum"
        )
    ));
    let checksum: Vec<u8> =
        sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = ?")
            .bind(ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION)
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!(checksum, [0]);
}

#[tokio::test]
async fn attachment_transfer_checksum_repair_fails_cleanly_when_the_update_is_refused() {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_migrate::migrate(&db, schema_with_legacy_attachment_transfer_jobs())
        .await
        .unwrap();
    sqlx::raw_sql(
        "CREATE TRIGGER block_attachment_transfer_jobs_checksum_update
             BEFORE UPDATE OF checksum ON _sqlx_migrations
             WHEN OLD.version = 20260717150000
             BEGIN
               SELECT RAISE(ABORT, 'blocked checksum update');
             END;",
    )
    .execute(db.pool())
    .await
    .unwrap();

    let error = prepare_schema(&db).await.unwrap_err();
    assert!(matches!(error, AppSchemaError::Sqlx(_)));
    let checksum: String = sqlx::query_scalar(
        "SELECT lower(hex(checksum))
             FROM _sqlx_migrations WHERE version = ?",
    )
    .bind(ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(checksum, LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM);
}

#[tokio::test]
async fn attachment_cloud_sync_intent_is_a_synced_additive_column() {
    let migration = APP_MIGRATION_STEPS
        .iter()
        .find(|step| step.id == "20260717170000_attachment_cloud_sync_intent")
        .unwrap();

    assert_eq!(
        migration.scope,
        syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_attachments",
        }
    );

    let db = test_db().await;
    sqlx::query(
        "INSERT INTO session_attachments (id, workspace_id, session_id)
             VALUES ('attachment-intent', 'workspace-1', 'session-1')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let enabled: i64 = sqlx::query_scalar(
        "SELECT cloud_sync_enabled FROM session_attachments
             WHERE id = 'attachment-intent'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(enabled, 0);

    let invalid = sqlx::query(
        "UPDATE session_attachments SET cloud_sync_enabled = 2
             WHERE id = 'attachment-intent'",
    )
    .execute(db.pool())
    .await;
    assert!(invalid.is_err());
}

#[test]
fn shared_attachment_cache_is_plain_and_excluded_from_cloudsync() {
    let migration = APP_MIGRATION_STEPS
        .iter()
        .find(|step| step.id == "20260717171000_shared_session_attachment_cache")
        .unwrap();

    assert_eq!(migration.scope, syntheo_db_migrate::MigrationScope::Plain);
}
