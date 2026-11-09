use super::*;
use serde_json::json;
use sqlx::Row;
use syntheo_db_app::MAX_SUMMARY_VERSIONS;
use syntheo_db_core::Db;

async fn test_db() -> Db {
    let db = Db::connect_memory_plain().await.unwrap();
    syntheo_db_app::prepare_schema(&db).await.unwrap();
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, owner_user_id)
             VALUES ('session-1', 'workspace-1', 'user-1')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO session_documents (
                id, workspace_id, session_id, kind, body, body_format
             ) VALUES (
                'note-1', 'workspace-1', 'session-1',
                'summary', 'old body', 'markdown'
             )",
    )
    .execute(db.pool())
    .await
    .unwrap();
    db
}

fn request(tag_names: Vec<&str>) -> SaveGeneratedSummaryRequest {
    SaveGeneratedSummaryRequest {
        session_id: "session-1".to_string(),
        owner_user_id: " user-1 ".to_string(),
        note_id: "note-1".to_string(),
        current_body: "old body".to_string(),
        current_body_format: "markdown".to_string(),
        next_body: r#"{"type":"doc","content":[]}"#.to_string(),
        tag_names: tag_names.into_iter().map(str::to_string).collect(),
        pending_auto_enhance: None,
        source_note_fingerprint: Some("note-v1".to_string()),
        note_passages: None,
    }
}

async fn summary_versions(db: &Db) -> Vec<(i64, String, String, String)> {
    sqlx::query_as(
        "SELECT version, document_id, body, superseded_at
             FROM session_summary_versions ORDER BY version",
    )
    .fetch_all(db.pool())
    .await
    .unwrap()
}

async fn summary_rows(db: &Db) -> i64 {
    sqlx::query_scalar(
        "SELECT count(*) FROM session_documents
             WHERE session_id = 'session-1'
               AND kind IN ('summary', 'template_output')",
    )
    .fetch_one(db.pool())
    .await
    .unwrap()
}

// Issue 415 : régénérer crée la version suivante ; l'ancienne est gardée à
// part, marquée remplacée, et `session_documents` ne garde que l'actuelle.
#[tokio::test]
async fn regeneration_keeps_the_previous_body_as_a_superseded_version() {
    let db = test_db().await;

    save_generated_summary(db.pool(), request(vec![]))
        .await
        .unwrap();

    let versions = summary_versions(&db).await;
    assert_eq!(versions.len(), 1);
    let (version, document_id, body, superseded_at) = &versions[0];
    assert_eq!(*version, 1);
    assert_eq!(document_id, "note-1");
    assert_eq!(body, "old body");
    assert!(superseded_at.ends_with('Z'));
    assert_eq!(summary_rows(&db).await, 1);

    let mut second = request(vec![]);
    second.current_body = r#"{"type":"doc","content":[]}"#.to_string();
    second.current_body_format = "prosemirror_json".to_string();
    second.next_body = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string();
    save_generated_summary(db.pool(), second).await.unwrap();

    let versions = summary_versions(&db).await;
    assert_eq!(
        versions
            .iter()
            .map(|(version, _, body, _)| (*version, body.as_str()))
            .collect::<Vec<_>>(),
        [(1, "old body"), (2, r#"{"type":"doc","content":[]}"#)]
    );
    assert_eq!(summary_rows(&db).await, 1);
}

#[tokio::test]
async fn first_generation_into_an_empty_summary_keeps_no_version() {
    let db = test_db().await;
    sqlx::query("UPDATE session_documents SET body = '' WHERE id = 'note-1'")
        .execute(db.pool())
        .await
        .unwrap();
    let mut request = request(vec![]);
    request.current_body = String::new();

    save_generated_summary(db.pool(), request).await.unwrap();

    assert!(summary_versions(&db).await.is_empty());
}

#[tokio::test]
async fn generation_records_the_source_note_fingerprint_and_time() {
    let db = test_db().await;

    save_generated_summary(db.pool(), request(vec![]))
        .await
        .unwrap();

    let (fingerprint, generated_at, updated_at): (String, String, String) = sqlx::query_as(
        "SELECT
               json_extract(generation_metadata_json, '$.sourceNoteFingerprint'),
               json_extract(generation_metadata_json, '$.generatedAt'),
               updated_at
             FROM session_documents WHERE id = 'note-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(fingerprint, "note-v1");
    assert_eq!(generated_at, updated_at);
}

// Issue 417 : les passages validés sont rangés à part du corps ; une
// génération sans balise efface ceux de la précédente.
#[tokio::test]
async fn generation_records_note_passages_apart_from_the_body() {
    let db = test_db().await;
    let mut first = request(vec![]);
    first.note_passages = Some(vec!["Mme Kowalczyk".to_string(), "50 000 €".to_string()]);
    save_generated_summary(db.pool(), first).await.unwrap();

    let passages: String = sqlx::query_scalar(
        "SELECT json_extract(generation_metadata_json, '$.notePassages')
             FROM session_documents WHERE id = 'note-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(passages, r#"["Mme Kowalczyk","50 000 €"]"#);

    let mut second = request(vec![]);
    second.current_body = r#"{"type":"doc","content":[]}"#.to_string();
    second.current_body_format = "prosemirror_json".to_string();
    save_generated_summary(db.pool(), second).await.unwrap();

    let kind: String = sqlx::query_scalar(
        "SELECT json_type(generation_metadata_json, '$.notePassages')
             FROM session_documents WHERE id = 'note-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(kind, "null");
}

#[tokio::test]
async fn only_the_latest_versions_are_kept() {
    let db = test_db().await;
    let mut current = "old body".to_string();
    let mut current_format = "markdown".to_string();
    for index in 0..(MAX_SUMMARY_VERSIONS + 3) {
        let mut next = request(vec![]);
        next.current_body = current.clone();
        next.current_body_format = current_format.clone();
        next.next_body = format!(r#"{{"type":"doc","attrs":{{"n":{index}}}}}"#);
        current = next.next_body.clone();
        current_format = "prosemirror_json".to_string();
        save_generated_summary(db.pool(), next).await.unwrap();
    }

    let versions = summary_versions(&db).await;
    assert_eq!(versions.len(), MAX_SUMMARY_VERSIONS as usize);
    assert_eq!(versions.first().unwrap().0, 4);
    assert_eq!(versions.last().unwrap().0, MAX_SUMMARY_VERSIONS + 3);
}

async fn insert_pending_setting(db: &Db, value: serde_json::Value) {
    sqlx::query("INSERT INTO app_settings (id, value_json) VALUES (?, ?)")
        .bind("auto_enhance_pending:session-1")
        .bind(value.to_string())
        .execute(db.pool())
        .await
        .unwrap();
}

#[tokio::test]
async fn saves_summary_tags_and_removes_matching_pending_setting_without_guard() {
    let db = test_db().await;
    insert_pending_setting(
        &db,
        json!({
            "noteId": "note-1",
            "body": "old body",
            "bodyFormat": "markdown"
        }),
    )
    .await;

    let mut request = request(vec!["launch", "launch", "", "prep"]);
    request.owner_user_id = "  ".to_string();
    save_generated_summary(db.pool(), request).await.unwrap();

    let row = sqlx::query(
        "SELECT body, body_format, updated_at
             FROM session_documents WHERE id = 'note-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(
        row.try_get::<String, _>("body").unwrap(),
        r#"{"type":"doc","content":[]}"#
    );
    assert_eq!(
        row.try_get::<String, _>("body_format").unwrap(),
        "prosemirror_json"
    );
    let updated_at: String = row.try_get("updated_at").unwrap();
    assert_eq!(updated_at.len(), 24);
    assert_eq!(&updated_at[19..20], ".");
    assert!(updated_at.ends_with('Z'));

    let tag_rows: Vec<(String, String)> =
        sqlx::query_as("SELECT id, owner_user_id FROM tags ORDER BY id")
            .fetch_all(db.pool())
            .await
            .unwrap();
    assert_eq!(
        tag_rows,
        [
            (
                "launch".to_string(),
                "00000000-0000-0000-0000-000000000000".to_string()
            ),
            (
                "prep".to_string(),
                "00000000-0000-0000-0000-000000000000".to_string()
            ),
        ]
    );
    let session_tag_ids: Vec<String> =
        sqlx::query_scalar("SELECT id FROM session_tags ORDER BY id")
            .fetch_all(db.pool())
            .await
            .unwrap();
    assert_eq!(session_tag_ids, ["session-1:launch", "session-1:prep"]);
    let pending_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM app_settings
             WHERE id = 'auto_enhance_pending:session-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(pending_count, 0);
}

#[tokio::test]
async fn matching_pending_guard_saves_summary_and_removes_setting() {
    let db = test_db().await;
    insert_pending_setting(
        &db,
        json!({
            "noteId": "note-1",
            "generation": "gen-1",
            "body": "old body",
            "bodyFormat": "markdown"
        }),
    )
    .await;
    let mut request = request(vec![]);
    request.pending_auto_enhance = Some(PendingAutoEnhanceGuard {
        generation: "gen-1".to_string(),
        expected_body: "old body".to_string(),
        expected_body_format: "markdown".to_string(),
    });

    save_generated_summary(db.pool(), request).await.unwrap();

    let row = sqlx::query(
        "SELECT body, body_format
             FROM session_documents WHERE id = 'note-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(
        row.try_get::<String, _>("body").unwrap(),
        r#"{"type":"doc","content":[]}"#
    );
    assert_eq!(
        row.try_get::<String, _>("body_format").unwrap(),
        "prosemirror_json"
    );
    let pending_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM app_settings
             WHERE id = 'auto_enhance_pending:session-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(pending_count, 0);
}

#[tokio::test]
async fn stale_current_body_rolls_back_without_inserting_tags() {
    let db = test_db().await;
    let mut request = request(vec!["launch"]);
    request.current_body = "stale body".to_string();

    let error = save_generated_summary(db.pool(), request)
        .await
        .unwrap_err();
    assert_eq!(error, "transaction statement 0 affected 0 rows; expected 1");

    let body: String = sqlx::query_scalar("SELECT body FROM session_documents WHERE id = 'note-1'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    let tag_count: i64 = sqlx::query_scalar("SELECT count(*) FROM tags")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(body, "old body");
    assert_eq!(tag_count, 0);
    assert!(summary_versions(&db).await.is_empty());
}

#[tokio::test]
async fn stale_pending_generation_rolls_back_and_keeps_the_setting() {
    let db = test_db().await;
    insert_pending_setting(
        &db,
        json!({
            "noteId": "note-1",
            "generation": "stored-generation",
            "body": "old body",
            "bodyFormat": "markdown"
        }),
    )
    .await;
    let mut request = request(vec!["launch"]);
    request.pending_auto_enhance = Some(PendingAutoEnhanceGuard {
        generation: "requested-generation".to_string(),
        expected_body: "old body".to_string(),
        expected_body_format: "markdown".to_string(),
    });

    let error = save_generated_summary(db.pool(), request)
        .await
        .unwrap_err();
    assert_eq!(error, "transaction statement 0 affected 0 rows; expected 1");

    let body: String = sqlx::query_scalar("SELECT body FROM session_documents WHERE id = 'note-1'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    let pending_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM app_settings
             WHERE id = 'auto_enhance_pending:session-1'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    let tag_count: i64 = sqlx::query_scalar("SELECT count(*) FROM tags")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(body, "old body");
    assert_eq!(pending_count, 1);
    assert_eq!(tag_count, 0);
    assert!(summary_versions(&db).await.is_empty());
}

#[tokio::test]
async fn soft_deleted_session_rejects_the_summary_save() {
    let db = test_db().await;
    sqlx::query("UPDATE sessions SET deleted_at = 'deleted' WHERE id = 'session-1'")
        .execute(db.pool())
        .await
        .unwrap();

    let error = save_generated_summary(db.pool(), request(vec!["launch"]))
        .await
        .unwrap_err();
    assert_eq!(error, "transaction statement 0 affected 0 rows; expected 1");

    let body: String = sqlx::query_scalar("SELECT body FROM session_documents WHERE id = 'note-1'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    let tag_count: i64 = sqlx::query_scalar("SELECT count(*) FROM tags")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(body, "old body");
    assert_eq!(tag_count, 0);
}
