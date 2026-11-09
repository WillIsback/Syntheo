import { useMemo } from "react";

import { useLiveQuery } from "~/db";
import { useListener } from "~/stt/contexts";

// Notes proposées pour tester une automatisation : les plus récentes
// d'abord ; par défaut, la plus récente terminée (avec une transcription, et
// pas en cours d'enregistrement).

export type TestNote = {
  id: string;
  title: string;
  createdAt: string;
  hasTranscript: boolean;
};

type TestNoteSqlRow = {
  id: string;
  title: string | null;
  created_at: string | null;
  has_transcript: number | null;
};

const TEST_NOTES_LIMIT = 200;
const EMPTY_NOTES: TestNote[] = [];

export function mapTestNoteRows(rows: readonly TestNoteSqlRow[]): TestNote[] {
  return rows.map((row) => ({
    id: row.id,
    title: (row.title ?? "").trim(),
    createdAt: row.created_at ?? "",
    hasTranscript: Boolean(row.has_transcript),
  }));
}

/** Les notes récentes, sans celle qui est en cours d'enregistrement. */
export function useTestNotes(): TestNote[] {
  const { data = EMPTY_NOTES } = useLiveQuery<TestNoteSqlRow, TestNote[]>({
    sql: `
      SELECT
        session.id,
        session.title,
        session.created_at,
        EXISTS (
          SELECT 1
          FROM transcripts AS transcript
          WHERE transcript.session_id = session.id
            AND transcript.deleted_at IS NULL
        ) AS has_transcript
      FROM sessions AS session
      WHERE session.deleted_at IS NULL
      ORDER BY session.created_at DESC, session.id
      LIMIT ?
    `,
    params: [TEST_NOTES_LIMIT],
    mapRows: mapTestNoteRows,
  });
  const recordingId = useListener((state) =>
    state.live.status === "active" || state.live.status === "finalizing"
      ? state.live.sessionId
      : null,
  );
  return useMemo(
    () => data.filter((note) => note.id !== recordingId),
    [data, recordingId],
  );
}

/** La plus récente terminée, sinon la plus récente ; `null` sans note. */
export function defaultTestNoteId(notes: readonly TestNote[]): string | null {
  return (notes.find((note) => note.hasTranscript) ?? notes[0])?.id ?? null;
}

/** Recherche par titre, sans tenir compte des accents ni de la casse. */
export function filterTestNotes(
  notes: readonly TestNote[],
  query: string,
): TestNote[] {
  const needle = normalize(query);
  return needle
    ? notes.filter((note) => normalize(note.title).includes(needle))
    : [...notes];
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
