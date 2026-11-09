// Suppression du calendrier en 0.7.0 (issue 465) : les tables `calendars` et
// `events` et les colonnes d'événement de `sessions` disparaissent, les notes
// restent lisibles.
use super::*;

const MIGRATION_ID: &str = "20261109120000_drop_calendar";

async fn db_before_migration() -> Db {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_migrate::migrate(
        &db,
        syntheo_db_migrate::DbSchema {
            steps: migration_steps_before(MIGRATION_ID),
        },
    )
    .await
    .unwrap();
    db
}

async fn exec(db: &Db, sql: &str) {
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .execute(db.pool())
        .await
        .unwrap();
}

async fn exists(db: &Db, sql: &str) -> bool {
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .fetch_one(db.pool())
        .await
        .unwrap()
}

async fn seed_calendar_linked_note(db: &Db) {
    exec(
        db,
        "INSERT INTO calendars (id, tracking_id_calendar, name, enabled, provider)
         VALUES ('calendar-1', 'tracking-calendar-1', 'Travail', 1, 'apple')",
    )
    .await;
    exec(
        db,
        "INSERT INTO events (id, tracking_id_event, calendar_id, title, started_at, ended_at)
         VALUES ('event-1', 'tracking-event-1', 'calendar-1', 'Point hebdo',
                 '2026-11-02T09:00:00Z', '2026-11-02T10:00:00Z')",
    )
    .await;
    exec(
        db,
        r#"INSERT INTO sessions (
             id, owner_user_id, title, started_at, event_id, external_event_id,
             external_provider, series_id, event_json, metadata_json
           ) VALUES (
             'session-event', 'user-1', 'Point hebdo', '2026-11-02T09:00:00Z',
             'event-1', 'tracking-event-1', 'apple', 'series-1',
             '{"tracking_id":"tracking-event-1","calendar_id":"calendar-1","title":"Point hebdo","started_at":"2026-11-02T09:00:00Z"}',
             '{"speaker_context":{"version":1}}'
           )"#,
    )
    .await;
    exec(
        db,
        r#"INSERT INTO session_documents (id, session_id, kind, body_format, body)
           VALUES ('session-event', 'session-event', 'note', 'prosemirror_json',
                   '{"type":"doc","content":[{"type":"paragraph"}]}')"#,
    )
    .await;
    exec(
        db,
        r#"INSERT INTO sessions (id, owner_user_id, title, event_json)
           VALUES ('session-welcome', 'user-1', 'Bienvenue sur Syntheo',
                   '{"tracking_id":"syntheo-onboarding-demo-v1","title":"Bienvenue sur Syntheo"}')"#,
    )
    .await;
    exec(
        db,
        "INSERT INTO app_settings (id, value_json) VALUES
           ('ignored_events', '[]'),
           ('ignored_recurring_series', '[]'),
           ('auto_add_series_folders', '[]'),
           ('auto_add_series_folders_declined', '[]'),
           ('notification_detect', 'false')",
    )
    .await;
}

#[test]
fn drop_calendar_migration_is_registered_once_and_breaking() {
    let steps: Vec<_> = APP_MIGRATION_STEPS
        .iter()
        .filter(|step| step.id == MIGRATION_ID)
        .collect();
    assert_eq!(steps.len(), 1);
    assert!(
        steps[0]
            .sql
            .lines()
            .any(|line| line.trim() == "-- breaking")
    );
}

#[tokio::test]
async fn drops_calendar_schema_and_keeps_linked_note_readable() {
    let db = db_before_migration().await;
    seed_calendar_linked_note(&db).await;

    prepare_schema(&db).await.unwrap();

    for table in ["calendars", "events"] {
        let sql = format!(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '{table}')"
        );
        assert!(!exists(&db, &sql).await, "table {table} still exists");
    }
    for column in ["event_id", "event_json"] {
        let sql = format!(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('sessions') WHERE name = '{column}')"
        );
        assert!(!exists(&db, &sql).await, "column {column} still exists");
    }
    assert!(
        !exists(
            &db,
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'idx_sessions_event_id')"
        )
        .await
    );

    // La note liée à l'événement s'ouvre toujours, avec son contenu.
    let session = get_session(db.pool(), "session-event")
        .await
        .unwrap()
        .expect("linked note must survive");
    assert_eq!(session.title, "Point hebdo");
    assert_eq!(session.started_at, "2026-11-02T09:00:00Z");
    assert_eq!(session.series_id, "series-1");
    // L'import de réunions garde ses identifiants externes.
    assert_eq!(session.external_event_id, "tracking-event-1");
    assert_eq!(session.external_provider, "apple");
    assert_eq!(
        session.metadata_json,
        r#"{"speaker_context":{"version":1}}"#
    );
    let note = get_session_note(db.pool(), "session-event")
        .await
        .unwrap()
        .expect("linked note body must survive");
    assert_eq!(
        note.body,
        r#"{"type":"doc","content":[{"type":"paragraph"}]}"#
    );

    // La note de bienvenue garde son marqueur, désormais dans metadata_json.
    let welcome: String =
        sqlx::query_scalar("SELECT metadata_json FROM sessions WHERE id = 'session-welcome'")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!(welcome, r#"{"welcome_note":"syntheo-onboarding-demo-v1"}"#);

    let settings: Vec<String> = sqlx::query_scalar("SELECT id FROM app_settings ORDER BY id")
        .fetch_all(db.pool())
        .await
        .unwrap();
    assert!(settings.contains(&"notification_detect".to_string()));
    for removed in [
        "ignored_events",
        "ignored_recurring_series",
        "auto_add_series_folders",
        "auto_add_series_folders_declined",
    ] {
        assert!(!settings.contains(&removed.to_string()), "{removed} kept");
    }

    // Le déclencheur de recherche recréé suit toujours le titre.
    let before: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(generation), 0) FROM search_index_dirty
         WHERE entity_type = 'session' AND entity_id = 'session-event'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    exec(
        &db,
        "UPDATE sessions SET title = 'Point hebdo (renommé)' WHERE id = 'session-event'",
    )
    .await;
    let after: i64 = sqlx::query_scalar(
        "SELECT generation FROM search_index_dirty
         WHERE entity_type = 'session' AND entity_id = 'session-event'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(after, before + 1);

    // Une version antérieure refuse désormais d'ouvrir la base.
    let floor: i64 =
        sqlx::query_scalar("SELECT min_supported_version FROM _syntheo_schema_compat WHERE id = 0")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert!(floor >= 20261109120000, "floor {floor}");
}
