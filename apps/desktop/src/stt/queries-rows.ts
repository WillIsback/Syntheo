import type {
  LiveTranscriptDelta,
  RenderTranscriptHuman,
} from "@syntheo/plugin-transcription";

import { executeTransaction, liveQueryClient } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";
import { coalesceLiveTranscriptDeltas } from "~/stt/transcript-delta-coalescing";
import type { SpeakerHintWithId, WordWithId } from "~/stt/types";
import { applyLiveTranscriptDelta } from "~/stt/utils";

export type TranscriptSqlRow = {
  id: string;
  owner_user_id: string;
  session_id: string;
  started_at_ms: number;
  ended_at_ms: number | null;
  words_json: string;
  speaker_hints_json: string;
  content_revision: number;
  pending_deltas_json: string;
};

export type TranscriptMetadataSqlRow = {
  id: string;
  session_id: string;
  started_at_ms: number;
  ended_at_ms: number | null;
  has_words: number;
};

export type ParticipantHumanSqlRow = { human_id: string };
export type HumanSqlRow = { id: string; name: string };
type TranscriptMutationSqlRow = {
  words_json: string;
  speaker_hints_json: string;
  content_revision: number;
  pending_deltas_json: string;
  max_read_sequence: number | null;
};

export type TranscriptInsert = {
  id: string;
  sessionId: string;
  ownerUserId: string;
  createdAt: string;
  startedAt: number;
  endedAt?: number;
  memo?: string;
  source?: string;
  provider?: string;
  model?: string;
  language?: string;
  words?: WordWithId[];
  speakerHints?: SpeakerHintWithId[];
  replaceSession?: boolean;
  replaceTranscriptId?: string;
};

export type TranscriptRecord = {
  id: string;
  ownerUserId: string;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  words: WordWithId[];
  speakerHints: SpeakerHintWithId[];
};

export type TranscriptMetadata = {
  id: string;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  hasWords: boolean;
};

export const EMPTY_TRANSCRIPTS: TranscriptRecord[] = [];
export const EMPTY_TRANSCRIPT_METADATA: TranscriptMetadata[] = [];
export const EMPTY_IDS: string[] = [];
export const EMPTY_HUMANS: RenderTranscriptHuman[] = [];

export const TRANSCRIPT_COLUMNS = `
  transcript.id,
  transcript.owner_user_id,
  transcript.session_id,
  transcript.started_at_ms,
  transcript.ended_at_ms,
  transcript.words_json,
  transcript.speaker_hints_json,
  transcript.content_revision,
  COALESCE((
    SELECT json_group_array(json(ordered_delta.delta_json))
    FROM (
      SELECT delta.delta_json
      FROM transcript_live_deltas AS delta
      WHERE delta.transcript_id = transcript.id
      ORDER BY delta.sequence
    ) AS ordered_delta
  ), '[]') AS pending_deltas_json
`;

export const TRANSCRIPT_BASE_COLUMNS = `
  transcript.id,
  transcript.owner_user_id,
  transcript.session_id,
  transcript.started_at_ms,
  transcript.ended_at_ms,
  transcript.words_json,
  transcript.speaker_hints_json,
  transcript.content_revision,
  '[]' AS pending_deltas_json
`;

export const TRANSCRIPT_METADATA_COLUMNS = `
  transcript.id,
  transcript.session_id,
  transcript.started_at_ms,
  transcript.ended_at_ms,
  CASE
    WHEN trim(transcript.words_json) NOT IN ('', '[]', '{}', 'null')
    THEN 1
    ELSE 0
  END AS has_words
`;

export const TRANSCRIPT_METADATA_WITH_PENDING_COLUMNS = `
  transcript.id,
  transcript.session_id,
  transcript.started_at_ms,
  transcript.ended_at_ms,
  CASE
    WHEN trim(transcript.words_json) NOT IN ('', '[]', '{}', 'null')
    OR EXISTS (
      SELECT 1
      FROM transcript_live_deltas AS delta
      WHERE delta.transcript_id = transcript.id
        AND json_valid(delta.delta_json)
        AND COALESCE(
          json_array_length(delta.delta_json, '$.new_words'),
          0
        ) > 0
    ) THEN 1
    ELSE 0
  END AS has_words
`;
export function mapTranscriptRow(row: TranscriptSqlRow): TranscriptRecord {
  const snapshot = materializeTranscriptSnapshot(
    row.words_json,
    row.speaker_hints_json,
    row.id,
    row.pending_deltas_json,
  );
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    sessionId: row.session_id,
    startedAt: Number(row.started_at_ms),
    endedAt: row.ended_at_ms === null ? undefined : Number(row.ended_at_ms),
    words: parseJsonArray(snapshot.wordsJson, row.id, "words"),
    speakerHints: parseJsonArray(snapshot.hintsJson, row.id, "speaker hints"),
  };
}

export function mapTranscriptMetadataRow(
  row: TranscriptMetadataSqlRow,
): TranscriptMetadata {
  return {
    id: row.id,
    sessionId: row.session_id,
    startedAt: Number(row.started_at_ms),
    endedAt: row.ended_at_ms === null ? undefined : Number(row.ended_at_ms),
    hasWords: row.has_words === 1,
  };
}

function parseJsonArray<T>(value: string, rowId: string, field: string): T[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch (error) {
    console.error(`[transcript] failed to parse ${field} for ${rowId}`, error);
  }

  return [];
}

export async function mutateTranscript(
  transcriptId: string,
  mutation?: (store: MemoryTranscriptStore) => boolean | void,
): Promise<void> {
  return enqueueDatabaseWrite(`transcript:${transcriptId}`, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rows = await liveQueryClient.execute<TranscriptMutationSqlRow>(
        `
          SELECT
            transcript.words_json,
            transcript.speaker_hints_json,
            transcript.content_revision,
            COALESCE((
              SELECT json_group_array(json(ordered_delta.delta_json))
              FROM (
                SELECT delta.delta_json
                FROM transcript_live_deltas AS delta
                WHERE delta.transcript_id = transcript.id
                ORDER BY delta.sequence
              ) AS ordered_delta
            ), '[]') AS pending_deltas_json,
            (
              SELECT MAX(delta.sequence)
              FROM transcript_live_deltas AS delta
              WHERE delta.transcript_id = transcript.id
            ) AS max_read_sequence
          FROM transcripts AS transcript
          WHERE transcript.id = ? AND transcript.deleted_at IS NULL
          LIMIT 1
        `,
        [transcriptId],
      );
      const current = rows[0];
      if (!current) {
        if (!mutation) return;
        throw new Error(`Transcript ${transcriptId} does not exist`);
      }

      assertJsonArray(current.words_json, transcriptId, "words");
      assertJsonArray(
        current.speaker_hints_json,
        transcriptId,
        "speaker hints",
      );
      const pendingDeltas = parseLiveTranscriptDeltas(
        current.pending_deltas_json,
        transcriptId,
      );
      const maxReadSequence =
        current.max_read_sequence == null
          ? null
          : Number(current.max_read_sequence);
      if (!mutation && pendingDeltas.length === 0) return;

      const materialized = materializeTranscriptSnapshot(
        current.words_json,
        current.speaker_hints_json,
        transcriptId,
        current.pending_deltas_json,
      );
      let shouldPersist = true;
      const next = mutation
        ? mutateTranscriptSnapshot(
            materialized.wordsJson,
            materialized.hintsJson,
            transcriptId,
            (store) => {
              shouldPersist = mutation(store) !== false;
            },
          )
        : materialized;
      if (!shouldPersist) return;
      const now = new Date().toISOString();
      const statements = [
        {
          sql: `
            UPDATE transcripts
            SET words_json = ?,
              speaker_hints_json = ?,
              content_revision = content_revision + 1,
              updated_at = ?
            WHERE id = ?
              AND content_revision = ?
              AND deleted_at IS NULL
          `,
          params: [
            next.wordsJson,
            next.hintsJson,
            now,
            transcriptId,
            Number(current.content_revision ?? 0),
          ],
        },
        ...(maxReadSequence == null
          ? []
          : [
              {
                sql: `
                  DELETE FROM transcript_live_deltas
                  WHERE transcript_id = ?
                    AND sequence <= ?
                    AND changes() = 1
                `,
                params: [transcriptId, maxReadSequence],
              },
            ]),
        {
          sql: `
            DELETE FROM transcript_live_state
            WHERE transcript_id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM transcript_live_deltas
                WHERE transcript_id = ?
              )
          `,
          params: [transcriptId, transcriptId],
        },
      ];
      const [updated = 0] = await executeTransaction(statements);

      if (updated === 1) return;
    }

    throw new Error(`Transcript ${transcriptId} changed too frequently`);
  });
}

function materializeTranscriptSnapshot(
  wordsJson: string,
  hintsJson: string,
  transcriptId: string,
  pendingDeltasJson: string,
) {
  const deltas = parseLiveTranscriptDeltas(pendingDeltasJson, transcriptId);
  if (deltas.length === 0) return { wordsJson, hintsJson };

  return mutateTranscriptSnapshot(wordsJson, hintsJson, transcriptId, (store) =>
    applyLiveTranscriptDelta(
      store,
      transcriptId,
      coalesceLiveTranscriptDeltas(deltas),
    ),
  );
}

function parseLiveTranscriptDeltas(
  value: string | undefined,
  transcriptId: string,
): LiveTranscriptDelta[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as LiveTranscriptDelta[];
  } catch (error) {
    console.error(
      `[transcript] failed to parse live deltas for ${transcriptId}`,
      error,
    );
  }
  return [];
}

type MemoryTranscriptStore = {
  getCell: (
    tableId: "transcripts",
    rowId: string,
    cellId: "words" | "speaker_hints",
  ) => string;
  setCell: (
    tableId: "transcripts",
    rowId: string,
    cellId: "words" | "speaker_hints",
    value: string,
  ) => void;
};

export function mutateTranscriptSnapshot(
  wordsJson: string,
  hintsJson: string,
  transcriptId: string,
  mutation: (store: MemoryTranscriptStore) => void,
) {
  const snapshot = { wordsJson, hintsJson };
  const store: MemoryTranscriptStore = {
    getCell: (_tableId, rowId, cellId) => {
      if (rowId !== transcriptId) return "[]";
      return cellId === "words" ? snapshot.wordsJson : snapshot.hintsJson;
    },
    setCell: (_tableId, rowId, cellId, value) => {
      if (rowId !== transcriptId) return;
      if (cellId === "words") {
        snapshot.wordsJson = value;
      } else {
        snapshot.hintsJson = value;
      }
    },
  };

  mutation(store);
  return snapshot;
}

function assertJsonArray(value: string, rowId: string, field: string): void {
  try {
    if (Array.isArray(JSON.parse(value))) return;
  } catch {
    // Report the same corruption error for malformed and non-array payloads.
  }

  throw new Error(`Transcript ${rowId} has invalid ${field} data`);
}

export function parseAssignedHumanId(value: unknown): string | undefined {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  if (!parsed || typeof parsed !== "object" || !("human_id" in parsed)) {
    return undefined;
  }

  const humanId = (parsed as { human_id?: unknown }).human_id;
  return typeof humanId === "string" ? humanId : undefined;
}
