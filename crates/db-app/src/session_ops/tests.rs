use syntheo_db_core::Db;

use super::*;

async fn test_db() -> Db {
    let db = Db::connect_memory_plain().await.unwrap();
    crate::prepare_schema(&db).await.unwrap();
    db
}

async fn insert_session(
    pool: &SqlitePool,
    id: &str,
    title: &str,
    started_at: &str,
    series_id: &str,
) {
    sqlx::query(
        "INSERT INTO sessions
             (id, title, started_at, series_id, source_apps_json, metadata_json)
             VALUES (?, ?, ?, ?, '[{\"app\":\"zoom\"}]', '{\"source\":\"test\"}')",
    )
    .bind(id)
    .bind(title)
    .bind(started_at)
    .bind(series_id)
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn list_sessions_filters_searches_and_paginates_deterministically() {
    let db = test_db().await;
    insert_session(
        db.pool(),
        "alpha-old",
        "Alpha Planning",
        "2026-01-01",
        "series-a",
    )
    .await;
    insert_session(
        db.pool(),
        "alpha-new",
        "ALPHA Review",
        "2026-02-01",
        "series-a",
    )
    .await;
    insert_session(db.pool(), "beta", "Beta Review", "2026-03-01", "series-b").await;
    sqlx::query("UPDATE sessions SET deleted_at = '2026-04-01' WHERE id = 'beta'")
        .execute(db.pool())
        .await
        .unwrap();

    let first = list_sessions(
        db.pool(),
        ListSessions {
            query: Some(" alpha "),
            series_id: Some("series-a"),
            folder_path: None,
            limit: 1,
            offset: 0,
        },
    )
    .await
    .unwrap();
    let second = list_sessions(
        db.pool(),
        ListSessions {
            query: Some("alpha"),
            series_id: Some("series-a"),
            folder_path: None,
            limit: 1,
            offset: 1,
        },
    )
    .await
    .unwrap();
    let by_id = list_sessions(
        db.pool(),
        ListSessions {
            query: Some("old"),
            series_id: None,
            folder_path: None,
            limit: 10,
            offset: 0,
        },
    )
    .await
    .unwrap();

    assert_eq!(first[0].id, "alpha-new");
    assert_eq!(second[0].id, "alpha-old");
    assert_eq!(by_id[0].id, "alpha-old");
}

#[tokio::test]
async fn list_sessions_filters_folder_and_subfolders() {
    let db = test_db().await;
    for (id, started_at) in [
        ("launch", "2026-01-04"),
        ("launch-design", "2026-01-03"),
        ("launch-sibling", "2026-01-02"),
        ("unfiled", "2026-01-01"),
    ] {
        insert_session(db.pool(), id, id, started_at, "").await;
    }
    sqlx::query(
        "UPDATE sessions SET folder_path = CASE id
               WHEN 'launch' THEN 'Projects/Launch'
               WHEN 'launch-design' THEN 'Projects/Launch/Design'
               WHEN 'launch-sibling' THEN 'Projects/Launch 2'
               ELSE '' END",
    )
    .execute(db.pool())
    .await
    .unwrap();

    let listed = list_sessions(
        db.pool(),
        ListSessions {
            query: None,
            series_id: None,
            folder_path: Some("Projects/Launch"),
            limit: 10,
            offset: 0,
        },
    )
    .await
    .unwrap();

    assert_eq!(
        listed
            .iter()
            .map(|session| (session.id.as_str(), session.folder_path.as_str()))
            .collect::<Vec<_>>(),
        vec![
            ("launch", "Projects/Launch"),
            ("launch-design", "Projects/Launch/Design"),
        ]
    );
}

#[tokio::test]
async fn list_folder_paths_combines_active_folder_sources() {
    let db = test_db().await;
    insert_session(db.pool(), "filed", "Filed", "2026-01-01", "").await;
    insert_session(db.pool(), "deleted", "Deleted", "2026-01-01", "").await;
    sqlx::query(
        "UPDATE sessions SET folder_path = CASE id
               WHEN 'filed' THEN 'Clients/ACME'
               ELSE 'Deleted folder' END,
               deleted_at = CASE id WHEN 'deleted' THEN '2026-02-01' END",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO folder_attachments (id, folder_path) VALUES ('attachment', 'Courses/Math')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO folders (id, path) VALUES ('empty', 'Projects/Empty'), ('dupe', 'Clients/ACME')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    assert_eq!(
        list_folder_paths(db.pool()).await.unwrap(),
        vec!["Clients/ACME", "Courses/Math", "Projects/Empty"]
    );
}

#[tokio::test]
async fn session_read_helpers_return_active_rows_and_preserve_opaque_json() {
    let db = test_db().await;
    insert_session(db.pool(), "session-1", "Planning", "2026-01-01", "").await;
    sqlx::query(
        "INSERT INTO session_documents
             (id, session_id, kind, body, sort_order, created_at)
             VALUES
             ('fallback', 'session-1', 'note', 'fallback body', 0, '2026-01-01'),
             ('session-1', 'session-1', 'note', 'canonical body', 1, '2026-02-01'),
             ('summary', 'session-1', 'summary', 'summary body', 2, '2026-03-01'),
             ('deleted', 'session-1', 'note', 'deleted body', 3, '2026-04-01')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("UPDATE session_documents SET deleted_at = '2026-05-01' WHERE id = 'deleted'")
        .execute(db.pool())
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO transcripts
             (id, session_id, started_at_ms, words_json, speaker_hints_json)
             VALUES ('later', 'session-1', 200, '[{\"word\":\"later\"}]', '[]'),
                    ('earlier', 'session-1', 100, '[{\"word\":\"earlier\"}]', '[]')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO organizations (id, name) VALUES ('org-1', 'Acme')")
        .execute(db.pool())
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO humans (id, organization_id, name, email, job_title)
             VALUES ('human-1', 'org-1', 'Alice', 'alice@example.com', 'Engineer')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO session_participants
               (id, session_id, human_id, display_name, email, created_at)
             VALUES ('second', 'session-1', 'human-1', 'Alias', 'alias@example.com', '2026-02-01'),
                    ('first', 'session-1', '', 'First', '', '2026-01-01'),
                    ('excluded', 'session-1', '', 'Excluded', '', '2026-03-01')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("UPDATE session_participants SET source = 'excluded' WHERE id = 'excluded'")
        .execute(db.pool())
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO action_items (id, session_id, source_order, text, body_json)
             VALUES ('action-2', 'session-1', 2, 'Second', '{\"rank\":2}'),
                    ('action-1', 'session-1', 1, 'First', '{\"rank\":1}')",
    )
    .execute(db.pool())
    .await
    .unwrap();

    let session = get_session(db.pool(), "session-1").await.unwrap().unwrap();
    let documents = list_session_documents(db.pool(), "session-1")
        .await
        .unwrap();
    let note = get_session_note(db.pool(), "session-1")
        .await
        .unwrap()
        .unwrap();
    let transcripts = list_session_transcripts(db.pool(), "session-1")
        .await
        .unwrap();
    let participants = list_session_participants(db.pool(), "session-1")
        .await
        .unwrap();
    let action_items = list_session_action_items(db.pool(), "session-1")
        .await
        .unwrap();

    assert_eq!(session.source_apps_json, "[{\"app\":\"zoom\"}]");
    assert_eq!(session.locked, 0);
    assert_eq!(
        documents
            .iter()
            .map(|row| row.id.as_str())
            .collect::<Vec<_>>(),
        vec!["fallback", "session-1", "summary"]
    );
    assert_eq!(note.id, "session-1");
    assert_eq!(
        transcripts
            .iter()
            .map(|row| row.id.as_str())
            .collect::<Vec<_>>(),
        vec!["earlier", "later"]
    );
    assert_eq!(
        participants
            .iter()
            .map(|row| row.id.as_str())
            .collect::<Vec<_>>(),
        vec!["first", "second"]
    );
    assert_eq!(participants[1].display_name, "Alice");
    assert_eq!(participants[1].email, "alice@example.com");
    assert_eq!(participants[1].job_title, "Engineer");
    assert_eq!(participants[1].organization_id, "org-1");
    assert_eq!(participants[1].organization_name, "Acme");
    assert_eq!(
        action_items
            .iter()
            .map(|row| row.id.as_str())
            .collect::<Vec<_>>(),
        vec!["action-1", "action-2"]
    );
    assert_eq!(action_items[0].body_json, "{\"rank\":1}");

    sqlx::query("UPDATE session_documents SET deleted_at = '2026-06-01' WHERE id = 'session-1'")
        .execute(db.pool())
        .await
        .unwrap();
    let fallback = get_session_note(db.pool(), "session-1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(fallback.id, "fallback");

    sqlx::query("UPDATE sessions SET deleted_at = '2026-07-01' WHERE id = 'session-1'")
        .execute(db.pool())
        .await
        .unwrap();
    assert!(
        list_session_documents(db.pool(), "session-1")
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        list_session_transcripts(db.pool(), "session-1")
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        list_session_participants(db.pool(), "session-1")
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        list_session_action_items(db.pool(), "session-1")
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn recurring_sessions_resolve_series_and_return_newest_first() {
    let db = test_db().await;
    insert_session(db.pool(), "old", "Weekly", "2026-01-01", "series-a").await;
    insert_session(db.pool(), "current", "Weekly", "2026-02-01", "series-a").await;
    insert_session(db.pool(), "new", "Weekly", "2026-03-01", "series-a").await;
    insert_session(db.pool(), "standalone", "One-off", "2026-04-01", "").await;

    let recurring = list_recurring_sessions(db.pool(), "current", 2)
        .await
        .unwrap();
    let standalone = list_recurring_sessions(db.pool(), "standalone", 10)
        .await
        .unwrap();
    let missing = list_recurring_sessions(db.pool(), "missing", 10)
        .await
        .unwrap();

    assert_eq!(
        recurring
            .iter()
            .map(|row| row.id.as_str())
            .collect::<Vec<_>>(),
        vec!["new", "current"]
    );
    assert!(standalone.is_empty());
    assert!(missing.is_empty());
}

#[tokio::test]
async fn session_proposals_insert_list_and_transition_status() {
    let db = test_db().await;
    insert_session(db.pool(), "session-1", "Planning", "2026-01-01", "").await;
    let created = insert_session_proposal(
        db.pool(),
        InsertSessionProposal {
            id: "proposal-1",
            workspace_id: "workspace-1",
            session_id: "session-1",
            kind: "summary_replace",
            target_id: "summary-1",
            base_updated_at: "2026-01-01T00:00:00Z",
            current_markdown: "old",
            proposed_markdown: "new",
            source: "cli",
        },
    )
    .await
    .unwrap();

    assert_eq!(created.status, "pending");
    assert_eq!(created.proposed_markdown, "new");

    let pending = list_session_proposals(db.pool(), Some("session-1"), Some("pending"), 10, 0)
        .await
        .unwrap();
    assert_eq!(pending.len(), 1);

    let applied = update_session_proposal_status(db.pool(), "proposal-1", "pending", "applied")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(applied.status, "applied");

    let unchanged = update_session_proposal_status(db.pool(), "proposal-1", "pending", "declined")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unchanged.status, "applied");
}
