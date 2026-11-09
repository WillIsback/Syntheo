// Requêtes propres à l'accueil. Volontairement indépendantes de la barre
// latérale (lot 3 : elle disparaît) : prénom et notes récentes avec leur
// durée d'écoute.
import { useMemo } from "react";

import { firstNameOf } from "./format";

import { usePersonalContact } from "~/contacts/queries";
import { useLiveQuery } from "~/db";
import { useOwnerUserId } from "~/shared/owner-user";
import { useUndoDelete } from "~/store/zustand/undo-delete";

export const RECENT_NOTES_LIMIT = 5;

// Prénom de l'utilisateur : nom du contact propriétaire (pas de clé de
// réglage dédiée). Chaîne vide si inconnu.
export function useOwnerFirstName(): string {
  const ownerId = useOwnerUserId() ?? "";
  const { data } = usePersonalContact(ownerId);
  return firstNameOf(data?.name);
}

export type RecentNote = {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
};

type RecentNoteSqlRow = {
  id: string;
  title: string | null;
  created_at: string | null;
  duration_ms: number | null;
};

export function mapRecentNoteRows(
  rows: readonly RecentNoteSqlRow[],
): RecentNote[] {
  return rows.map((row) => ({
    id: row.id,
    title: (row.title ?? "").trim(),
    createdAt: row.created_at ?? "",
    durationMs: Math.max(0, Number(row.duration_ms ?? 0)),
  }));
}

const EMPTY_NOTES: RecentNote[] = [];

// Notes récentes pour « Reprendre ». La durée est la somme des segments de
// transcription (début et fin en ms) de la note.
export function useRecentNotes(limit = RECENT_NOTES_LIMIT): RecentNote[] {
  // Marge pour masquer les suppressions en attente sans raccourcir la liste.
  const fetchLimit = limit + 5;
  const { data = EMPTY_NOTES } = useLiveQuery<RecentNoteSqlRow, RecentNote[]>({
    sql: `
        SELECT
          session.id,
          session.title,
          session.created_at,
          COALESCE((
            SELECT SUM(transcript.ended_at_ms - transcript.started_at_ms)
            FROM transcripts AS transcript
            WHERE transcript.session_id = session.id
              AND transcript.deleted_at IS NULL
              AND transcript.ended_at_ms > transcript.started_at_ms
          ), 0) AS duration_ms
        FROM sessions AS session
        WHERE session.deleted_at IS NULL
        ORDER BY session.created_at DESC, session.id
        LIMIT ?
      `,
    params: [fetchLimit],
    mapRows: mapRecentNoteRows,
  });
  const pendingDeletions = useUndoDelete((state) => state.pendingDeletions);

  return useMemo(
    () => data.filter((note) => !(note.id in pendingDeletions)).slice(0, limit),
    [data, pendingDeletions, limit],
  );
}
