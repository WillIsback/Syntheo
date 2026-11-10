import type { RenderTranscriptHuman } from "@syntheo/plugin-transcription";

import {
  EMPTY_HUMANS,
  EMPTY_IDS,
  EMPTY_TRANSCRIPTS,
  EMPTY_TRANSCRIPT_METADATA,
  type HumanSqlRow,
  type ParticipantHumanSqlRow,
  TRANSCRIPT_BASE_COLUMNS,
  TRANSCRIPT_COLUMNS,
  TRANSCRIPT_METADATA_COLUMNS,
  TRANSCRIPT_METADATA_WITH_PENDING_COLUMNS,
  type TranscriptMetadata,
  type TranscriptMetadataSqlRow,
  type TranscriptRecord,
  type TranscriptSqlRow,
  mapTranscriptMetadataRow,
  mapTranscriptRow,
} from "./queries-rows";

import { liveQueryClient, useLiveQuery } from "~/db";

export function useSessionTranscripts(sessionId: string): TranscriptRecord[] {
  const { data = EMPTY_TRANSCRIPTS } = useLiveQuery<
    TranscriptSqlRow,
    TranscriptRecord[]
  >({
    sql: `
      SELECT ${TRANSCRIPT_COLUMNS}
      FROM transcripts AS transcript
      WHERE transcript.session_id = ? AND transcript.deleted_at IS NULL
      ORDER BY transcript.started_at_ms, transcript.created_at, transcript.id
    `,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => rows.map(mapTranscriptRow),
  });
  return sessionId ? data : EMPTY_TRANSCRIPTS;
}

export function useTranscript(
  transcriptId: string,
  includePendingDeltas = true,
): TranscriptRecord | null {
  const { data = null } = useLiveQuery<
    TranscriptSqlRow,
    TranscriptRecord | null
  >({
    sql: `
      SELECT ${includePendingDeltas ? TRANSCRIPT_COLUMNS : TRANSCRIPT_BASE_COLUMNS}
      FROM transcripts AS transcript
      WHERE transcript.id = ? AND transcript.deleted_at IS NULL
      LIMIT 1
    `,
    params: [transcriptId],
    enabled: Boolean(transcriptId),
    mapRows: (rows) => (rows[0] ? mapTranscriptRow(rows[0]) : null),
  });
  return transcriptId ? data : null;
}

export function useSessionTranscriptMetadata(
  sessionId: string,
  includePendingDeltas = true,
): TranscriptMetadata[] {
  const { data = EMPTY_TRANSCRIPT_METADATA } = useLiveQuery<
    TranscriptMetadataSqlRow,
    TranscriptMetadata[]
  >({
    sql: `
      SELECT ${
        includePendingDeltas
          ? TRANSCRIPT_METADATA_WITH_PENDING_COLUMNS
          : TRANSCRIPT_METADATA_COLUMNS
      }
      FROM transcripts AS transcript
      WHERE transcript.session_id = ? AND transcript.deleted_at IS NULL
      ORDER BY transcript.started_at_ms, transcript.created_at, transcript.id
    `,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => rows.map(mapTranscriptMetadataRow),
  });
  return sessionId ? data : EMPTY_TRANSCRIPT_METADATA;
}

export function useTranscriptMetadata(
  transcriptId: string,
  includePendingDeltas = true,
): TranscriptMetadata | null {
  const { data = null } = useLiveQuery<
    TranscriptMetadataSqlRow,
    TranscriptMetadata | null
  >({
    sql: `
      SELECT ${
        includePendingDeltas
          ? TRANSCRIPT_METADATA_WITH_PENDING_COLUMNS
          : TRANSCRIPT_METADATA_COLUMNS
      }
      FROM transcripts AS transcript
      WHERE transcript.id = ? AND transcript.deleted_at IS NULL
      LIMIT 1
    `,
    params: [transcriptId],
    enabled: Boolean(transcriptId),
    mapRows: (rows) => (rows[0] ? mapTranscriptMetadataRow(rows[0]) : null),
  });
  return transcriptId ? data : null;
}

export async function getTranscriptRecord(
  transcriptId: string,
): Promise<TranscriptRecord | null> {
  if (!transcriptId) {
    return null;
  }

  const rows = await liveQueryClient.execute<TranscriptSqlRow>(
    `
      SELECT ${TRANSCRIPT_COLUMNS}
      FROM transcripts AS transcript
      WHERE transcript.id = ? AND transcript.deleted_at IS NULL
      LIMIT 1
    `,
    [transcriptId],
  );

  return rows[0] ? mapTranscriptRow(rows[0]) : null;
}

export async function getSessionTranscriptRecords(
  sessionId: string,
): Promise<TranscriptRecord[]> {
  const rows = await liveQueryClient.execute<TranscriptSqlRow>(
    `
      SELECT ${TRANSCRIPT_COLUMNS}
      FROM transcripts AS transcript
      WHERE transcript.session_id = ? AND transcript.deleted_at IS NULL
      ORDER BY transcript.started_at_ms, transcript.created_at, transcript.id
    `,
    [sessionId],
  );

  return rows.map(mapTranscriptRow);
}

// Drop excluded people and any contact that is the current user (or a
// calendar copy with the same email) so a 1:1 meeting still has one remote.
const SESSION_REMOTE_PARTICIPANT_IDS_SQL = `
      SELECT DISTINCT participant.human_id
      FROM session_participants AS participant
      LEFT JOIN humans AS human
        ON human.id = participant.human_id
        AND human.deleted_at IS NULL
      WHERE participant.session_id = ?
        AND participant.human_id <> ''
        AND participant.source <> 'excluded'
        AND participant.deleted_at IS NULL
        AND participant.human_id <> COALESCE((
          SELECT session.owner_user_id
          FROM sessions AS session
          WHERE session.id = participant.session_id
        ), '')
        AND (
          NULLIF(lower(COALESCE(NULLIF(human.email, ''), participant.email)), '') IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM sessions AS session
            LEFT JOIN humans AS self_human
              ON self_human.id = session.owner_user_id
              AND self_human.deleted_at IS NULL
            LEFT JOIN session_participants AS owner_participant
              ON owner_participant.session_id = session.id
              AND owner_participant.human_id = session.owner_user_id
              AND owner_participant.deleted_at IS NULL
            WHERE session.id = participant.session_id
              AND (
                (
                  (
                    NULLIF(lower(self_human.email), '') IS NOT NULL
                    AND lower(self_human.email) = lower(COALESCE(
                      NULLIF(human.email, ''),
                      participant.email
                    ))
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM json_each(CASE
                        WHEN json_valid(self_human.metadata_json)
                          AND json_type(self_human.metadata_json, '$.additionalEmails') = 'array'
                        THEN json_extract(self_human.metadata_json, '$.additionalEmails')
                        ELSE '[]'
                      END) AS self_additional_email
                      WHERE lower(self_additional_email.value) = lower(COALESCE(
                        NULLIF(human.email, ''),
                        participant.email
                      ))
                  )
                )
                OR (
                  NULLIF(lower(owner_participant.email), '') IS NOT NULL
                  AND lower(owner_participant.email) = lower(COALESCE(
                    NULLIF(human.email, ''),
                    participant.email
                  ))
                )
              )
          )
        )
      ORDER BY participant.human_id
    `;

export async function getSessionParticipantHumanIds(
  sessionId: string,
): Promise<string[]> {
  if (!sessionId) {
    return [];
  }

  const rows = await liveQueryClient.execute<ParticipantHumanSqlRow>(
    SESSION_REMOTE_PARTICIPANT_IDS_SQL,
    [sessionId],
  );
  return rows.map((row) => row.human_id).filter(Boolean);
}

export function useSessionParticipantHumanIds(sessionId: string): string[] {
  const { data = EMPTY_IDS } = useLiveQuery<ParticipantHumanSqlRow, string[]>({
    sql: SESSION_REMOTE_PARTICIPANT_IDS_SQL,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => rows.map((row) => row.human_id),
  });
  return sessionId ? data : EMPTY_IDS;
}

function getTranscriptHumansQuery(humanIds: readonly string[]) {
  const ids = [...new Set(humanIds.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const placeholders = ids.map(() => "?").join(", ");
  return {
    humanIds: ids,
    sql: `
      SELECT id, name
      FROM humans
      WHERE id IN (${placeholders || "NULL"})
        AND name <> ''
      ORDER BY id
    `,
  };
}

function mapTranscriptHumans(rows: HumanSqlRow[]): RenderTranscriptHuman[] {
  return rows.map((row) => ({ human_id: row.id, name: row.name }));
}

export async function getTranscriptHumans(
  humanIds: readonly string[],
): Promise<RenderTranscriptHuman[]> {
  const query = getTranscriptHumansQuery(humanIds);
  if (query.humanIds.length === 0) {
    return [];
  }

  const rows = await liveQueryClient.execute<HumanSqlRow>(
    query.sql,
    query.humanIds,
  );
  return mapTranscriptHumans(rows);
}

export function useTranscriptHumans(
  humanIds: readonly string[],
): RenderTranscriptHuman[] {
  const query = getTranscriptHumansQuery(humanIds);
  const { data = EMPTY_HUMANS } = useLiveQuery<
    HumanSqlRow,
    RenderTranscriptHuman[]
  >({
    sql: query.sql,
    params: query.humanIds,
    enabled: query.humanIds.length > 0,
    mapRows: mapTranscriptHumans,
  });
  return query.humanIds.length > 0 ? data : EMPTY_HUMANS;
}
