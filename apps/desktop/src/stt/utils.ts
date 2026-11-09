import type { LiveTranscriptDelta } from "@syntheo/plugin-transcription";

import type { SpeakerHintWithId, WordWithId } from "./types";
import {
  type TranscriptStore,
  createTranscriptAccumulator,
  parseTranscriptHints,
  parseTranscriptWords,
  updateTranscriptHints,
} from "./utils-accumulator";
import {
  type SpeakerAssignmentScope,
  findSpeakerIndexForWord,
  getProviderHintChannel,
  getSpeakerAssignmentScopeForHint,
  getUniqueWordIds,
  parseHintValue,
  setsOverlap,
  speakerAssignmentScopesConflict,
} from "./utils-hint-values";

import type { SegmentKey } from "~/stt/live-segment";

export {
  parseTranscriptWords,
  parseTranscriptHints,
  updateTranscriptWords,
  updateTranscriptHints,
  createTranscriptAccumulator,
  TranscriptAccumulator,
} from "./utils-accumulator";

export function applyLiveTranscriptDelta(
  store: TranscriptStore,
  transcriptId: string,
  delta: LiveTranscriptDelta,
): void {
  const accumulator = createTranscriptAccumulator(store, transcriptId);
  accumulator.applyLiveDelta(delta);
  accumulator.dispose();
}

export function upsertSpeakerAssignment(
  store: TranscriptStore,
  transcriptId: string,
  segmentKey: SegmentKey,
  humanId: string,
  anchorWordId: string,
  options: {
    mode?: "all" | "segment";
    wordIds?: string[];
    extendToAdjacent?: boolean;
  } = {},
): void {
  const hints = parseTranscriptHints(store, transcriptId);
  const words = parseTranscriptWords(store, transcriptId);
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const mode =
    options.mode === "segment" || !Number.isInteger(segmentKey.speaker_index)
      ? "segment"
      : "all";
  const assignmentWordIds =
    mode === "segment"
      ? getUniqueWordIds([...(options.wordIds ?? []), anchorWordId])
      : [];
  const channel =
    segmentKey.channel === "DirectMic"
      ? 0
      : segmentKey.channel === "RemoteParty"
        ? 1
        : 2;
  const nextScope: SpeakerAssignmentScope =
    mode === "segment"
      ? {
          kind: "words",
          wordIds: new Set(assignmentWordIds),
        }
      : {
          kind: "all",
          channel,
          speakerIndex:
            typeof segmentKey.speaker_index === "number"
              ? segmentKey.speaker_index
              : null,
        };

  const newHint: SpeakerHintWithId = {
    id:
      mode === "segment"
        ? `${anchorWordId}:user_speaker_assignment:segment`
        : `${anchorWordId}:user_speaker_assignment`,
    word_id: anchorWordId,
    type: "user_speaker_assignment",
    value: JSON.stringify(
      mode === "segment"
        ? {
            human_id: humanId,
            scope: "segment",
            word_ids: assignmentWordIds,
            ...(options.extendToAdjacent === false ||
            !Number.isInteger(segmentKey.speaker_index)
              ? { extend_to_adjacent: false }
              : {}),
          }
        : {
            human_id: humanId,
            scope: "speaker",
            channel,
            speaker_index: segmentKey.speaker_index ?? null,
          },
    ),
  };

  const speakerIndexes = new Map<string, number>();
  for (const hint of hints) {
    if (hint.type !== "provider_speaker_index" || !hint.word_id) continue;
    const value = parseHintValue(hint.value);
    if (
      !value ||
      typeof value !== "object" ||
      !("speaker_index" in value) ||
      typeof value.speaker_index !== "number"
    )
      continue;
    speakerIndexes.set(hint.word_id, value.speaker_index);
    const word = wordsById.get(hint.word_id);
    if (word)
      wordsById.set(word.id, {
        ...word,
        channel: getProviderHintChannel(hint, word),
      });
  }

  const nextHints = hints.flatMap((hint) => {
    if (
      hint.type !== "automatic_speaker_assignment" &&
      hint.type !== "user_speaker_assignment"
    ) {
      return [hint];
    }

    const hintScope = getSpeakerAssignmentScopeForHint(hints, wordsById, hint);
    if (hintScope?.kind === "words") {
      const remainingWordIds = [...hintScope.wordIds].filter((wordId) =>
        nextScope.kind === "words"
          ? !nextScope.wordIds.has(wordId)
          : wordsById.get(wordId)?.channel !== nextScope.channel ||
            (nextScope.speakerIndex != null &&
              speakerIndexes.get(wordId) !== nextScope.speakerIndex),
      );
      if (remainingWordIds.length === hintScope.wordIds.size) return [hint];
      const anchor = remainingWordIds[0];
      if (!anchor) return [];
      return [
        {
          ...hint,
          id: `${anchor}:${hint.type}:segment`,
          word_id: anchor,
          value: JSON.stringify({
            ...(parseHintValue(hint.value) as Record<string, unknown>),
            word_ids: remainingWordIds,
          }),
        },
      ];
    }

    if (hint.id === newHint.id) return [];
    return hintScope &&
      speakerAssignmentScopesConflict(hintScope, nextScope, hints, wordsById)
      ? []
      : [hint];
  });

  nextHints.push(newHint);
  updateTranscriptHints(store, transcriptId, nextHints);
}

export function findSpeakerAssignmentAnchorWordId(
  words: WordWithId[],
  hints: SpeakerHintWithId[],
  segmentKey: SegmentKey,
): string | undefined {
  const channel =
    segmentKey.channel === "DirectMic"
      ? 0
      : segmentKey.channel === "RemoteParty"
        ? 1
        : 2;
  const speakerIndex = segmentKey.speaker_index;

  return words.find(
    (word) =>
      word.channel === channel &&
      (typeof speakerIndex !== "number" ||
        findSpeakerIndexForWord(hints, word.id) === speakerIndex),
  )?.id;
}

export function mergeTranscriptSegmentAssignments(
  store: TranscriptStore,
  transcriptId: string,
  segmentKey: SegmentKey,
  wordIds: string[],
): void {
  const assignmentWordIds = getUniqueWordIds(wordIds);
  if (assignmentWordIds.length === 0) {
    return;
  }

  if (segmentKey.speaker_human_id) {
    upsertSpeakerAssignment(
      store,
      transcriptId,
      segmentKey,
      segmentKey.speaker_human_id,
      assignmentWordIds[0]!,
      { mode: "segment", wordIds: assignmentWordIds },
    );
    return;
  }

  if (typeof segmentKey.speaker_index === "number") {
    unifyProviderSpeakerIndex(
      store,
      transcriptId,
      assignmentWordIds,
      segmentKey.speaker_index,
    );
  }
}

function unifyProviderSpeakerIndex(
  store: TranscriptStore,
  transcriptId: string,
  wordIds: string[],
  speakerIndex: number,
): void {
  const wordIdSet = new Set(wordIds);
  const words = parseTranscriptWords(store, transcriptId);
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const hints = parseTranscriptHints(store, transcriptId);
  const nextHints: SpeakerHintWithId[] = [];
  const updatedProviderWordIds = new Set<string>();

  for (const hint of hints) {
    if (
      hint.type === "provider_speaker_index" &&
      typeof hint.word_id === "string" &&
      wordIdSet.has(hint.word_id)
    ) {
      nextHints.push({
        ...hint,
        value: JSON.stringify({
          channel: getProviderHintChannel(hint, wordsById.get(hint.word_id)),
          speaker_index: speakerIndex,
        }),
      });
      updatedProviderWordIds.add(hint.word_id);
      continue;
    }

    if (
      hint.type === "automatic_speaker_assignment" ||
      hint.type === "user_speaker_assignment"
    ) {
      const hintScope = getSpeakerAssignmentScopeForHint(
        hints,
        wordsById,
        hint,
      );
      if (hintScope?.kind === "all") {
        nextHints.push(hint);
        continue;
      }
      if (
        hintScope?.kind === "words" &&
        setsOverlap(hintScope.wordIds, wordIdSet)
      ) {
        continue;
      }
      if (typeof hint.word_id === "string" && wordIdSet.has(hint.word_id)) {
        continue;
      }
    }

    nextHints.push(hint);
  }

  for (const wordId of wordIds) {
    if (updatedProviderWordIds.has(wordId)) {
      continue;
    }
    const word = wordsById.get(wordId);
    if (!word) {
      continue;
    }
    nextHints.push({
      id: `${wordId}:provider_speaker_index`,
      word_id: wordId,
      type: "provider_speaker_index",
      value: JSON.stringify({
        channel: word.channel,
        speaker_index: speakerIndex,
      }),
    });
  }

  updateTranscriptHints(store, transcriptId, nextHints);
}
