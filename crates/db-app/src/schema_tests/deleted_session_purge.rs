// Issue 712 : purge définitive d'une session supprimée, après le délai
// d'annulation. Noms et contenus fictifs.

use super::*;

const TOMBSTONE: &str = "2026-11-24T10:00:00.000Z";

async fn deleted_session(db: &Db, id: &str, tombstone: &str) {
    sqlx::query(
        "INSERT INTO sessions (id, workspace_id, title, deleted_at) VALUES (?1, 'workspace-1', 'Revue du pilote', ?2)",
    )
    .bind(id)
    .bind(tombstone)
    .execute(db.pool())
    .await
    .unwrap();
    for sql in [
        "INSERT INTO session_documents (id, session_id, kind, body, deleted_at) VALUES (?1 || '-note', ?1, 'note', 'Texte fictif', ?2)",
        "INSERT INTO transcripts (id, session_id, deleted_at) VALUES (?1 || '-t', ?1, ?2)",
        "INSERT INTO session_participants (id, session_id, human_id, deleted_at) VALUES (?1 || '-p', ?1, 'human-1', ?2)",
        "INSERT INTO entity_mentions (id, source_type, source_id, target_type, target_id, deleted_at) VALUES (?1 || '-m', 'session', ?1, 'human', 'human-1', ?2)",
        "INSERT INTO summary_generated_bodies (document_id, session_id, body) VALUES (?1 || '-s', ?1, 'Synthèse fictive')",
        "INSERT INTO session_attachments (id, session_id, filename, deleted_at) VALUES (?1 || '-a', ?1, 'plan.pdf', ?2)",
    ] {
        sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(id)
            .bind(tombstone)
            .execute(db.pool())
            .await
            .unwrap();
    }
}

async fn remaining(db: &Db, id: &str) -> i64 {
    let mut total = 0;
    for sql in [
        "SELECT count(*) FROM sessions WHERE id = ?1",
        "SELECT count(*) FROM session_documents WHERE session_id = ?1",
        "SELECT count(*) FROM transcripts WHERE session_id = ?1",
        "SELECT count(*) FROM session_participants WHERE session_id = ?1",
        "SELECT count(*) FROM entity_mentions WHERE source_id = ?1",
        "SELECT count(*) FROM summary_generated_bodies WHERE session_id = ?1",
        "SELECT count(*) FROM session_attachments WHERE session_id = ?1",
    ] {
        total += sqlx::query_scalar::<_, i64>(sqlx::AssertSqlSafe(sql))
            .bind(id)
            .fetch_one(db.pool())
            .await
            .unwrap();
    }
    total
}

async fn purge(db: &Db, id: &str, tombstone: &str) -> DeletedSessionPurge {
    let mut tx = db.pool().begin().await.unwrap();
    let outcome = purge_deleted_session(&mut tx, id, tombstone).await.unwrap();
    tx.commit().await.unwrap();
    outcome
}

#[tokio::test]
async fn a_deleted_session_is_purged_entirely_and_only_once() {
    let db = test_db().await;
    deleted_session(&db, "session-1", TOMBSTONE).await;
    deleted_session(&db, "session-2", TOMBSTONE).await;
    assert_eq!(remaining(&db, "session-1").await, 7);

    // Sans `cloud_sync_enabled = false` en base : le réglage hérité n'est
    // pas lu.
    let outcome = purge(&db, "session-1", TOMBSTONE).await;
    assert!(
        matches!(outcome, DeletedSessionPurge::Purged { rows } if rows >= 7),
        "{outcome:?}"
    );
    assert_eq!(remaining(&db, "session-1").await, 0);
    // L'autre session n'est pas touchée.
    assert_eq!(remaining(&db, "session-2").await, 7);
    // Seconde passe : rien à faire, pas d'erreur.
    assert_eq!(
        purge(&db, "session-1", TOMBSTONE).await,
        DeletedSessionPurge::NotDeleted
    );
}

#[tokio::test]
async fn a_restored_or_deleted_again_session_is_not_purged() {
    let db = test_db().await;
    deleted_session(&db, "session-1", TOMBSTONE).await;
    // Supprimée à nouveau, sous une autre pierre tombale.
    assert_eq!(
        purge(&db, "session-1", "2026-11-24T09:00:00.000Z").await,
        DeletedSessionPurge::NotDeleted
    );
    // Restaurée.
    sqlx::query("UPDATE sessions SET deleted_at = NULL WHERE id = 'session-1'")
        .execute(db.pool())
        .await
        .unwrap();
    assert_eq!(
        purge(&db, "session-1", TOMBSTONE).await,
        DeletedSessionPurge::NotDeleted
    );
    assert_eq!(remaining(&db, "session-1").await, 7);
}

#[tokio::test]
async fn synced_content_keeps_the_tombstone() {
    let db = test_db().await;
    deleted_session(&db, "session-1", TOMBSTONE).await;
    sqlx::query(
        "UPDATE session_attachments SET cloud_sync_enabled = 1 WHERE session_id = 'session-1'",
    )
    .execute(db.pool())
    .await
    .unwrap();
    assert_eq!(
        purge(&db, "session-1", TOMBSTONE).await,
        DeletedSessionPurge::Refused("cloud attachment")
    );
    assert_eq!(remaining(&db, "session-1").await, 7);

    deleted_session(&db, "session-2", TOMBSTONE).await;
    sqlx::query(
        "INSERT INTO e2ee_local_state (record_id, table_name, row_id) VALUES ('r-1', 'sessions', 'session-2')",
    )
    .execute(db.pool())
    .await
    .unwrap();
    assert_eq!(
        purge(&db, "session-2", TOMBSTONE).await,
        DeletedSessionPurge::Refused("e2ee replica")
    );
    assert_eq!(remaining(&db, "session-2").await, 7);
}

#[tokio::test]
async fn only_whole_sessions_deleted_since_the_purge_began_and_past_the_margin_expire() {
    let db = test_db().await;
    // Premier appel : la date de départ de la purge est posée maintenant.
    assert!(
        expired_deleted_sessions(db.pool())
            .await
            .unwrap()
            .is_empty()
    );
    let since: String = sqlx::query_scalar(
        "SELECT json_extract(value_json, '$') FROM app_settings WHERE id = 'session_purge_since'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    // Recule la date de départ d'une heure pour simuler l'ancienneté.
    sqlx::query(
        "UPDATE app_settings SET value_json = json_quote(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 minutes')) WHERE id = 'session_purge_since'",
    )
    .execute(db.pool())
    .await
    .unwrap();
    assert!(since.ends_with('Z'));

    let ago = |minutes: i64| format!("-{minutes} minutes");
    for (id, offset) in [
        ("expired", ago(30)),       // supprimée il y a 30 min : purgeable
        ("recent", ago(2)),         // dans la marge de 10 min : pas encore
        ("before-0.8.1", ago(120)), // avant la date de départ : gardée
    ] {
        let tombstone: String =
            sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)")
                .bind(offset)
                .fetch_one(db.pool())
                .await
                .unwrap();
        deleted_session(&db, id, &tombstone).await;
    }
    // Session vivante dont un document a été supprimé seul.
    sqlx::raw_sql(
        "INSERT INTO sessions (id, workspace_id) VALUES ('alive', 'workspace-1');
         INSERT INTO session_documents (id, session_id, kind, deleted_at)
           VALUES ('alive-doc', 'alive', 'summary', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes'));",
    )
    .execute(db.pool())
    .await
    .unwrap();

    let expired = expired_deleted_sessions(db.pool()).await.unwrap();
    let ids: Vec<&str> = expired.iter().map(|(id, _)| id.as_str()).collect();
    assert_eq!(ids, ["expired"]);
    let (id, tombstone) = &expired[0];
    assert!(matches!(
        purge(&db, id, tombstone).await,
        DeletedSessionPurge::Purged { .. }
    ));
    assert!(
        expired_deleted_sessions(db.pool())
            .await
            .unwrap()
            .is_empty()
    );
}
