// Stockage local de l'ordre du jour de la prochaine réunion (issue 491) : les
// colonnes `agenda_*` de la ligne du dossier dans `folder_threads`, voir
// crates/db-app/migrations/20261109180000_folder_thread_agenda.sql. La ligne
// peut n'exister que pour l'ordre du jour ; elle est supprimée avec le
// dossier, comme le fil rouge.

import type { JSONContent } from "@syntheo/editor/markdown";

import { executeTransaction, liveQueryClient, useLiveQuery } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";
import { ensureFolderCatalog } from "~/session/folder-catalog";

export type FolderAgendaRecord = {
  folderId: string;
  body: JSONContent;
  generatedAt: string | null;
  editedAt: string | null;
};

type FolderAgendaSqlRow = {
  folder_id: string;
  agenda_body: string;
  agenda_generated_at: string;
  agenda_edited_at: string;
};

export const FOLDER_AGENDA_SQL = `
  SELECT
    thread.folder_id,
    thread.agenda_body,
    thread.agenda_generated_at,
    thread.agenda_edited_at
  FROM folder_threads AS thread
  JOIN folders AS folder ON folder.id = thread.folder_id
  WHERE folder.path = ?
    AND folder.deleted_at IS NULL
    AND thread.agenda_body <> ''
  LIMIT 1
`;

function parseBody(text: string): JSONContent | null {
  try {
    const value = JSON.parse(text) as JSONContent;
    return value && typeof value === "object" && value.type === "doc"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function mapFolderAgendaRow(
  row: FolderAgendaSqlRow,
): FolderAgendaRecord | null {
  const body = parseBody(row.agenda_body);
  return body
    ? {
        folderId: row.folder_id,
        body,
        generatedAt: row.agenda_generated_at || null,
        editedAt: row.agenda_edited_at || null,
      }
    : null;
}

export function useFolderAgenda(folderPath: string): FolderAgendaRecord | null {
  const { data = null } = useLiveQuery<
    FolderAgendaSqlRow,
    FolderAgendaRecord | null
  >({
    sql: FOLDER_AGENDA_SQL,
    params: [folderPath],
    enabled: Boolean(folderPath),
    mapRows: (rows) => (rows[0] ? mapFolderAgendaRow(rows[0]) : null),
  });
  return folderPath ? data : null;
}

export async function hasStoredFolderAgenda(
  folderPath: string,
): Promise<boolean> {
  const rows = await liveQueryClient.execute<FolderAgendaSqlRow>(
    FOLDER_AGENDA_SQL,
    [folderPath],
  );
  return rows.length > 0;
}

// Même clé que le fil rouge : les deux écrivent dans la même ligne.
function writeKey(folderPath: string) {
  return `folder-thread:${folderPath}`;
}

// Correction à la main : seul l'ordre du jour change.
export function saveFolderAgendaEdit(
  folderPath: string,
  body: JSONContent,
): Promise<void> {
  return enqueueDatabaseWrite(writeKey(folderPath), async () => {
    const now = new Date().toISOString();
    await executeTransaction([
      {
        sql: `
          UPDATE folder_threads
          SET agenda_body = ?, agenda_edited_at = ?, updated_at = ?
          WHERE folder_id = (
            SELECT id FROM folders WHERE path = ? AND deleted_at IS NULL LIMIT 1
          )
        `,
        params: [JSON.stringify(body), now, now, folderPath],
      },
    ]);
  });
}

// Nouvelle proposition du modèle : elle remplace l'ordre du jour, sans
// toucher au fil rouge de la même ligne.
export async function saveGeneratedFolderAgenda(
  folderPath: string,
  body: JSONContent,
): Promise<void> {
  const path = await ensureFolderCatalog(folderPath);
  await enqueueDatabaseWrite(writeKey(path), async () => {
    const now = new Date().toISOString();
    await executeTransaction([
      {
        sql: `
          INSERT INTO folder_threads (
            folder_id, workspace_id, agenda_body, agenda_generated_at,
            agenda_edited_at, updated_at
          )
          SELECT id, workspace_id, ?, ?, '', ?
          FROM folders
          WHERE path = ? AND deleted_at IS NULL
          LIMIT 1
          ON CONFLICT(folder_id) DO UPDATE SET
            agenda_body = excluded.agenda_body,
            agenda_generated_at = excluded.agenda_generated_at,
            agenda_edited_at = '',
            updated_at = excluded.updated_at
        `,
        params: [JSON.stringify(body), now, now, path],
      },
    ]);
  });
}
