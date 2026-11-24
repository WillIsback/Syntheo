use sqlx::{Row, Sqlite, Transaction};

pub(crate) const CAPTURE_USAGE_SESSION_PREDICATE: &str = "CASE WHEN json_valid(value_json) THEN
       json_extract(value_json,'$.sessionId')=?1
       AND id='capture_usage:'||?1||':'||json_extract(value_json,'$.transcriptId')
     ELSE 0 END";

pub(crate) fn capture_stop_session_predicate() -> String {
    format!(
        "id IN (SELECT 'capture_stop:'||?1||':'||id FROM transcripts WHERE session_id=?1
          UNION SELECT 'capture_stop:'||?1||':'||json_extract(value_json,'$.transcriptId')
          FROM app_settings WHERE ({CAPTURE_USAGE_SESSION_PREDICATE}))"
    )
}

/// Contenu de la session qui appartient à un protocole de synchronisation :
/// pièce jointe cloud (clé d'objet ou intention de synchronisation) ou
/// réplique e2ee. Sa suppression relève de ce protocole, pas d'une purge
/// locale. `None` si tout est local.
async fn synced_content(
    tx: &mut Transaction<'_, Sqlite>,
    id: &str,
) -> Result<Option<&'static str>, sqlx::Error> {
    let cloud_attachment: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM session_attachments WHERE session_id=? AND (cloud_object_key<>'' OR cloud_sync_enabled=1))").bind(id).fetch_one(&mut **tx).await?;
    if cloud_attachment {
        return Ok(Some("cloud attachment"));
    }
    let replicas: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM e2ee_local_state WHERE (table_name='sessions' AND row_id=?) OR (table_name='transcripts' AND row_id IN (SELECT id FROM transcripts WHERE session_id=?)) OR (table_name='session_documents' AND row_id IN (SELECT id FROM session_documents WHERE session_id=?)) OR (table_name='session_attachments' AND row_id IN (SELECT id FROM session_attachments WHERE session_id=?)))")
        .bind(id).bind(id).bind(id).bind(id).fetch_one(&mut **tx).await?;
    Ok(replicas.then_some("e2ee replica"))
}

/// Physical local deletion after the caller has locked the database and
/// verified the exported snapshot. Refuse replicas and cloud content;
/// their deletion requires the owning sync protocol rather than a local purge.
pub async fn purge_local_session(
    tx: &mut Transaction<'_, Sqlite>,
    id: &str,
) -> Result<(), sqlx::Error> {
    let cloud_disabled: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM app_settings WHERE id='cloud_sync_enabled' AND value_json='false')").fetch_one(&mut **tx).await?;
    if !cloud_disabled || synced_content(tx, id).await?.is_some() {
        return Err(sqlx::Error::Protocol(
            "local purge requires unsynced local content".into(),
        ));
    }
    purge_session_rows(tx, id).await.map(|_| ())
}

/// Issue d'une purge de session supprimée.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeletedSessionPurge {
    /// Lignes supprimées, session comprise.
    Purged { rows: u64 },
    /// Rien à faire : session absente (déjà purgée), vivante (restaurée), ou
    /// supprimée sous une autre pierre tombale. Une seconde passe aboutit ici.
    NotDeleted,
    /// Contenu synchronisé (`synced_content`) : la pierre tombale reste.
    Refused(&'static str),
}

/// Purge définitive d'une session supprimée en entier, une fois le délai
/// d'annulation écoulé (issue 712) : seulement si `sessions.deleted_at` vaut
/// `tombstone`. Même parcours que `purge_local_session` (CLI `meetings
/// delete`). Le réglage hérité `cloud_sync_enabled` n'est pas lu : Syntheo
/// n'a aucun transport de synchronisation ; seul un contenu synchronisé
/// concret (pièce jointe cloud, réplique e2ee) bloque la purge.
pub async fn purge_deleted_session(
    tx: &mut Transaction<'_, Sqlite>,
    id: &str,
    tombstone: &str,
) -> Result<DeletedSessionPurge, sqlx::Error> {
    let deleted_at: Option<Option<String>> =
        sqlx::query_scalar("SELECT deleted_at FROM sessions WHERE id=?")
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?;
    if deleted_at.flatten().as_deref() != Some(tombstone) {
        return Ok(DeletedSessionPurge::NotDeleted);
    }
    if let Some(reason) = synced_content(tx, id).await? {
        return Ok(DeletedSessionPurge::Refused(reason));
    }
    Ok(DeletedSessionPurge::Purged {
        rows: purge_session_rows(tx, id).await?,
    })
}

/// Délai après lequel une session supprimée est purgée au démarrage, s'il
/// reste une pierre tombale (fermeture brutale pendant le délai
/// d'annulation, purge refusée puis débloquée).
pub const DELETED_SESSION_PURGE_MARGIN: &str = "-10 minutes";

/// Clé de `app_settings` : date de la première ouverture d'une version qui
/// purge les sessions supprimées. Les pierres tombales plus anciennes
/// (suppressions faites avant la 0.8.1) ne sont pas purgées au démarrage,
/// en attendant une décision.
pub const SESSION_PURGE_SINCE_KEY: &str = "session_purge_since";

/// Sessions supprimées en entier depuis plus de
/// `DELETED_SESSION_PURGE_MARGIN`, et après `SESSION_PURGE_SINCE_KEY` (posée
/// au premier appel) : (identifiant, pierre tombale), 200 au plus, des plus
/// anciennes aux plus récentes. Les éléments supprimés un par un (document,
/// transcription) d'une session vivante n'y figurent jamais.
pub async fn expired_deleted_sessions(
    pool: &sqlx::SqlitePool,
) -> Result<Vec<(String, String)>, sqlx::Error> {
    sqlx::query(
        "INSERT INTO app_settings (id, value_json)
         VALUES (?, json_quote(strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
         ON CONFLICT(id) DO NOTHING",
    )
    .bind(SESSION_PURGE_SINCE_KEY)
    .execute(pool)
    .await?;
    sqlx::query_as(
        "SELECT id, deleted_at FROM sessions
         WHERE deleted_at IS NOT NULL
           AND deleted_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
           AND deleted_at >= (
             SELECT json_extract(value_json, '$') FROM app_settings WHERE id = ?
           )
         ORDER BY deleted_at, id
         LIMIT 200",
    )
    .bind(DELETED_SESSION_PURGE_MARGIN)
    .bind(SESSION_PURGE_SINCE_KEY)
    .fetch_all(pool)
    .await
}

/// Suppression physique de tout ce qui appartient à la session, dans la
/// transaction de l'appelant ; rend le nombre de lignes supprimées.
async fn purge_session_rows(
    tx: &mut Transaction<'_, Sqlite>,
    id: &str,
) -> Result<u64, sqlx::Error> {
    let mut rows = 0;
    // Resolve exact owners while transcript rows still exist. Prefix matching
    // would include another session whose ID contains this ID plus a colon.
    rows += sqlx::query(sqlx::AssertSqlSafe(format!(
        "DELETE FROM app_settings WHERE ({})",
        capture_stop_session_predicate()
    )))
    .bind(id)
    .execute(&mut **tx)
    .await?
    .rows_affected();
    // Live partials are keyed by transcript, not session. Removing only the
    // final transcript would leave the original words in this journal.
    rows += sqlx::query("DELETE FROM transcript_live_state WHERE transcript_id IN (SELECT id FROM transcripts WHERE session_id=?)")
        .bind(id).execute(&mut **tx).await?.rows_affected();
    // Only names enumerated by SQLite and quoted as identifiers are used.
    // This includes document history, proposals and local attachment jobs.
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(&mut **tx)
    .await?;
    for table in tables {
        let quoted = format!("\"{}\"", table.replace('"', "\"\""));
        let columns = sqlx::query(sqlx::AssertSqlSafe(format!("PRAGMA table_info({quoted})")))
            .fetch_all(&mut **tx)
            .await?;
        if columns
            .iter()
            .any(|r| r.get::<String, _>("name") == "session_id")
        {
            rows += sqlx::query(sqlx::AssertSqlSafe(format!(
                "DELETE FROM {quoted} WHERE session_id=?"
            )))
            .bind(id)
            .execute(&mut **tx)
            .await?
            .rows_affected();
        }
    }
    rows += sqlx::query("DELETE FROM entity_mentions WHERE (source_type='session' AND source_id=?) OR (target_type='session' AND target_id=?)").bind(id).bind(id).execute(&mut **tx).await?.rows_affected();
    rows += sqlx::query("DELETE FROM app_settings WHERE id=?")
        .bind(format!("auto_enhance_pending:{id}"))
        .execute(&mut **tx)
        .await?
        .rows_affected();
    rows += sqlx::query("DELETE FROM sessions WHERE id=?")
        .bind(id)
        .execute(&mut **tx)
        .await?
        .rows_affected();
    Ok(rows)
}
