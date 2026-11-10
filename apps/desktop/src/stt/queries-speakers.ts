import { mutateTranscript } from "./queries-rows";

import { liveQueryClient } from "~/db";
import type { SegmentKey } from "~/stt/live-segment";
import {
  buildRenderTranscriptRequestFromRows,
  resolveScopedWordHumanIds,
} from "~/stt/render-transcript";
import type { WordWithId } from "~/stt/types";
import {
  findSpeakerAssignmentAnchorWordId,
  parseTranscriptWords,
  parseTranscriptHints,
  updateTranscriptWords,
  mergeTranscriptSegmentAssignments,
  upsertSpeakerAssignment,
} from "~/stt/utils";

export function mergeTranscriptSegments({
  transcriptId,
  segmentKey,
  wordIds,
}: {
  transcriptId: string;
  segmentKey: SegmentKey;
  wordIds: string[];
}): Promise<void> {
  return mutateTranscript(transcriptId, (store) => {
    mergeTranscriptSegmentAssignments(store, transcriptId, segmentKey, wordIds);
  });
}

export function assignTranscriptSpeaker({
  transcriptId,
  segmentKey,
  humanId,
  anchorWordId,
  mode,
  wordIds,
  extendToAdjacent,
}: {
  transcriptId: string;
  segmentKey: SegmentKey;
  humanId: string;
  anchorWordId: string;
  mode?: "all" | "segment";
  wordIds?: string[];
  extendToAdjacent?: boolean;
}): Promise<void> {
  return assignSpeakerInTranscript({
    transcriptId,
    segmentKey,
    humanId,
    anchorWordId,
    mode,
    wordIds,
    extendToAdjacent,
  });
}

export async function assignSessionTranscriptSpeaker({
  sessionId,
  transcriptId,
  segmentKey,
  humanId,
  anchorWordId,
  wordIds,
}: {
  sessionId: string;
  transcriptId: string;
  segmentKey: SegmentKey;
  humanId: string;
  anchorWordId: string;
  wordIds?: string[];
}): Promise<void> {
  const transcripts = await liveQueryClient.execute<{ id: string }>(
    `
      SELECT id
      FROM transcripts
      WHERE session_id = ? AND deleted_at IS NULL
      ORDER BY started_at_ms, created_at, id
    `,
    [sessionId],
  );
  if (!transcripts.some((transcript) => transcript.id === transcriptId)) {
    throw new Error(
      `Transcript ${transcriptId} is no longer in session ${sessionId}`,
    );
  }

  await Promise.all(
    transcripts
      .filter(
        (transcript) =>
          transcript.id === transcriptId || segmentKey.speaker_human_id,
      )
      .map((transcript) =>
        transcript.id === transcriptId
          ? assignSpeakerInTranscript({
              transcriptId,
              segmentKey,
              humanId,
              anchorWordId,
              wordIds,
              mode: "all",
            })
          : mutateTranscript(transcript.id, (store) => {
              const input = buildRenderTranscriptRequestFromRows([
                {
                  words: parseTranscriptWords(store, transcript.id),
                  speaker_hints: parseTranscriptHints(store, transcript.id),
                },
              ])?.transcripts[0];
              if (!input) return false;
              const matchingWordIds = [...resolveScopedWordHumanIds(input)]
                .filter(
                  ([, assignedHumanId]) =>
                    assignedHumanId === segmentKey.speaker_human_id,
                )
                .map(([wordId]) => wordId);
              const anchor = matchingWordIds[0];
              if (!anchor) return false;
              upsertSpeakerAssignment(
                store,
                transcript.id,
                segmentKey,
                humanId,
                anchor,
                {
                  mode: "segment",
                  wordIds: matchingWordIds,
                  extendToAdjacent: false,
                },
              );
            }),
      ),
  );
}

async function assignSpeakerInTranscript({
  transcriptId,
  segmentKey,
  humanId,
  anchorWordId,
  mode,
  wordIds,
  extendToAdjacent,
}: {
  transcriptId: string;
  segmentKey: SegmentKey;
  humanId: string;
  anchorWordId?: string;
  mode?: "all" | "segment";
  wordIds?: string[];
  extendToAdjacent?: boolean;
}): Promise<void> {
  await mutateTranscript(transcriptId, (store) => {
    const resolvedAnchorWordId =
      anchorWordId ??
      findSpeakerAssignmentAnchorWordId(
        parseTranscriptWords(store, transcriptId),
        parseTranscriptHints(store, transcriptId),
        segmentKey,
      );
    if (!resolvedAnchorWordId) {
      return false;
    }

    upsertSpeakerAssignment(
      store,
      transcriptId,
      segmentKey,
      humanId,
      resolvedAnchorWordId,
      { mode, wordIds, extendToAdjacent },
    );
    return true;
  });
}

export function updateTranscriptSegmentText({
  transcriptId,
  wordIds,
  text,
}: {
  transcriptId: string;
  wordIds: string[];
  text: string;
}): Promise<void> {
  return mutateTranscript(transcriptId, (store) => {
    const selectedWordIds = new Set(wordIds);
    const words = parseTranscriptWords(store, transcriptId);
    const selectedWords = words.filter((word) => selectedWordIds.has(word.id));
    if (selectedWords.length === 0) {
      return;
    }

    const tokens = text.match(/\S+/g) ?? [];
    const textByWordId = new Map<string, string>();
    for (const [index, word] of selectedWords.entries()) {
      const isLastWord = index === selectedWords.length - 1;
      textByWordId.set(
        word.id,
        isLastWord ? tokens.slice(index).join(" ") : (tokens[index] ?? ""),
      );
    }

    updateTranscriptWords(
      store,
      transcriptId,
      words.map((word) => {
        const nextText = textByWordId.get(word.id);
        return nextText === undefined || nextText === word.text
          ? word
          : { ...word, text: nextText };
      }),
    );
  });
}

export function splitTranscriptSpeaker({
  transcriptId,
  segmentKey,
  wordIds,
  text,
  offset,
  humanId,
}: {
  transcriptId: string;
  segmentKey: SegmentKey;
  wordIds: string[];
  text: string;
  offset: number;
  humanId: string;
}): Promise<void> {
  const splitWordId = crypto.randomUUID();
  return mutateTranscript(transcriptId, (store) => {
    const words = parseTranscriptWords(store, transcriptId);
    const selectedIds = new Set(wordIds);
    const selected = words.filter((word) => selectedIds.has(word.id));
    const tokens = [...text.matchAll(/\S+/g)];
    if (!selected.length || !text.slice(offset).trim()) return false;

    const lastToken = tokens[tokens.length - 1];
    const textEnd = lastToken
      ? lastToken.index + lastToken[0].length
      : text.length;
    const replacements = new Map<string, WordWithId[]>();
    const followingIds: string[] = [];
    for (const [index, word] of selected.entries()) {
      const start = tokens[index]?.index ?? text.length;
      const end =
        index === selected.length - 1
          ? textEnd
          : start + (tokens[index]?.[0].length ?? 0);
      const nextText = text.slice(start, end).trim();
      if (offset > start && offset < end) {
        const before = text.slice(start, offset).trim();
        const after = text.slice(offset, end).trim();
        if (before && after) {
          const boundary =
            word.start_ms !== undefined && word.end_ms !== undefined
              ? word.start_ms +
                (word.end_ms - word.start_ms) *
                  ((offset - start) / (end - start))
              : undefined;
          replacements.set(word.id, [
            {
              ...word,
              text: before,
              ...(boundary === undefined ? {} : { end_ms: boundary }),
            },
            {
              ...word,
              id: splitWordId,
              text: after,
              ...(boundary === undefined ? {} : { start_ms: boundary }),
            },
          ]);
          followingIds.push(splitWordId);
          continue;
        }
      }
      replacements.set(word.id, [{ ...word, text: nextText }]);
      if (nextText && start >= offset) followingIds.push(word.id);
    }
    if (!followingIds.length) return false;
    updateTranscriptWords(
      store,
      transcriptId,
      words.flatMap((word) => replacements.get(word.id) ?? [word]),
    );
    upsertSpeakerAssignment(
      store,
      transcriptId,
      segmentKey,
      humanId,
      followingIds[0],
      {
        mode: "segment",
        wordIds: followingIds,
        extendToAdjacent: false,
      },
    );
  });
}
