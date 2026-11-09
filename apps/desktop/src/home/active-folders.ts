// « Vos dossiers » sur l'accueil (issue 500) : les dossiers récemment actifs,
// avec leur nombre de réunions, la date de la dernière et l'état de leur fil
// rouge. Les comptes reprennent ceux de la recherche unifiée (sous-dossiers
// compris, comme la page du dossier).
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import type { JSONContent } from "@syntheo/editor/markdown";

import { useLiveQuery } from "~/db";
import {
  isEmptyThreadDoc,
  parseThread,
  type ThreadLabels,
} from "~/folders/project/thread-doc";
import { useSearchNotes } from "~/search/unified/catalog";
import { countNotesByFolder } from "~/search/unified/rank";
import type { SearchNote } from "~/search/unified/types";
import { resolvedFolderIcon } from "~/session/folder-icon";
import { folderDisplayName } from "~/session/folders";
import { useFolderIcons, useFolderPaths } from "~/session/queries";
import type { TemplateIcon } from "~/templates/template-icon";

export const HOME_FOLDERS_LIMIT = 6;

export type FolderThreadState = { openPoints: number; tasks: number };

export type HomeFolder = {
  path: string;
  name: string;
  icon: TemplateIcon;
  meetingCount: number;
  lastMeetingAt: string;
  // `null` : le fil rouge n'a pas encore été rédigé.
  thread: FolderThreadState | null;
};

export type FolderThreadBody = { folderPath: string; body: JSONContent | null };

// Points ouverts et tâches non cochées d'un fil rouge ; `null` s'il est vide.
export function folderThreadState(
  body: JSONContent | null,
  labels: ThreadLabels,
): FolderThreadState | null {
  if (!body || isEmptyThreadDoc(body)) return null;
  const parsed = parseThread(body, labels);
  return {
    openPoints: parsed.openPoints.filter((item) => !item.done).length,
    tasks: parsed.tasks.filter((item) => !item.done).length,
  };
}

function dateValue(iso: string): number {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

// Date de la réunion la plus récente de chaque dossier (sous-dossiers
// compris).
function lastMeetingByFolder(notes: readonly SearchNote[]) {
  const last = new Map<string, string>();
  for (const note of notes) {
    if (!note.folderPath) continue;
    let path = "";
    for (const segment of note.folderPath.split("/")) {
      path = path ? `${path}/${segment}` : segment;
      const current = last.get(path);
      if (!current || dateValue(note.createdAt) > dateValue(current)) {
        last.set(path, note.createdAt);
      }
    }
  }
  return last;
}

// Un dossier est candidat s'il contient lui-même au moins une note : un
// dossier parent qui ne sert qu'à regrouper ne double pas ses sous-dossiers.
// Ordre : dernière réunion la plus récente d'abord, puis le chemin.
export function selectActiveFolders({
  folderPaths,
  notes,
  threads,
  icons,
  labels,
  limit = HOME_FOLDERS_LIMIT,
}: {
  folderPaths: readonly string[];
  notes: readonly SearchNote[];
  threads: readonly FolderThreadBody[];
  icons: Record<string, TemplateIcon | undefined>;
  labels: ThreadLabels;
  limit?: number;
}): HomeFolder[] {
  const counts = countNotesByFolder(notes);
  const lastAt = lastMeetingByFolder(notes);
  const direct = new Set(notes.map((note) => note.folderPath));
  const bodies = new Map(threads.map((t) => [t.folderPath, t.body]));

  return folderPaths
    .filter((path) => path && direct.has(path))
    .map((path) => ({ path, lastMeetingAt: lastAt.get(path) ?? "" }))
    .sort(
      (a, b) =>
        dateValue(b.lastMeetingAt) - dateValue(a.lastMeetingAt) ||
        a.path.localeCompare(b.path, "fr"),
    )
    .slice(0, Math.max(0, limit))
    .map(({ path, lastMeetingAt }) => ({
      path,
      name: folderDisplayName(path) || path,
      icon: resolvedFolderIcon(path, icons),
      meetingCount: counts.get(path) ?? 0,
      lastMeetingAt,
      thread: folderThreadState(bodies.get(path) ?? null, labels),
    }));
}

type FolderThreadBodySqlRow = { folder_path: string; body: string | null };

export const HOME_FOLDER_THREADS_SQL = `
  SELECT folder.path AS folder_path, thread.body
  FROM folder_threads AS thread
  JOIN folders AS folder ON folder.id = thread.folder_id
  WHERE folder.deleted_at IS NULL
`;

function parseBody(text: string | null): JSONContent | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as JSONContent | null;
    return value && typeof value === "object" && value.type === "doc"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function mapFolderThreadBodyRows(
  rows: readonly FolderThreadBodySqlRow[],
): FolderThreadBody[] {
  return rows.map((row) => ({
    folderPath: row.folder_path,
    body: parseBody(row.body),
  }));
}

const EMPTY_THREADS: FolderThreadBody[] = [];

function useFolderThreadBodies(): FolderThreadBody[] {
  const { data = EMPTY_THREADS } = useLiveQuery<
    FolderThreadBodySqlRow,
    FolderThreadBody[]
  >({
    sql: HOME_FOLDER_THREADS_SQL,
    mapRows: mapFolderThreadBodyRows,
  });
  return data;
}

export function useActiveFolders(limit = HOME_FOLDERS_LIMIT): HomeFolder[] {
  const { t } = useLingui();
  const folderPaths = useFolderPaths();
  const notes = useSearchNotes();
  const threads = useFolderThreadBodies();
  const icons = useFolderIcons();
  // Mêmes intitulés que le fil rouge de la page du dossier.
  const labels = useMemo<ThreadLabels>(
    () => ({
      decisions: t`Decisions`,
      openPoints: t`Open points`,
      tasks: t`Open tasks`,
    }),
    [t],
  );

  return useMemo(
    () =>
      selectActiveFolders({
        folderPaths,
        notes,
        threads,
        icons,
        labels,
        limit,
      }),
    [folderPaths, notes, threads, icons, labels, limit],
  );
}
