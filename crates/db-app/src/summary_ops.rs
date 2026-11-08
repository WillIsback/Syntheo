use sqlx::SqliteConnection;

#[derive(Clone, Copy)]
pub struct PendingAutoEnhanceMatch<'a> {
    pub pending_setting_id: &'a str,
    pub generation: &'a str,
    pub expected_body: &'a str,
    pub expected_body_format: &'a str,
}

pub struct GeneratedSummaryBodyUpdate<'a> {
    pub note_id: &'a str,
    pub session_id: &'a str,
    pub current_body: &'a str,
    pub current_body_format: &'a str,
    pub next_body: &'a str,
    pub updated_at: &'a str,
    pub pending_auto_enhance: Option<PendingAutoEnhanceMatch<'a>>,
    pub source_note_fingerprint: Option<&'a str>,
    /// Passages validés venus des notes (issue 417), en tableau JSON : la
    /// synthèse enregistrée n'a aucune balise, sa provenance vit ici. `None`
    /// quand le modèle n'a rien balisé (l'affichage se replie alors sur les
    /// fragments).
    pub note_passages_json: Option<&'a str>,
}

/// Versions remplacées gardées par synthèse (issue 415) ; au-delà, les plus
/// anciennes sont effacées.
pub const MAX_SUMMARY_VERSIONS: i64 = 20;

/// Garde la synthèse sur le point d'être régénérée comme version remplacée,
/// dans la même transaction que son remplacement. Une synthèse vide (première
/// génération) ou identique au nouveau texte ne crée pas de version. Si la
/// mise à jour qui suit échoue, l'appelant annule la transaction et la version
/// disparaît avec elle.
async fn keep_replaced_summary_version(
    conn: &mut SqliteConnection,
    update: &GeneratedSummaryBodyUpdate<'_>,
) -> Result<(), sqlx::Error> {
    let kept = sqlx::query(
        "INSERT INTO session_summary_versions (
           id, workspace_id, document_id, session_id, version, template_id,
           title, body_format, body, generation_metadata_json, generated_at,
           superseded_at
         )
         SELECT
           lower(hex(randomblob(16))),
           document.workspace_id,
           document.id,
           document.session_id,
           COALESCE((
             SELECT MAX(previous.version)
             FROM session_summary_versions AS previous
             WHERE previous.document_id = document.id
           ), 0) + 1,
           document.template_id,
           document.title,
           document.body_format,
           document.body,
           document.generation_metadata_json,
           COALESCE(
             CASE
               WHEN json_valid(document.generation_metadata_json)
               THEN CAST(json_extract(
                 document.generation_metadata_json, '$.generatedAt'
               ) AS TEXT)
             END,
             document.updated_at
           ),
           ?
         FROM session_documents AS document
         WHERE document.id = ?
           AND document.session_id = ?
           AND document.kind IN ('summary', 'template_output')
           AND document.body = ?
           AND document.body_format = ?
           AND document.body <> ''
           AND document.body <> ?
           AND document.deleted_at IS NULL",
    )
    .bind(update.updated_at)
    .bind(update.note_id)
    .bind(update.session_id)
    .bind(update.current_body)
    .bind(update.current_body_format)
    .bind(update.next_body)
    .execute(&mut *conn)
    .await?;

    if kept.rows_affected() > 0 {
        sqlx::query(
            "DELETE FROM session_summary_versions
             WHERE document_id = ?
               AND id NOT IN (
                 SELECT id FROM session_summary_versions
                 WHERE document_id = ?
                 ORDER BY version DESC
                 LIMIT ?
               )",
        )
        .bind(update.note_id)
        .bind(update.note_id)
        .bind(MAX_SUMMARY_VERSIONS)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

pub async fn update_generated_summary_body(
    conn: &mut SqliteConnection,
    update: GeneratedSummaryBodyUpdate<'_>,
) -> Result<u64, sqlx::Error> {
    keep_replaced_summary_version(conn, &update).await?;
    let GeneratedSummaryBodyUpdate {
        note_id,
        session_id,
        current_body,
        current_body_format,
        next_body,
        updated_at,
        pending_auto_enhance,
        source_note_fingerprint,
        note_passages_json,
    } = update;
    let result = if let Some(pending) = pending_auto_enhance {
        sqlx::query(
            "UPDATE session_documents
             SET body = ?, body_format = 'prosemirror_json', updated_at = ?,
               generation_metadata_json = json_set(
                 CASE
                   WHEN json_valid(generation_metadata_json)
                   THEN generation_metadata_json
                   ELSE '{}'
                 END,
                 '$.generatedAt', ?,
                 '$.sourceNoteFingerprint', ?,
                 '$.notePassages', json(?)
               )
             WHERE id = ?
               AND session_id = ?
               AND kind IN ('summary', 'template_output')
               AND body = ?
               AND body_format = ?
               AND deleted_at IS NULL
               AND EXISTS (
                 SELECT 1 FROM sessions
                 WHERE sessions.id = ? AND sessions.deleted_at IS NULL
               )
               AND EXISTS (
                 SELECT 1
                 FROM app_settings AS pending
                 WHERE pending.id = ?
                   AND json_valid(pending.value_json)
                   AND json_extract(pending.value_json, '$.noteId') = ?
                   AND json_extract(pending.value_json, '$.generation') = ?
                   AND json_extract(pending.value_json, '$.body') = ?
                   AND json_extract(pending.value_json, '$.bodyFormat') = ?
                   AND session_documents.body =
                     json_extract(pending.value_json, '$.body')
                   AND session_documents.body_format =
                     json_extract(pending.value_json, '$.bodyFormat')
               )",
        )
        .bind(next_body)
        .bind(updated_at)
        .bind(updated_at)
        .bind(source_note_fingerprint)
        .bind(note_passages_json)
        .bind(note_id)
        .bind(session_id)
        .bind(current_body)
        .bind(current_body_format)
        .bind(session_id)
        .bind(pending.pending_setting_id)
        .bind(note_id)
        .bind(pending.generation)
        .bind(pending.expected_body)
        .bind(pending.expected_body_format)
        .execute(&mut *conn)
        .await?
    } else {
        sqlx::query(
            "UPDATE session_documents
             SET body = ?, body_format = 'prosemirror_json', updated_at = ?,
               generation_metadata_json = json_set(
                 CASE
                   WHEN json_valid(generation_metadata_json)
                   THEN generation_metadata_json
                   ELSE '{}'
                 END,
                 '$.generatedAt', ?,
                 '$.sourceNoteFingerprint', ?,
                 '$.notePassages', json(?)
               )
             WHERE id = ?
               AND session_id = ?
               AND kind IN ('summary', 'template_output')
               AND body = ?
               AND body_format = ?
               AND deleted_at IS NULL
               AND EXISTS (
                 SELECT 1 FROM sessions
                 WHERE sessions.id = ? AND sessions.deleted_at IS NULL
               )",
        )
        .bind(next_body)
        .bind(updated_at)
        .bind(updated_at)
        .bind(source_note_fingerprint)
        .bind(note_passages_json)
        .bind(note_id)
        .bind(session_id)
        .bind(current_body)
        .bind(current_body_format)
        .bind(session_id)
        .execute(&mut *conn)
        .await?
    };

    Ok(result.rows_affected())
}

pub async fn delete_pending_auto_enhance(
    conn: &mut SqliteConnection,
    pending_setting_id: &str,
    note_id: &str,
    current_body: &str,
    pending_auto_enhance: Option<&PendingAutoEnhanceMatch<'_>>,
) -> Result<u64, sqlx::Error> {
    let result = if let Some(pending) = pending_auto_enhance {
        sqlx::query(
            "DELETE FROM app_settings
             WHERE id = ?
               AND json_valid(value_json)
               AND json_extract(value_json, '$.noteId') = ?
               AND json_extract(value_json, '$.generation') = ?
               AND json_extract(value_json, '$.body') = ?
               AND json_extract(value_json, '$.bodyFormat') = ?",
        )
        .bind(pending_setting_id)
        .bind(note_id)
        .bind(pending.generation)
        .bind(pending.expected_body)
        .bind(pending.expected_body_format)
        .execute(&mut *conn)
        .await?
    } else {
        sqlx::query(
            "DELETE FROM app_settings
             WHERE id = ?
               AND json_valid(value_json)
               AND json_extract(
                 CASE
                   WHEN json_valid(value_json) THEN value_json
                   ELSE '{}'
                 END,
                 '$.noteId'
               ) = ?
               AND json_extract(
                 CASE
                   WHEN json_valid(value_json) THEN value_json
                   ELSE '{}'
                 END,
                 '$.body'
               ) = ?",
        )
        .bind(pending_setting_id)
        .bind(note_id)
        .bind(current_body)
        .execute(&mut *conn)
        .await?
    };

    Ok(result.rows_affected())
}

pub async fn upsert_tag(
    conn: &mut SqliteConnection,
    owner_user_id: &str,
    tag_name: &str,
    timestamp: &str,
) -> Result<u64, sqlx::Error> {
    let tag = sqlx::query(
        "INSERT INTO tags (
            id, owner_user_id, name, created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           owner_user_id = excluded.owner_user_id,
           name = excluded.name,
           updated_at = excluded.updated_at,
           deleted_at = NULL",
    )
    .bind(tag_name)
    .bind(owner_user_id)
    .bind(tag_name)
    .bind(timestamp)
    .bind(timestamp)
    .execute(&mut *conn)
    .await?;

    Ok(tag.rows_affected())
}

pub async fn upsert_session_tag(
    conn: &mut SqliteConnection,
    session_id: &str,
    owner_user_id: &str,
    tag_name: &str,
    timestamp: &str,
) -> Result<u64, sqlx::Error> {
    let session_tag_id = format!("{session_id}:{tag_name}");
    let session_tag = sqlx::query(
        "INSERT INTO session_tags (
            id, owner_user_id, session_id, tag_id,
            created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           owner_user_id = excluded.owner_user_id,
           session_id = excluded.session_id,
           tag_id = excluded.tag_id,
           updated_at = excluded.updated_at,
           deleted_at = NULL",
    )
    .bind(session_tag_id)
    .bind(owner_user_id)
    .bind(session_id)
    .bind(tag_name)
    .bind(timestamp)
    .bind(timestamp)
    .execute(&mut *conn)
    .await?;

    Ok(session_tag.rows_affected())
}
