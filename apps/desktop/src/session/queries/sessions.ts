import { useCallback, useRef } from "react";

import { md2json } from "@syntheo/editor/markdown";

import { extractBodyHeadingsKey } from "../title-content";
import type {
  SessionChanges,
  SessionRecord,
  SessionSummaryRecord,
} from "./types";

import { executeTransaction, liveQueryClient, useLiveQuery } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";
import { isLockedFlag } from "~/lock/flag";

type SessionSqlRow = {
  id: string;
  owner_user_id: string;
  created_at: string;
  folder_path: string;
  welcome_note: string | null;
  title: string;
  raw_body: string;
  raw_body_format: string;
  raw_template_id: string;
  locked: boolean | number;
};

type SessionSummarySqlRow = {
  id: string;
  title: string;
  created_at: string;
};

type SessionTranscriptStateSqlRow = {
  has_transcript: boolean | number;
};

const EMPTY_SESSION_SUMMARIES: SessionSummaryRecord[] = [];

const SESSION_SELECT_SQL = `
  SELECT
    sessions.id,
    sessions.owner_user_id,
    sessions.created_at,
    sessions.folder_path,
    CASE
      WHEN json_valid(sessions.metadata_json)
        THEN CAST(json_extract(sessions.metadata_json, '$.welcome_note') AS TEXT)
    END AS welcome_note,
    sessions.title,
    sessions.locked,
    COALESCE(note.body, '') AS raw_body,
    COALESCE(note.body_format, 'prosemirror_json') AS raw_body_format,
    COALESCE(note.template_id, '') AS raw_template_id
  FROM sessions
  LEFT JOIN session_documents AS note
    ON note.id = sessions.id
    AND note.kind = 'note'
    AND note.deleted_at IS NULL
  WHERE sessions.id = ? AND sessions.deleted_at IS NULL
  LIMIT 1
`;

export function useSession(sessionId: string): SessionRecord | null {
  const { data } = useLiveQuery<SessionSqlRow, SessionRecord | null>({
    sql: SESSION_SELECT_SQL,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => {
      const row = rows[0];
      return row ? mapSessionRow(row) : null;
    },
  });
  if (!sessionId) return null;
  return data ?? null;
}

export function useSessionSummary(
  sessionId: string,
): SessionSummaryRecord | null {
  const { data = null } = useLiveQuery<
    SessionSummarySqlRow,
    SessionSummaryRecord | null
  >({
    sql: `
      SELECT id, title, created_at
      FROM sessions
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => rows[0] ?? null,
  });
  return sessionId ? data : null;
}

export function useSessionSummaries(): SessionSummaryRecord[] {
  const { data = EMPTY_SESSION_SUMMARIES } = useLiveQuery<
    SessionSummarySqlRow,
    SessionSummaryRecord[]
  >({
    sql: `
      SELECT id, title, created_at
      FROM sessions
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC, id
    `,
  });
  return data;
}

export function useSessionSummariesByIds(
  sessionIds: readonly string[],
): SessionSummaryRecord[] {
  const uniqueIds = [...new Set(sessionIds.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const enabled = uniqueIds.length > 0;
  const { data } = useLiveQuery<SessionSummarySqlRow, SessionSummaryRecord[]>({
    sql: `
      SELECT id, title, created_at
      FROM sessions
      WHERE id IN (${placeholders || "NULL"})
        AND deleted_at IS NULL
      ORDER BY id
    `,
    params: uniqueIds,
    enabled,
  });
  return useHeldLiveQueryRows(data, EMPTY_SESSION_SUMMARIES, enabled);
}

export function useUpdateSession(sessionId: string) {
  return useCallback(
    (changes: SessionChanges) => updateSession(sessionId, changes),
    [sessionId],
  );
}

export function useSessionTranscriptExistence(
  sessionId: string,
): boolean | null {
  const { data = null } = useLiveQuery<
    SessionTranscriptStateSqlRow,
    boolean | null
  >({
    sql: `
      SELECT EXISTS (
        SELECT 1
        FROM transcripts
        WHERE session_id = ?
          AND deleted_at IS NULL
          AND CASE
            WHEN json_valid(words_json) THEN json_array_length(words_json)
            ELSE 0
          END > 0
      ) AS has_transcript
    `,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => Boolean(rows[0]?.has_transcript),
  });
  return sessionId ? data : false;
}

export function useSessionHasTranscript(sessionId: string): boolean {
  return useSessionTranscriptExistence(sessionId) === true;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// A memo without a stored key predates heading tracking. Compare against the
// stored body: unchanged headings keep the note's previous write time so a
// newer template keeps authority, while a real heading edit stamps now. An
// unreadable or missing baseline stamps now, favoring the memo.
function previousHeadingsTime(
  row: { updated_at?: string; body?: string; body_format?: string } | undefined,
  headingsKey: string,
  now: string,
): string {
  if (row?.body === undefined) {
    return now;
  }
  const storedKey = extractBodyHeadingsKey(row.body, row.body_format);
  if (storedKey === null || storedKey !== headingsKey) {
    return now;
  }
  return row.updated_at ?? now;
}

type SqlStatement = { sql: string; params: unknown[] };

function buildSessionUpdateStatement(
  changes: SessionChanges,
  sessionId: string,
  now: string,
): SqlStatement | undefined {
  const assignments: string[] = [];
  const params: unknown[] = [];

  for (const [column, value] of [
    ["title", changes.title],
    ["created_at", changes.created_at],
    ["folder_path", changes.folder_id],
    [
      "locked",
      changes.locked === undefined ? undefined : Number(changes.locked),
    ],
  ] as const) {
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(value);
  }

  if (assignments.length === 0) return undefined;
  return {
    sql: `
      UPDATE sessions
      SET ${assignments.join(", ")}, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `,
    params: [...params, now, sessionId],
  };
}

type NoteDocumentRow = {
  generation_metadata_json: string;
  updated_at: string;
  body: string;
  body_format: string;
};

async function computeNoteMetadata(
  sessionId: string,
  changes: SessionChanges,
  rawMd: string,
  now: string,
): Promise<string | undefined> {
  const existing =
    (await liveQueryClient.execute<NoteDocumentRow>(
      `SELECT generation_metadata_json, updated_at, body, body_format FROM session_documents WHERE id = ? AND kind = 'note'`,
      [sessionId],
    )) ?? [];
  const metadata = parseJsonRecord(existing[0]?.generation_metadata_json);
  let changed = false;
  if (changes.raw_template_snapshot !== undefined) {
    metadata.appliedTemplate = changes.raw_template_snapshot;
    changed = true;
  }
  const headingsKey = extractBodyHeadingsKey(rawMd);
  if (headingsKey !== null) {
    const stored = metadata.headings as
      | { key?: unknown; updatedAt?: unknown }
      | undefined;
    if (stored?.key !== headingsKey) {
      metadata.headings = {
        key: headingsKey,
        updatedAt:
          stored?.key === undefined
            ? previousHeadingsTime(existing[0], headingsKey, now)
            : now,
      };
      changed = true;
    }
  }
  return changed ? JSON.stringify(metadata) : undefined;
}

function buildNoteUpsertStatement(
  sessionId: string,
  changes: SessionChanges,
  rawMd: string,
  now: string,
): SqlStatement {
  const hasTemplateChange = changes.raw_template_id !== undefined;
  return {
    sql: `
      INSERT INTO session_documents (
        id, workspace_id, session_id, kind, template_id, body_format, body,
        created_by, updated_by, created_at, updated_at, deleted_at
      )
      SELECT ?, workspace_id, id, 'note', ?, 'prosemirror_json', ?,
        owner_user_id, owner_user_id, ?, ?, NULL
      FROM sessions
      WHERE id = ? AND deleted_at IS NULL
      ON CONFLICT(id) DO UPDATE SET
        ${hasTemplateChange ? "template_id = excluded.template_id," : ""}
        body_format = excluded.body_format,
        body = excluded.body,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `,
    params: [
      sessionId,
      changes.raw_template_id ?? "",
      rawMd,
      now,
      now,
      sessionId,
    ],
  };
}

export function updateSession(
  sessionId: string,
  changes: SessionChanges,
): Promise<void> {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const now = new Date().toISOString();
    const statements: SqlStatement[] = [];

    const sessionUpdate = buildSessionUpdateStatement(changes, sessionId, now);
    if (sessionUpdate) statements.push(sessionUpdate);

    if (changes.raw_md !== undefined) {
      const noteMetadata = await computeNoteMetadata(
        sessionId,
        changes,
        changes.raw_md,
        now,
      );
      statements.push(
        buildNoteUpsertStatement(sessionId, changes, changes.raw_md, now),
      );
      if (noteMetadata !== undefined) {
        statements.push({
          sql: `UPDATE session_documents SET generation_metadata_json = ? WHERE id = ? AND kind = 'note'`,
          params: [noteMetadata, sessionId],
        });
      }
    }

    if (statements.length > 0) await executeTransaction(statements);
  });
}

function useHeldLiveQueryRows<T>(
  data: T[] | undefined,
  empty: T[],
  enabled: boolean,
): T[] {
  const previous = useRef(empty);
  if (data !== undefined) {
    previous.current = data;
  }
  if (!enabled) {
    previous.current = empty;
    return empty;
  }
  return data ?? previous.current;
}

function mapSessionRow(row: SessionSqlRow): SessionRecord {
  let rawMd = row.raw_body;
  if (rawMd && row.raw_body_format === "markdown") {
    try {
      rawMd = JSON.stringify(md2json(rawMd));
    } catch (error) {
      console.error("[session] failed to decode imported Markdown", error);
    }
  }

  return {
    id: row.id,
    user_id: row.owner_user_id,
    created_at: row.created_at,
    folder_id: row.folder_path,
    welcome_note: row.welcome_note ?? "",
    title: row.title,
    raw_md: rawMd,
    raw_template_id: row.raw_template_id,
    locked: isLockedFlag(row.locked),
  };
}
