use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use crate::{
    ListSessions, SessionActionItemRow, SessionDocumentRow, SessionListItem, SessionParticipantRow,
    SessionProposalRow, SessionRow, SessionTranscriptRow,
};

pub const MAX_SESSION_LIST_LIMIT: u32 = 500;

const SESSION_LIST_COLUMNS: &str = "
    SELECT id, title, kind, status, created_at, updated_at, started_at, ended_at, series_id,
           folder_path
    FROM sessions
";

const SESSION_COLUMNS: &str = "
    SELECT id, workspace_id, owner_user_id, title, kind, status, created_at, updated_at,
           started_at, ended_at, timezone, language, external_event_id,
           external_provider, series_id, source_apps_json, folder_path, slug,
           metadata_json, locked
    FROM sessions
";

const SESSION_DOCUMENT_COLUMNS: &str = "
    SELECT document.id, document.workspace_id, document.session_id, document.kind,
           document.template_id, document.title, document.body_format, document.body,
           document.source_hash, document.generation_metadata_json, document.sort_order,
           document.created_by, document.updated_by, document.created_at, document.updated_at
    FROM session_documents AS document
    JOIN sessions AS session ON session.id = document.session_id AND session.deleted_at IS NULL
";

const SESSION_TRANSCRIPT_COLUMNS: &str = "
    SELECT transcript.id, transcript.workspace_id, transcript.owner_user_id,
           transcript.session_id, transcript.source, transcript.provider, transcript.model,
           transcript.language, transcript.started_at_ms, transcript.ended_at_ms,
           transcript.audio_attachment_id, transcript.memo, transcript.words_json,
           transcript.speaker_hints_json, transcript.metadata_json, transcript.created_at,
           transcript.updated_at
    FROM transcripts AS transcript
    JOIN sessions AS session ON session.id = transcript.session_id AND session.deleted_at IS NULL
";

const SESSION_PARTICIPANT_COLUMNS: &str = "
    SELECT participant.id, participant.workspace_id, participant.owner_user_id,
           participant.session_id, participant.human_id,
           COALESCE(NULLIF(human.name, ''), participant.display_name) AS display_name,
           COALESCE(NULLIF(human.email, ''), participant.email) AS email,
           participant.role, participant.source, COALESCE(human.job_title, '') AS job_title,
           COALESCE(human.organization_id, '') AS organization_id,
           COALESCE(organization.name, '') AS organization_name, participant.metadata_json,
           participant.created_at, participant.updated_at
    FROM session_participants AS participant
    JOIN sessions AS session ON session.id = participant.session_id AND session.deleted_at IS NULL
    LEFT JOIN humans AS human ON human.id = participant.human_id AND human.deleted_at IS NULL
    LEFT JOIN organizations AS organization
      ON organization.id = human.organization_id AND organization.deleted_at IS NULL
";

const SESSION_ACTION_ITEM_COLUMNS: &str = "
    SELECT action_item.id, action_item.workspace_id, action_item.session_id,
           action_item.source_type, action_item.source_id, action_item.source_order,
           action_item.assignee_human_id, action_item.status, action_item.text,
           action_item.body_json, action_item.due_at, action_item.completed_at,
           action_item.created_by, action_item.updated_by, action_item.metadata_json,
           action_item.created_at, action_item.updated_at
    FROM action_items AS action_item
    JOIN sessions AS session ON session.id = action_item.session_id AND session.deleted_at IS NULL
";

pub async fn list_sessions(
    pool: &SqlitePool,
    input: ListSessions<'_>,
) -> Result<Vec<SessionListItem>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_LIST_COLUMNS);
    query.push(" WHERE deleted_at IS NULL");

    if let Some(search) = input.query.map(str::trim).filter(|query| !query.is_empty()) {
        query.push(" AND (instr(lower(title), lower(");
        query.push_bind(search);
        query.push(")) > 0 OR instr(lower(id), lower(");
        query.push_bind(search);
        query.push(")) > 0)");
    }

    if let Some(series_id) = input.series_id {
        query.push(" AND series_id = ");
        query.push_bind(series_id);
    }

    if let Some(folder_path) = input.folder_path {
        query.push(" AND (folder_path = ");
        query.push_bind(folder_path);
        query.push(" OR (folder_path > ");
        query.push_bind(format!("{folder_path}/"));
        query.push(" AND folder_path < ");
        query.push_bind(format!("{folder_path}0"));
        query.push("))");
    }

    query.push(
        " ORDER BY COALESCE(NULLIF(started_at, ''), created_at) DESC, created_at DESC, id DESC",
    );
    query.push(" LIMIT ");
    query.push_bind(i64::from(input.limit.min(MAX_SESSION_LIST_LIMIT)));
    query.push(" OFFSET ");
    query.push_bind(i64::from(input.offset));

    query
        .build_query_as::<SessionListItem>()
        .fetch_all(pool)
        .await
}

pub async fn list_folder_paths(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT folder_path FROM sessions WHERE deleted_at IS NULL AND folder_path != ''
         UNION
         SELECT folder_path FROM folder_attachments WHERE deleted_at IS NULL AND folder_path != ''
         UNION
         SELECT path FROM folders WHERE deleted_at IS NULL AND path != ''
         ORDER BY 1",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_session(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Option<SessionRow>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_COLUMNS);
    query.push(" WHERE id = ");
    query.push_bind(session_id);
    query.push(" AND deleted_at IS NULL LIMIT 1");
    query
        .build_query_as::<SessionRow>()
        .fetch_optional(pool)
        .await
}

pub async fn list_session_documents(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Vec<SessionDocumentRow>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_DOCUMENT_COLUMNS);
    query.push(" WHERE document.session_id = ");
    query.push_bind(session_id);
    query.push(
        " AND document.deleted_at IS NULL
          ORDER BY document.sort_order, document.created_at, document.id",
    );
    query
        .build_query_as::<SessionDocumentRow>()
        .fetch_all(pool)
        .await
}

pub async fn get_session_note(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Option<SessionDocumentRow>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_DOCUMENT_COLUMNS);
    query.push(" WHERE document.session_id = ");
    query.push_bind(session_id);
    query.push(
        " AND document.kind = 'note' AND document.deleted_at IS NULL
          ORDER BY CASE WHEN document.id = ",
    );
    query.push_bind(session_id);
    query.push(" THEN 0 ELSE 1 END, document.created_at, document.id LIMIT 1");
    query
        .build_query_as::<SessionDocumentRow>()
        .fetch_optional(pool)
        .await
}

pub async fn list_session_transcripts(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Vec<SessionTranscriptRow>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_TRANSCRIPT_COLUMNS);
    query.push(" WHERE transcript.session_id = ");
    query.push_bind(session_id);
    query.push(
        " AND transcript.deleted_at IS NULL
          ORDER BY transcript.started_at_ms, transcript.created_at, transcript.id",
    );
    query
        .build_query_as::<SessionTranscriptRow>()
        .fetch_all(pool)
        .await
}

pub async fn list_session_participants(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Vec<SessionParticipantRow>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_PARTICIPANT_COLUMNS);
    query.push(" WHERE participant.session_id = ");
    query.push_bind(session_id);
    query.push(
        " AND participant.deleted_at IS NULL AND participant.source <> 'excluded'
          ORDER BY participant.created_at, participant.id",
    );
    query
        .build_query_as::<SessionParticipantRow>()
        .fetch_all(pool)
        .await
}

pub async fn list_session_action_items(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Vec<SessionActionItemRow>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_ACTION_ITEM_COLUMNS);
    query.push(" WHERE action_item.session_id = ");
    query.push_bind(session_id);
    query.push(
        " AND action_item.deleted_at IS NULL
          ORDER BY action_item.source_order, action_item.created_at, action_item.id",
    );
    query
        .build_query_as::<SessionActionItemRow>()
        .fetch_all(pool)
        .await
}

pub async fn list_recurring_sessions(
    pool: &SqlitePool,
    session_id: &str,
    limit: u32,
) -> Result<Vec<SessionListItem>, sqlx::Error> {
    let series_id: Option<String> = sqlx::query_scalar(
        "SELECT NULLIF(trim(series_id), '')
         FROM sessions
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?
    .flatten();

    let Some(series_id) = series_id else {
        return Ok(Vec::new());
    };

    list_sessions(
        pool,
        ListSessions {
            query: None,
            series_id: Some(&series_id),
            folder_path: None,
            limit,
            offset: 0,
        },
    )
    .await
}

const SESSION_PROPOSAL_COLUMNS: &str = "
    SELECT id, workspace_id, session_id, kind, target_id, base_updated_at,
           current_markdown, proposed_markdown, status, source, created_at, updated_at
    FROM session_proposals
";

pub struct InsertSessionProposal<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub session_id: &'a str,
    pub kind: &'a str,
    pub target_id: &'a str,
    pub base_updated_at: &'a str,
    pub current_markdown: &'a str,
    pub proposed_markdown: &'a str,
    pub source: &'a str,
}

pub async fn insert_session_proposal(
    pool: &SqlitePool,
    input: InsertSessionProposal<'_>,
) -> Result<SessionProposalRow, sqlx::Error> {
    sqlx::query(
        "INSERT INTO session_proposals (
            id, workspace_id, session_id, kind, target_id, base_updated_at,
            current_markdown, proposed_markdown, status, source
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
    )
    .bind(input.id)
    .bind(input.workspace_id)
    .bind(input.session_id)
    .bind(input.kind)
    .bind(input.target_id)
    .bind(input.base_updated_at)
    .bind(input.current_markdown)
    .bind(input.proposed_markdown)
    .bind(input.source)
    .execute(pool)
    .await?;

    get_session_proposal(pool, input.id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn get_session_proposal(
    pool: &SqlitePool,
    proposal_id: &str,
) -> Result<Option<SessionProposalRow>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_PROPOSAL_COLUMNS);
    query.push(" WHERE id = ");
    query.push_bind(proposal_id);
    query.push(" LIMIT 1");
    query
        .build_query_as::<SessionProposalRow>()
        .fetch_optional(pool)
        .await
}

pub async fn list_session_proposals(
    pool: &SqlitePool,
    session_id: Option<&str>,
    status: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<Vec<SessionProposalRow>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(SESSION_PROPOSAL_COLUMNS);
    query.push(" WHERE 1 = 1");
    if let Some(session_id) = session_id {
        query.push(" AND session_id = ");
        query.push_bind(session_id);
    }
    if let Some(status) = status {
        query.push(" AND status = ");
        query.push_bind(status);
    }
    query.push(" ORDER BY created_at DESC, id DESC LIMIT ");
    query.push_bind(i64::from(limit));
    query.push(" OFFSET ");
    query.push_bind(i64::from(offset));
    query
        .build_query_as::<SessionProposalRow>()
        .fetch_all(pool)
        .await
}

pub async fn update_session_proposal_status(
    pool: &SqlitePool,
    proposal_id: &str,
    expected_status: &str,
    next_status: &str,
) -> Result<Option<SessionProposalRow>, sqlx::Error> {
    let updated = sqlx::query(
        "UPDATE session_proposals
         SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND status = ?",
    )
    .bind(next_status)
    .bind(proposal_id)
    .bind(expected_status)
    .execute(pool)
    .await?
    .rows_affected();

    if updated == 0 {
        return get_session_proposal(pool, proposal_id).await;
    }
    get_session_proposal(pool, proposal_id).await
}

#[cfg(test)]
mod tests;
