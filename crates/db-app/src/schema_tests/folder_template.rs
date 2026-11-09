// Modèle de compte rendu par défaut d'un dossier en 0.7.0 (issue 502) : une
// colonne `folders.template_id`, vide par défaut. Migration additive : elle
// ne relève pas la version minimale compatible.
use super::*;

const MIGRATION_ID: &str = "20261109170000_folder_template";

async fn exec(db: &Db, sql: &str) {
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .execute(db.pool())
        .await
        .unwrap();
}

#[test]
fn folder_template_migration_is_registered_once_and_additive() {
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
async fn adds_an_empty_folder_template_to_existing_folders() {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_migrate::migrate(
        &db,
        syntheo_db_migrate::DbSchema {
            steps: migration_steps_before(MIGRATION_ID),
        },
    )
    .await
    .unwrap();
    exec(
        &db,
        "INSERT INTO folders (id, path, instructions) VALUES ('folder-1', 'Atlas', 'Contexte')",
    )
    .await;

    prepare_schema(&db).await.unwrap();
    // Une seconde ouverture ne rejoue rien.
    prepare_schema(&db).await.unwrap();

    // Un dossier existant n'a pas de modèle propre et garde ses réglages.
    let existing: (String, String) =
        sqlx::query_as("SELECT template_id, instructions FROM folders WHERE id = 'folder-1'")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!(existing, (String::new(), "Contexte".to_string()));

    // Le modèle suit le dossier quand il est renommé.
    exec(
        &db,
        "UPDATE folders SET template_id = 'template-hebdo' WHERE id = 'folder-1'",
    )
    .await;
    exec(
        &db,
        "UPDATE folders SET path = 'Atlas 2027' WHERE id = 'folder-1'",
    )
    .await;
    let template_id: String =
        sqlx::query_scalar("SELECT template_id FROM folders WHERE path = 'Atlas 2027'")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!(template_id, "template-hebdo");

    // Un dossier créé sans modèle reçoit la valeur vide.
    exec(
        &db,
        "INSERT INTO folders (id, path) VALUES ('folder-2', 'Bêta')",
    )
    .await;
    let created: String =
        sqlx::query_scalar("SELECT template_id FROM folders WHERE id = 'folder-2'")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert_eq!(created, "");

    let floor: i64 =
        sqlx::query_scalar("SELECT min_supported_version FROM _syntheo_schema_compat WHERE id = 0")
            .fetch_one(db.pool())
            .await
            .unwrap();
    assert!(floor < 20261109170000, "floor {floor}");
}
