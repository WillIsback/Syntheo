import type { LiveTranscriptDelta } from "@syntheo/plugin-transcription";

import type { RecoveryInterval } from "./capture-audio-recovery";
import {
  type TranscriptInsert,
  mutateTranscript,
  mutateTranscriptSnapshot,
  parseAssignedHumanId,
} from "./queries-rows";
import { selectRecoveredWords } from "./recovered-transcript";

import { executeTransaction, liveQueryClient } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";
import type { SpeakerHintWithId, WordWithId } from "~/stt/types";
import {
  applyLiveTranscriptDelta,
  createTranscriptAccumulator,
  parseTranscriptWords,
  parseTranscriptHints,
  updateTranscriptHints,
} from "~/stt/utils";

export { type TranscriptRecord, type TranscriptMetadata } from "./queries-rows";
export {
  useSessionTranscripts,
  useTranscript,
  useSessionTranscriptMetadata,
  useTranscriptMetadata,
  getTranscriptRecord,
  getSessionTranscriptRecords,
  getSessionParticipantHumanIds,
  useSessionParticipantHumanIds,
  getTranscriptHumans,
  useTranscriptHumans,
} from "./queries-read";
export {
  mergeTranscriptSegments,
  assignTranscriptSpeaker,
  assignSessionTranscriptSpeaker,
  updateTranscriptSegmentText,
  splitTranscriptSpeaker,
} from "./queries-speakers";

export function createTranscript(input: TranscriptInsert): Promise<void> {
  return enqueueDatabaseWrite(`transcript:${input.id}`, async () => {
    const now = new Date().toISOString();
    const statements: Array<{ sql: string; params: unknown[] }> = [];

    if (input.replaceSession) {
      statements.push({
        sql: `
          UPDATE transcripts
          SET deleted_at = ?, updated_at = ?
          WHERE session_id = ? AND deleted_at IS NULL
        `,
        params: [now, now, input.sessionId],
      });
    } else if (input.replaceTranscriptId) {
      statements.push({
        sql: `
          UPDATE transcripts
          SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND session_id = ? AND deleted_at IS NULL
        `,
        params: [now, now, input.replaceTranscriptId, input.sessionId],
      });
    }

    statements.push({
      sql: `
        INSERT INTO transcripts (
          id, workspace_id, owner_user_id, session_id, source, provider,
          model, language, started_at_ms, ended_at_ms, audio_attachment_id,
          memo, words_json, speaker_hints_json, metadata_json, created_at,
          updated_at, deleted_at
        )
        SELECT ?, session.workspace_id,
          COALESCE(NULLIF(?, ''), session.owner_user_id),
          session.id, ?, ?, ?, ?, ?, ?, '',
          ?, ?, ?, '{}', ?, ?, NULL
        FROM sessions AS session
        WHERE session.id = ? AND session.deleted_at IS NULL
      `,
      params: [
        input.id,
        input.ownerUserId,
        input.source ?? "",
        input.provider ?? "",
        input.model ?? "",
        input.language ?? "",
        input.startedAt,
        input.endedAt ?? null,
        input.memo ?? "",
        JSON.stringify(input.words ?? []),
        JSON.stringify(input.speakerHints ?? []),
        input.createdAt,
        now,
        input.sessionId,
      ],
    });

    await executeTransaction(statements);
  });
}

export function createLiveTranscript(
  input: Omit<TranscriptInsert, "words" | "speakerHints">,
  delta: LiveTranscriptDelta,
): Promise<void> {
  const snapshot = mutateTranscriptSnapshot("[]", "[]", input.id, (store) =>
    applyLiveTranscriptDelta(store, input.id, delta),
  );

  return createTranscript({
    ...input,
    words: JSON.parse(snapshot.wordsJson) as WordWithId[],
    speakerHints: JSON.parse(snapshot.hintsJson) as SpeakerHintWithId[],
  });
}

export async function transcriptExists(transcriptId: string): Promise<boolean> {
  const rows = await liveQueryClient.execute<{ id: string }>(
    `
      SELECT id
      FROM transcripts
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [transcriptId],
  );
  return Boolean(rows[0]);
}

export function flushLiveTranscriptDeltasToDatabase(
  transcriptId: string,
): Promise<void> {
  return mutateTranscript(transcriptId);
}

export function appendTranscriptWordsAndHints(
  transcriptId: string,
  words: WordWithId[],
  hints: SpeakerHintWithId[],
  options?: { mode?: "append" | "replace" },
): Promise<void> {
  return mutateTranscript(transcriptId, (store) => {
    const accumulator = createTranscriptAccumulator(store, transcriptId);
    accumulator.appendWordsAndHints(words, hints, options);
    accumulator.dispose();
  });
}

export function appendRecoveredTranscriptWords(
  transcriptId: string,
  words: WordWithId[],
  hints: SpeakerHintWithId[],
  intervals: RecoveryInterval[],
  beforeRepair: WordWithId[],
): Promise<void> {
  return mutateTranscript(transcriptId, (store) => {
    // Check both snapshots inside the normal revision-checked mutation: words
    // edited or deleted while the request ran must never be reintroduced.
    const additions = selectRecoveredWords(
      words,
      [...beforeRepair, ...parseTranscriptWords(store, transcriptId)],
      intervals,
    );
    if (!additions.length) return false;
    const ids = new Set(additions.map((word) => word.id));
    const accumulator = createTranscriptAccumulator(store, transcriptId);
    accumulator.appendWordsAndHints(
      additions,
      hints.filter((hint) => hint.word_id && ids.has(hint.word_id)),
    );
    accumulator.dispose();
  });
}

export function softDeleteTranscript(transcriptId: string): Promise<void> {
  return enqueueDatabaseWrite(`transcript:${transcriptId}`, async () => {
    const now = new Date().toISOString();
    await executeTransaction([
      {
        sql: `
          UPDATE transcripts
          SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL
        `,
        params: [now, now, transcriptId],
      },
    ]);
  });
}

export async function removeHumanSpeakerAssignments(
  sessionId: string,
  humanId: string,
): Promise<void> {
  const transcripts = await liveQueryClient.execute<{ id: string }>(
    `
      SELECT id
      FROM transcripts
      WHERE session_id = ? AND deleted_at IS NULL
      ORDER BY started_at_ms, created_at, id
    `,
    [sessionId],
  );

  await Promise.all(
    transcripts.map((transcript) =>
      mutateTranscript(transcript.id, (store) => {
        const hints = parseTranscriptHints(store, transcript.id);
        const filtered = hints.filter(
          (hint) =>
            (hint.type !== "automatic_speaker_assignment" &&
              hint.type !== "user_speaker_assignment") ||
            parseAssignedHumanId(hint.value) !== humanId,
        );
        if (filtered.length !== hints.length) {
          updateTranscriptHints(store, transcript.id, filtered);
        }
      }),
    ),
  );
}
