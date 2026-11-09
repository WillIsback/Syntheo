import { type FolderSuggestion, suggestFolderAfterMeeting } from "./rule.ts";
import {
  mapSuggestionFolderTemplateRows,
  mapSuggestionNoteRows,
  SUGGESTION_FOLDER_TEMPLATES_SQL,
  SUGGESTION_NOTES_SQL,
  type SuggestionFolderTemplateSqlRow,
  type SuggestionNoteSqlRow,
} from "./sql.ts";

import { liveQueryClient } from "~/db";

// Lecture seule : calcule la suggestion d'une note non rangée, sans rien
// écrire. Aucune suggestion pour une note déjà rangée.
export async function loadFolderSuggestion(
  sessionId: string,
): Promise<FolderSuggestion | null> {
  const [noteRows, templateRows] = await Promise.all([
    liveQueryClient.execute<SuggestionNoteSqlRow>(SUGGESTION_NOTES_SQL, []),
    liveQueryClient.execute<SuggestionFolderTemplateSqlRow>(
      SUGGESTION_FOLDER_TEMPLATES_SQL,
      [],
    ),
  ]);
  const notes = mapSuggestionNoteRows(noteRows);
  const note = notes.find((candidate) => candidate.id === sessionId);
  if (!note || note.folderPath) return null;
  return suggestFolderAfterMeeting({
    note,
    filedNotes: notes,
    folderTemplates: mapSuggestionFolderTemplateRows(templateRows),
  });
}
