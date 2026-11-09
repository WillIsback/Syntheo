// Stockage local du fil rouge d'un dossier (issue 496), dans `folder_threads`
// (version actuelle) et `folder_thread_versions` (versions remplacées), voir
// crates/db-app/migrations/20261109150000_folder_threads.sql. Une correction à
// la main ne réécrit que le corps ; une mise à jour par le modèle garde la
// version précédente dans l'historique.

import type { JSONContent } from "@syntheo/editor/markdown";

import { EMPTY_GENERATED_TEXTS, type GeneratedTexts } from "./thread-doc";

import { executeTransaction, useLiveQuery } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";
import { ensureFolderCatalog } from "~/session/folder-catalog";

export type FolderThreadRecord = {
  folderId: string;
  body: JSONContent | null;
  generated: GeneratedTexts;
  coveredSessionIds: string[];
  coveredUntil: string | null;
  version: number;
  generatedAt: string | null;
  editedAt: string | null;
};

type FolderThreadSqlRow = {
  folder_id: string;
  body: string;
  generated_json: string;
  covered_session_ids_json: string;
  covered_until: string;
  version: number;
  generated_at: string;
  edited_at: string;
};

// Versions remplacées gardées par dossier, comme pour les synthèses.
export const MAX_FOLDER_THREAD_VERSIONS = 20;

export const FOLDER_THREAD_SQL = `
  SELECT
    thread.folder_id,
    thread.body,
    thread.generated_json,
    thread.covered_session_ids_json,
    thread.covered_until,
    thread.version,
    thread.generated_at,
    thread.edited_at
  FROM folder_threads AS thread
  JOIN folders AS folder ON folder.id = thread.folder_id
  WHERE folder.path = ?
    AND folder.deleted_at IS NULL
    -- Une ligne qui ne porte que l'ordre du jour (issue 491) n'est pas un
    -- fil rouge.
    AND thread.generated_at <> ''
  LIMIT 1
`;

const FOLDER_ID_SQL = `
  SELECT id FROM folders WHERE path = ? AND deleted_at IS NULL LIMIT 1
`;

function parseJson(text: string): unknown {
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseGeneratedTexts(text: string): GeneratedTexts {
  const value = parseJson(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_GENERATED_TEXTS;
  }
  const record = value as Record<string, unknown>;
  return {
    status: stringList(record.status),
    decisions: stringList(record.decisions),
    openPoints: stringList(record.openPoints),
    tasks: stringList(record.tasks),
  };
}

function parseBody(text: string): JSONContent | null {
  const value = parseJson(text);
  return value &&
    typeof value === "object" &&
    (value as JSONContent).type === "doc"
    ? (value as JSONContent)
    : null;
}

export function mapFolderThreadRow(
  row: FolderThreadSqlRow,
): FolderThreadRecord {
  return {
    folderId: row.folder_id,
    body: parseBody(row.body),
    generated: parseGeneratedTexts(row.generated_json),
    coveredSessionIds: stringList(parseJson(row.covered_session_ids_json)),
    coveredUntil: row.covered_until || null,
    version: Number(row.version),
    generatedAt: row.generated_at || null,
    editedAt: row.edited_at || null,
  };
}

export function useFolderThread(folderPath: string): FolderThreadRecord | null {
  const { data = null } = useLiveQuery<
    FolderThreadSqlRow,
    FolderThreadRecord | null
  >({
    sql: FOLDER_THREAD_SQL,
    params: [folderPath],
    enabled: Boolean(folderPath),
    mapRows: (rows) => (rows[0] ? mapFolderThreadRow(rows[0]) : null),
  });
  return folderPath ? data : null;
}

function writeKey(folderPath: string) {
  return `folder-thread:${folderPath}`;
}

// Correction à la main (texte, tâche cochée) : seul le corps change. Les
// textes du modèle (`generated_json`) restent la référence qui distingue,
// à la prochaine mise à jour, ce que l'utilisateur a retouché.
export function saveFolderThreadEdit(
  folderPath: string,
  body: JSONContent,
): Promise<void> {
  return enqueueDatabaseWrite(writeKey(folderPath), async () => {
    const now = new Date().toISOString();
    await executeTransaction([
      {
        sql: `
          UPDATE folder_threads
          SET body = ?, edited_at = ?, updated_at = ?
          WHERE folder_id = (${FOLDER_ID_SQL})
        `,
        params: [JSON.stringify(body), now, now, folderPath],
      },
    ]);
  });
}

export type GeneratedFolderThread = {
  body: JSONContent;
  generated: GeneratedTexts;
  coveredSessionIds: string[];
  coveredUntil: string | null;
};

// Mise à jour par le modèle : la version actuelle passe dans l'historique,
// puis la nouvelle la remplace.
export async function saveGeneratedFolderThread(
  folderPath: string,
  next: GeneratedFolderThread,
): Promise<void> {
  const path = await ensureFolderCatalog(folderPath);
  await enqueueDatabaseWrite(writeKey(path), async () => {
    const now = new Date().toISOString();
    await executeTransaction([
      {
        sql: `
          INSERT INTO folder_thread_versions (
            id, folder_id, version, body, generated_json,
            covered_session_ids_json, covered_until, generated_at, edited_at,
            superseded_at
          )
          SELECT
            lower(hex(randomblob(16))),
            thread.folder_id,
            thread.version,
            thread.body,
            thread.generated_json,
            thread.covered_session_ids_json,
            thread.covered_until,
            thread.generated_at,
            thread.edited_at,
            ?
          FROM folder_threads AS thread
          WHERE thread.folder_id = (${FOLDER_ID_SQL})
            AND thread.body <> ''
        `,
        params: [now, path],
      },
      {
        sql: `
          DELETE FROM folder_thread_versions
          WHERE folder_id = (${FOLDER_ID_SQL})
            AND id NOT IN (
              SELECT id FROM folder_thread_versions
              WHERE folder_id = (${FOLDER_ID_SQL})
              ORDER BY version DESC
              LIMIT ?
            )
        `,
        params: [path, path, MAX_FOLDER_THREAD_VERSIONS],
      },
      {
        sql: `
          INSERT INTO folder_threads (
            folder_id, workspace_id, body, generated_json,
            covered_session_ids_json, covered_until, version, generated_at,
            edited_at, updated_at
          )
          SELECT id, workspace_id, ?, ?, ?, ?, 1, ?, '', ?
          FROM folders
          WHERE path = ? AND deleted_at IS NULL
          LIMIT 1
          ON CONFLICT(folder_id) DO UPDATE SET
            body = excluded.body,
            generated_json = excluded.generated_json,
            covered_session_ids_json = excluded.covered_session_ids_json,
            covered_until = excluded.covered_until,
            version = folder_threads.version + 1,
            generated_at = excluded.generated_at,
            edited_at = '',
            updated_at = excluded.updated_at
        `,
        params: [
          JSON.stringify(next.body),
          JSON.stringify(next.generated),
          JSON.stringify(next.coveredSessionIds),
          next.coveredUntil ?? "",
          now,
          now,
          path,
        ],
      },
    ]);
  });
}
