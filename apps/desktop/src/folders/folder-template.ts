// Modèle de compte rendu par défaut d'un dossier (issue 502), dans
// `folders.template_id` (voir
// crates/db-app/migrations/20261109190000_folder_template.sql). Seuls les
// modèles qui existent encore comptent : un modèle supprimé ne s'applique plus.

import { useMemo } from "react";

import { executeTransaction, liveQueryClient, useLiveQuery } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";
import { ensureFolderCatalog } from "~/session/folder-catalog";
import { nearestFolderTemplate } from "~/templates/resolution";

export type FolderTemplateAssignment = {
  folderPath: string;
  templateId: string;
};

type FolderTemplateSqlRow = { path: string; template_id: string };

const FOLDER_TEMPLATES_SQL = `
  SELECT folder.path, folder.template_id
  FROM folders AS folder
  JOIN templates AS template ON template.id = folder.template_id
  WHERE folder.deleted_at IS NULL
    AND folder.template_id <> ''
  ORDER BY folder.path
`;

const EMPTY_ASSIGNMENTS: FolderTemplateAssignment[] = [];

function mapRows(rows: FolderTemplateSqlRow[]): FolderTemplateAssignment[] {
  return rows.map((row) => ({
    folderPath: row.path,
    templateId: row.template_id,
  }));
}

function toFolderTemplateMap(
  assignments: readonly FolderTemplateAssignment[],
): Map<string, string> {
  return new Map(
    assignments.map((assignment) => [
      assignment.folderPath,
      assignment.templateId,
    ]),
  );
}

export function useFolderTemplateAssignments(): FolderTemplateAssignment[] {
  const { data = EMPTY_ASSIGNMENTS } = useLiveQuery<
    FolderTemplateSqlRow,
    FolderTemplateAssignment[]
  >({
    sql: FOLDER_TEMPLATES_SQL,
    params: [],
    mapRows,
  });
  return data;
}

// Modèle hérité par une note rangée dans `folderPath` : celui du dossier, ou
// du dossier parent le plus proche qui en a un.
export function useInheritedFolderTemplate(
  folderPath: string | null | undefined,
): { folderPath: string; templateId: string } | undefined {
  const assignments = useFolderTemplateAssignments();
  return useMemo(
    () => nearestFolderTemplate(folderPath, toFolderTemplateMap(assignments)),
    [assignments, folderPath],
  );
}

// Modèle propre au dossier (sans héritage), vide s'il n'en a pas.
export function useFolderTemplateId(folderPath: string): string {
  const assignments = useFolderTemplateAssignments();
  return (
    assignments.find((assignment) => assignment.folderPath === folderPath)
      ?.templateId ?? ""
  );
}

export async function loadSessionFolderTemplateId(
  sessionId: string,
): Promise<string | undefined> {
  const sessions = await liveQueryClient.execute<{ folder_path: string }>(
    `SELECT folder_path FROM sessions WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [sessionId],
  );
  const folderPath = sessions[0]?.folder_path ?? "";
  if (!folderPath) {
    return undefined;
  }
  const rows = await liveQueryClient.execute<FolderTemplateSqlRow>(
    FOLDER_TEMPLATES_SQL,
    [],
  );
  return nearestFolderTemplate(folderPath, toFolderTemplateMap(mapRows(rows)))
    ?.templateId;
}

export async function updateFolderTemplate(
  folderPath: string,
  templateId: string,
): Promise<void> {
  const path = await ensureFolderCatalog(folderPath);
  await enqueueDatabaseWrite("folders", async () => {
    await executeTransaction([
      {
        sql: `
          UPDATE folders
          SET template_id = ?, updated_at = ?
          WHERE path = ? AND deleted_at IS NULL
        `,
        params: [templateId, new Date().toISOString(), path],
      },
    ]);
  });
}
