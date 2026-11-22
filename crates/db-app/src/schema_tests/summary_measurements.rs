// Mesure de la reprise et matrice de calibrage en 0.8.0 (issue 671) : des
// nombres, des identifiants et des dates seulement. Aucune colonne ne peut
// recevoir de texte libre.
use super::*;

const MIGRATION_ID: &str = "20261122120000_summary_measurements";
const TABLES: [&str; 7] = [
    "summary_measurements",
    "summary_measurement_sections",
    "calibration_results",
    "beta_enrollment",
    "beta_generations",
    "beta_terms",
    "beta_term_errors",
];
/// Seules colonnes TEXT permises, toutes contraintes par CHECK.
const TEXT_COLUMNS: [&str; 18] = [
    "id",
    "document_id",
    "session_id",
    "measurement_id",
    "measured_at",
    "created_at",
    "generated_source",
    "role",
    "pseudonym",
    "enrolled_at",
    "exported_at",
    "shared_at",
    "hash",
    "term_hash",
    "first_seen_at",
    "added_seen_at",
    "term_key",
    "generated_at",
];
const ID: &str = "0b9f2c1e-4d3a-4b5c-8d7e-1f2a3b4c5d6e";

#[test]
fn summary_measurements_migration_is_registered_once_and_additive() {
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
async fn measurement_tables_have_no_free_text_column() {
    let db = Db::connect_memory_plain().await.unwrap();
    prepare_schema(&db).await.unwrap();
    for table in TABLES {
        let columns: Vec<(String, String)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT name, type FROM pragma_table_info('{table}')"
        )))
        .fetch_all(db.pool())
        .await
        .unwrap();
        assert!(!columns.is_empty(), "{table}");
        for (name, kind) in columns {
            assert!(
                kind == "INTEGER" || TEXT_COLUMNS.contains(&name.as_str()),
                "{table}.{name} : {kind}"
            );
        }
    }
}

#[tokio::test]
async fn text_columns_refuse_free_text() {
    let db = Db::connect_memory_plain().await.unwrap();
    prepare_schema(&db).await.unwrap();
    let insert = |id: &str, document: &str, measured_at: Option<&str>| {
        let sql = match measured_at {
            Some(at) => format!(
                "INSERT INTO summary_measurements (id, document_id, session_id, rule_version, aligned, headings_generated, headings_matched, generated_words, added_words, deleted_words, replaced_content, replaced_lexical, unmatched_sent_words, measured_at) VALUES ('{id}', '{document}', 'session-1', 1, 1, 3, 3, 28, 3, 2, 4, 1, 0, '{at}')"
            ),
            None => format!(
                "INSERT INTO summary_measurements (id, document_id, session_id, rule_version, aligned, headings_generated, headings_matched, generated_words, added_words, deleted_words, replaced_content, replaced_lexical, unmatched_sent_words) VALUES ('{id}', '{document}', 'session-1', 1, 1, 3, 3, 28, 3, 2, 4, 1, 0)"
            ),
        };
        let pool = db.pool().clone();
        async move { sqlx::query(sqlx::AssertSqlSafe(sql)).execute(&pool).await }
    };
    insert(ID, "doc-1", None).await.unwrap();
    // Synthèse principale d'une réunion : `summary:<sessionId>` (revue du lot
    // 0.8.0, constat 2).
    insert(
        "3b9f2c1e-4d3a-4b5c-8d7e-1f2a3b4c5d6e",
        "summary:5f0c2a7e-1b3d-4c6e-9a8b-7d6e5f4a3b2c",
        None,
    )
    .await
    .unwrap();
    for (id, document, at) in [
        ("Le projet avance avec Martin et Alice", "doc-2", None),
        (
            "1b9f2c1e-4d3a-4b5c-8d7e-1f2a3b4c5d6e",
            "Le budget est validé",
            None,
        ),
        (
            "2b9f2c1e-4d3a-4b5c-8d7e-1f2a3b4c5d6e",
            "doc-3",
            Some("2026-11-22T10:00:00Z Martin"),
        ),
    ] {
        assert!(
            insert(id, document, at).await.is_err(),
            "{id} {document} {at:?}"
        );
    }
    let calibration = sqlx::query(sqlx::AssertSqlSafe(
        "INSERT INTO calibration_results (id, rule_version, auto_content_true_content, auto_content_true_lexical, auto_lexical_true_content, auto_lexical_true_lexical) VALUES ('texte libre interdit dans cet identifiant', 1, 150, 12, 9, 40)",
    ))
    .execute(db.pool())
    .await;
    assert!(calibration.is_err());
}

#[tokio::test]
async fn sections_are_deleted_with_their_measurement() {
    let db = Db::connect_memory_plain().await.unwrap();
    prepare_schema(&db).await.unwrap();
    // Sans clés étrangères actives : le déclencheur suffit.
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(db.pool())
        .await
        .unwrap();
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO summary_measurements (id, document_id, session_id, rule_version, aligned, headings_generated, headings_matched, generated_words, added_words, deleted_words, replaced_content, replaced_lexical, unmatched_sent_words) VALUES ('{ID}', 'doc-1', 'session-1', 1, 1, 3, 3, 28, 3, 2, 4, 1, 0)"
    )))
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO summary_measurement_sections VALUES ('{ID}', 0, 1, 11, 0, 0, 3, 0, 'other')"
    )))
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DELETE FROM summary_measurements WHERE id = '{ID}'"
    )))
    .execute(db.pool())
    .await
    .unwrap();
    let left: (i64,) = sqlx::query_as("SELECT count(*) FROM summary_measurement_sections")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(left.0, 0);
}

// Issue 672 : pseudonyme, dates, rôles et empreintes refusent le texte libre.
#[tokio::test]
async fn beta_export_tables_refuse_free_text() {
    let db = Db::connect_memory_plain().await.unwrap();
    prepare_schema(&db).await.unwrap();
    let run = |sql: String| {
        let pool = db.pool().clone();
        async move { sqlx::query(sqlx::AssertSqlSafe(sql)).execute(&pool).await }
    };
    let pseudonym = "p-3f9a1c0e7b2d4f6a8c1e3b5d7f9a2c4e";
    run(format!(
        "INSERT INTO beta_enrollment VALUES (1, '{pseudonym}', '2026-11-22T10:00:00.000Z', '{}')",
        "0f".repeat(32)
    ))
    .await
    .unwrap();
    let hash = "a".repeat(64);
    run(format!(
        "INSERT INTO beta_terms VALUES ('{hash}', 1, '2026-11-22T10:00:00.000Z', 0, NULL)"
    ))
    .await
    .unwrap();
    run("INSERT INTO beta_generations (document_id, session_id, generated_at, shared_at) VALUES ('summary:5f0c2a7e-1b3d-4c6e-9a8b-7d6e5f4a3b2c', '5f0c2a7e-1b3d-4c6e-9a8b-7d6e5f4a3b2c', '2026-11-23T08:00:00.000Z', '2026-11-23T09:00:00.000Z')".into())
        .await
        .unwrap();
    for sql in [
        format!("INSERT INTO beta_enrollment VALUES (2, 'p-3f9a1c0e7b2d4f6a8c1e3b5d7f9a2c4e', '2026-11-22T10:00:00Z', '{}')", "0f".repeat(32)),
        "UPDATE beta_enrollment SET term_key = 'clé secrète'".to_string(),
        "INSERT INTO beta_terms VALUES ('".to_string() + &"b".repeat(64) + "', 100000, '2026-11-22T10:00:00Z', 0, NULL)",
        "UPDATE beta_enrollment SET pseudonym = 'Alice Martin'".to_string(),
        "INSERT INTO beta_terms VALUES ('Nemotron', 2, '2026-11-22T10:00:00Z', 0, NULL)".to_string(),
        "INSERT INTO beta_generations (document_id, session_id, generated_at) VALUES ('doc-2', 's-1', 'hier soir')".to_string(),
        "UPDATE summary_measurement_sections SET role = 'Décisions du comité'".to_string(),
    ] {
        let result = run(sql.clone()).await;
        let changed = result.as_ref().map(|r| r.rows_affected()).unwrap_or(0);
        // UPDATE sans ligne : on vérifie le CHECK sur une ligne réelle plus bas.
        assert!(result.is_err() || changed == 0 && sql.starts_with("UPDATE summary"), "{sql}");
    }
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO summary_measurements (id, document_id, session_id, rule_version, aligned, headings_generated, headings_matched, generated_words, added_words, deleted_words, replaced_content, replaced_lexical, unmatched_sent_words) VALUES ('{ID}', 'doc-1', 'session-1', 1, 1, 3, 3, 28, 3, 2, 4, 1, 0)"
    )))
    .execute(db.pool())
    .await
    .unwrap();
    run(format!("INSERT INTO summary_measurement_sections (measurement_id, section_index, matched, generated_words, added_words, deleted_words, replaced_content, replaced_lexical, role) VALUES ('{ID}', 1, 1, 11, 3, 0, 1, 1, 'decisions')")).await.unwrap();
    assert!(run(format!("INSERT INTO summary_measurement_sections (measurement_id, section_index, matched, generated_words, added_words, deleted_words, replaced_content, replaced_lexical, role) VALUES ('{ID}', 2, 1, 6, 0, 2, 0, 0, 'Actions du projet Atlas')")).await.is_err());
    run(format!(
        "INSERT INTO beta_term_errors VALUES ('{ID}', '{hash}', 1)"
    ))
    .await
    .unwrap();
    // Les erreurs suivent leur mesure, même sans clés étrangères.
    run("PRAGMA foreign_keys = OFF".into()).await.unwrap();
    run(format!(
        "DELETE FROM summary_measurements WHERE id = '{ID}'"
    ))
    .await
    .unwrap();
    let left: (i64,) = sqlx::query_as("SELECT count(*) FROM beta_term_errors")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(left.0, 0);
    // Revue 0.8.0, constat 6 : le terme resté sans erreur disparaît aussi.
    let terms: (i64,) = sqlx::query_as("SELECT count(*) FROM beta_terms")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(terms.0, 0);
}
