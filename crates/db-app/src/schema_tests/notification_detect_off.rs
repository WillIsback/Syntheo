// Migration unique de la 0.6.0 (issue 407) : l'invite « Êtes-vous en réunion ? »
// passe de `true` à `false` une seule fois. La table des migrations sert de
// marqueur : une réactivation ultérieure n'est jamais écrasée.
use super::*;

const MIGRATION_ID: &str = "20261107120000_notification_detect_off";

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

async fn set_row(db: &Db, id: &str, value_json: &str) {
    sqlx::query(
        "INSERT INTO app_settings (id, value_json) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(id)
    .bind(value_json)
    .execute(db.pool())
    .await
    .unwrap();
}

async fn row(db: &Db, id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT value_json FROM app_settings WHERE id = ?")
        .bind(id)
        .fetch_optional(db.pool())
        .await
        .unwrap()
}

#[test]
fn notification_detect_migration_is_registered_once() {
    assert_eq!(
        APP_MIGRATION_STEPS
            .iter()
            .filter(|step| step.id == MIGRATION_ID)
            .count(),
        1
    );
}

#[tokio::test]
async fn turns_stored_true_off_once_and_keeps_a_later_opt_in() {
    let db = db_before_migration().await;
    set_row(&db, "notification_detect", "true").await;
    set_row(&db, "notification_event", "true").await;

    prepare_schema(&db).await.unwrap();

    assert_eq!(
        row(&db, "notification_detect").await.as_deref(),
        Some("false")
    );
    assert_eq!(
        row(&db, "notification_event").await.as_deref(),
        Some("true"),
        "aucun autre réglage n'est touché"
    );

    // L'utilisateur réactive l'invite : un redémarrage ne la redésactive pas.
    set_row(&db, "notification_detect", "true").await;
    prepare_schema(&db).await.unwrap();
    prepare_schema(&db).await.unwrap();

    assert_eq!(
        row(&db, "notification_detect").await.as_deref(),
        Some("true")
    );
}

#[tokio::test]
async fn keeps_stored_false_and_leaves_fresh_installs_without_a_row() {
    let db = db_before_migration().await;
    set_row(&db, "notification_detect", "false").await;
    prepare_schema(&db).await.unwrap();
    assert_eq!(
        row(&db, "notification_detect").await.as_deref(),
        Some("false")
    );

    let fresh = db_before_migration().await;
    prepare_schema(&fresh).await.unwrap();
    assert_eq!(row(&fresh, "notification_detect").await, None);
}

#[tokio::test]
async fn overrides_a_legacy_true_without_touching_the_legacy_documents() {
    let settings_doc = r#"{"notification":{"detect":true,"event":true}}"#;
    let main_doc = r#"{"notification_detect":true}"#;

    let db = db_before_migration().await;
    set_row(&db, "legacy_settings_document", settings_doc).await;
    prepare_schema(&db).await.unwrap();
    assert_eq!(
        row(&db, "notification_detect").await.as_deref(),
        Some("false")
    );
    assert_eq!(
        row(&db, "legacy_settings_document").await.as_deref(),
        Some(settings_doc)
    );

    let main_only = db_before_migration().await;
    set_row(&main_only, "legacy_main_values_document", main_doc).await;
    prepare_schema(&main_only).await.unwrap();
    assert_eq!(
        row(&main_only, "notification_detect").await.as_deref(),
        Some("false")
    );

    // Le document de réglages prime sur les valeurs principales, comme à la
    // lecture : un `false` hérité reste tel quel, sans ligne ajoutée.
    let legacy_false = db_before_migration().await;
    set_row(
        &legacy_false,
        "legacy_settings_document",
        r#"{"notification":{"detect":false}}"#,
    )
    .await;
    set_row(&legacy_false, "legacy_main_values_document", main_doc).await;
    prepare_schema(&legacy_false).await.unwrap();
    assert_eq!(row(&legacy_false, "notification_detect").await, None);
}

#[tokio::test]
async fn tolerates_invalid_legacy_json() {
    let db = db_before_migration().await;
    set_row(&db, "legacy_settings_document", "{not json").await;
    set_row(&db, "legacy_main_values_document", "{not json").await;

    prepare_schema(&db).await.unwrap();

    assert_eq!(row(&db, "notification_detect").await, None);
}
