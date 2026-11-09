// Fil rouge d'un dossier projet en 0.7.0 (issue 496) : deux tables locales,
// la version actuelle par dossier et les versions remplacées. Migration
// additive : elle ne relève pas la version minimale compatible.
use super::*;

const MIGRATION_ID: &str = "20261109150000_folder_threads";

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

#[test]
fn folder_threads_migration_is_registered_once_and_additive() {
    let steps: Vec<_> = APP_MIGRATION_STEPS
        .iter()
        .filter(|step| step.id == MIGRATION_ID)
        .collect();
    assert_eq!(steps.len(), 1);
    assert_eq!(steps[0].scope, syntheo_db_migrate::MigrationScope::Plain);
    assert!(
        !steps[0]
            .sql
            .lines()
            .any(|line| line.trim() == "-- breaking")
    );
}

#[tokio::test]
async fn creates_folder_thread_tables_on_an_existing_database() {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_migrate::migrate(
        &db,
        syntheo_db_migrate::DbSchema {
            steps: migration_steps_before(MIGRATION_ID),
        },
    )
    .await
    .unwrap();
    assert!(!table_exists(&db, "folder_threads").await);
    exec(
        &db,
        "INSERT INTO folders (id, path) VALUES ('folder-1', 'Réunion produit Atlas')",
    )
    .await;

    prepare_schema(&db).await.unwrap();
    // Une seconde ouverture ne rejoue rien.
    prepare_schema(&db).await.unwrap();

    assert!(table_exists(&db, "folder_threads").await);
    assert!(table_exists(&db, "folder_thread_versions").await);
    exec(
        &db,
        r#"INSERT INTO folder_threads (folder_id, body, covered_session_ids_json, covered_until)
           VALUES ('folder-1', '{"type":"doc","content":[{"type":"paragraph"}]}',
                   '["session-1"]', '2026-11-02T09:00:00.000Z')"#,
    )
    .await;
    exec(
        &db,
        "INSERT INTO folder_thread_versions (id, folder_id, version, body)
         VALUES ('version-1', 'folder-1', 1, 'ancien')",
    )
    .await;

    // Le fil rouge suit le dossier quand il est renommé : il est rattaché à
    // son identifiant, pas à son chemin.
    exec(
        &db,
        "UPDATE folders SET path = 'Atlas' WHERE id = 'folder-1'",
    )
    .await;
    let covered: String = sqlx::query_scalar(
        "SELECT thread.covered_session_ids_json
         FROM folder_threads AS thread
         JOIN folders AS folder ON folder.id = thread.folder_id
         WHERE folder.path = 'Atlas'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(covered, r#"["session-1"]"#);
    let defaults: (i64, String, String) = sqlx::query_as(
        "SELECT version, generated_json, edited_at FROM folder_threads WHERE folder_id = 'folder-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(defaults, (1, "{}".to_string(), String::new()));

    let floor: i64 =
        sqlx::query_scalar("SELECT min_supported_version FROM _syntheo_schema_compat WHERE id = 0")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert!(floor < 20261109150000, "floor {floor}");
}
