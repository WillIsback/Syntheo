// Lectures de la règle de suggestion (issue 499), partagées par
// l'application et par `scripts/mesure-suggestion-dossier.mjs` : les deux
// voient exactement les mêmes notes, participants et modèles.

import type { SuggestionNote } from "./rule.ts";

// Notes actives avec leurs participants (hors propriétaire de la note et
// participants exclus) et le modèle choisi sur la note.
export const SUGGESTION_NOTES_SQL = `
  SELECT
    session.id,
    session.title,
    session.folder_path,
    session.created_at,
    COALESCE((
      SELECT json_group_array(DISTINCT participant.human_id)
      FROM session_participants AS participant
      WHERE participant.session_id = session.id
        AND participant.deleted_at IS NULL
        AND participant.human_id <> ''
        AND participant.human_id <> session.owner_user_id
        AND participant.source <> 'excluded'
    ), '[]') AS participant_ids_json,
    COALESCE((
      SELECT note.template_id
      FROM session_documents AS note
      WHERE note.session_id = session.id
        AND note.kind = 'note'
        AND note.deleted_at IS NULL
      ORDER BY note.id = session.id DESC, note.created_at, note.id
      LIMIT 1
    ), '') AS template_id
  FROM sessions AS session
  WHERE session.deleted_at IS NULL
`;

// Modèle par défaut propre à chaque dossier (issue 502), quand le modèle
// existe encore.
export const SUGGESTION_FOLDER_TEMPLATES_SQL = `
  SELECT folder.path, folder.template_id
  FROM folders AS folder
  JOIN templates AS template ON template.id = folder.template_id
  WHERE folder.deleted_at IS NULL
    AND folder.template_id <> ''
`;

export type SuggestionNoteSqlRow = {
  id: string;
  title: string;
  folder_path: string;
  created_at: string;
  participant_ids_json: string;
  template_id: string;
};

export type SuggestionFolderTemplateSqlRow = {
  path: string;
  template_id: string;
};

export function mapSuggestionNoteRows(
  rows: readonly SuggestionNoteSqlRow[],
): SuggestionNote[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    folderPath: row.folder_path,
    createdAt: row.created_at,
    participantIds: parseIds(row.participant_ids_json),
    templateId: row.template_id,
  }));
}

export function mapSuggestionFolderTemplateRows(
  rows: readonly SuggestionFolderTemplateSqlRow[],
): Map<string, string> {
  return new Map(rows.map((row) => [row.path, row.template_id]));
}

function parseIds(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string" && id !== "")
      : [];
  } catch {
    return [];
  }
}
