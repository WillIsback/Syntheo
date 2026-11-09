// Suppression du partage et du cache cloud en 0.7.0 (issue 460) : les tables
// de partage, de transfert des pièces jointes et d'appartenance à un espace
// partagé disparaissent, les notes et leurs pièces jointes restent lisibles.
use super::*;

const MIGRATION_ID: &str = "20261109130000_drop_cloud_sharing";
const DROPPED_TABLES: [&str; 6] = [
    "shared_session_cache",
    "shared_session_attachment_cache",
    "session_share_sync_state",
    "session_share_activation",
    "attachment_transfer_jobs",
    "workspace_memberships",
];

async fn exec(db: &Db, sql: &str) {
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .execute(db.pool())
        .await
        .unwrap();
}

async fn table_exists(db: &Db, table: &str) -> bool {
    sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?)",
    )
    .bind(table)
    .fetch_one(db.pool())
    .await
    .unwrap()
}

async fn applied_checksum(db: &Db, version: i64) -> String {
    sqlx::query_scalar("SELECT lower(hex(checksum)) FROM _sqlx_migrations WHERE version = ?")
        .bind(version)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

async fn seed_shared_note(db: &Db) {
    exec(
        db,
        "INSERT INTO sessions (id, owner_user_id, title, workspace_id)
         VALUES ('session-shared', 'user-1', 'Point partagé', 'workspace-1')",
    )
    .await;
    exec(
        db,
        r#"INSERT INTO session_documents (id, session_id, kind, body_format, body)
           VALUES ('session-shared', 'session-shared', 'note', 'prosemirror_json',
                   '{"type":"doc","content":[{"type":"paragraph"}]}')"#,
    )
    .await;
    exec(
        db,
        "INSERT INTO session_attachments (id, workspace_id, session_id, filename, relative_path)
         VALUES ('attachment-1', 'workspace-1', 'session-shared', 'doc.pdf', 'attachments/att-1')",
    )
    .await;
    exec(
        db,
        "INSERT INTO shared_session_cache (
           share_id, viewer_user_id, workspace_id, session_id,
           content_revision, manage_access, access_version, published_at
         ) VALUES ('share-1', 'user-1', 'workspace-1', 'session-shared', 1, 1, 2,
                   '2026-08-04T00:00:00Z')",
    )
    .await;
    exec(
        db,
        "INSERT INTO session_share_activation (viewer_user_id, share_id, session_id)
         VALUES ('user-1', 'share-1', 'session-shared')",
    )
    .await;
    exec(
        db,
        "INSERT INTO attachment_transfer_jobs (
           id, attachment_id, session_id, workspace_id, direction, expected_sha256,
           remote_object_id
         ) VALUES (
           'job-1', 'attachment-1', 'session-shared', 'workspace-1', 'upload',
           'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'object-1'
         )",
    )
    .await;
    exec(
        db,
        "INSERT INTO workspace_memberships (id, workspace_id, user_id)
         VALUES ('membership-1', 'workspace-1', 'user-1')",
    )
    .await;
}

#[test]
fn drop_cloud_sharing_migration_is_registered_once_and_breaking() {
    let steps: Vec<_> = APP_MIGRATION_STEPS
        .iter()
        .filter(|step| step.id == MIGRATION_ID)
        .collect();
    assert_eq!(steps.len(), 1);
    assert_eq!(steps[0].scope, syntheo_db_migrate::MigrationScope::Plain);
    assert!(
        steps[0]
            .sql
            .lines()
            .any(|line| line.trim() == "-- breaking")
    );
}

#[tokio::test]
async fn drops_cloud_sharing_tables_and_keeps_notes_readable() {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_migrate::migrate(
        &db,
        syntheo_db_migrate::DbSchema {
            steps: migration_steps_before(MIGRATION_ID),
        },
    )
    .await
    .unwrap();
    for table in DROPPED_TABLES {
        assert!(table_exists(&db, table).await, "{table} missing before");
    }
    seed_shared_note(&db).await;

    prepare_schema(&db).await.unwrap();
    // Une seconde ouverture ne rejoue rien.
    prepare_schema(&db).await.unwrap();

    for table in DROPPED_TABLES {
        assert!(
            !table_exists(&db, table).await,
            "table {table} still exists"
        );
    }
    let session = get_session(db.pool(), "session-shared")
        .await
        .unwrap()
        .expect("shared note must survive");
    assert_eq!(session.title, "Point partagé");
    let note = get_session_note(db.pool(), "session-shared")
        .await
        .unwrap()
        .expect("shared note body must survive");
    assert_eq!(
        note.body,
        r#"{"type":"doc","content":[{"type":"paragraph"}]}"#
    );
    let attachments: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM session_attachments WHERE session_id = ?")
            .bind("session-shared")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!(attachments, 1);
    assert!(table_exists(&db, "workspaces").await);

    let floor: i64 =
        sqlx::query_scalar("SELECT min_supported_version FROM _syntheo_schema_compat WHERE id = 0")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert!(floor >= 20261109130000, "floor {floor}");
}

#[tokio::test]
async fn opens_a_database_with_the_legacy_shared_session_cache_migration() {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_migrate::migrate(&db, schema_with_legacy_shared_session_cache(false))
        .await
        .unwrap();
    assert_eq!(
        applied_checksum(&db, SHARED_SESSION_CACHE_MIGRATION_VERSION).await,
        LEGACY_SHARED_SESSION_CACHE_CHECKSUM
    );
    exec(
        &db,
        "INSERT INTO sessions (id, owner_user_id, title) VALUES ('session-1', 'user-1', 'Note')",
    )
    .await;

    prepare_schema(&db).await.unwrap();
    prepare_schema(&db).await.unwrap();

    assert_eq!(
        applied_checksum(&db, SHARED_SESSION_CACHE_MIGRATION_VERSION).await,
        CURRENT_SHARED_SESSION_CACHE_CHECKSUM
    );
    assert!(!table_exists(&db, "shared_session_cache").await);
    assert!(get_session(db.pool(), "session-1").await.unwrap().is_some());
}

#[tokio::test]
async fn opens_a_database_with_the_legacy_attachment_transfer_jobs_migration() {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_migrate::migrate(&db, schema_with_legacy_attachment_transfer_jobs())
        .await
        .unwrap();
    assert_eq!(
        applied_checksum(&db, ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION).await,
        LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM
    );

    prepare_schema(&db).await.unwrap();
    prepare_schema(&db).await.unwrap();

    assert_eq!(
        applied_checksum(&db, ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION).await,
        CURRENT_ATTACHMENT_TRANSFER_JOBS_CHECKSUM
    );
    assert!(!table_exists(&db, "attachment_transfer_jobs").await);
}
