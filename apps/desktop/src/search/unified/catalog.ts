import { useMemo } from "react";

import { buildSearchFolders } from "./rank";
import type { SearchCatalog, SearchContact, SearchNote } from "./types";

import { useHumans, useOrganizations } from "~/contacts/queries";
import { useLiveQuery } from "~/db";
import { normalizeFolderPath } from "~/session/folders";
import { useFolderPaths } from "~/session/queries/folders";
import { useUndoDelete } from "~/store/zustand/undo-delete";

type SearchNoteSqlRow = {
  id: string;
  title: string | null;
  created_at: string;
  folder_path: string | null;
};

const EMPTY_NOTES: SearchNote[] = [];

// Issue 799 : une réunion écrite par un autre processus (CLI, MCP) ne réveille
// pas les requêtes vives, qui ne voient que les écritures de l'application.
// Le moteur d'indexation de l'application, lui, traite cette réunion puis
// acquitte search_index_dirty : lire cette table (sous-requête évaluée une
// seule fois, valeur ignorée) fait relancer la requête à ce moment-là.
const SEARCH_NOTES_SQL = `
  SELECT
    id,
    title,
    created_at,
    folder_path,
    (SELECT 1 FROM search_index_dirty LIMIT 1) AS search_index_marker
  FROM sessions
  WHERE deleted_at IS NULL
  ORDER BY created_at DESC, id
`;

function mapSearchNoteRows(rows: SearchNoteSqlRow[]): SearchNote[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? "",
    createdAt: row.created_at,
    folderPath: normalizeFolderPath(row.folder_path ?? "") ?? "",
  }));
}

// Notes du plus récent au plus ancien, avec leur dossier ; une note en cours
// de suppression (annulable) disparaît tout de suite.
export function useSearchNotes(): SearchNote[] {
  const { data = EMPTY_NOTES } = useLiveQuery<SearchNoteSqlRow, SearchNote[]>({
    sql: SEARCH_NOTES_SQL,
    mapRows: mapSearchNoteRows,
  });
  const pendingDeletions = useUndoDelete((state) => state.pendingDeletions);
  return useMemo(
    () => data.filter((note) => !(note.id in pendingDeletions)),
    [data, pendingDeletions],
  );
}

/** Catalogue de la recherche : notes, dossiers et contacts (requêtes vives). */
export function useSearchCatalog(): SearchCatalog {
  const notes = useSearchNotes();
  const folderPaths = useFolderPaths();
  const humans = useHumans();
  const organizations = useOrganizations();

  const folders = useMemo(
    () => buildSearchFolders(folderPaths, notes),
    [folderPaths, notes],
  );
  const contacts = useMemo<SearchContact[]>(
    () => [
      ...humans.flatMap((human): SearchContact[] =>
        human.name ? [{ id: human.id, type: "human", name: human.name }] : [],
      ),
      ...organizations.flatMap((organization): SearchContact[] =>
        organization.name
          ? [
              {
                id: organization.id,
                type: "organization",
                name: organization.name,
              },
            ]
          : [],
      ),
    ],
    [humans, organizations],
  );

  return useMemo(
    () => ({ notes, folders, contacts }),
    [notes, folders, contacts],
  );
}
