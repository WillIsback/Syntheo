import type { LiveTranscriptDelta } from "@syntheo/plugin-transcription";

import type { SpeakerHintWithId, WordWithId } from "./types";
import {
  findSpeakerIndexForWord,
  getSegmentSpeakerAssignment,
  getUniqueWordIds,
} from "./utils-hint-values";

const MAX_SEGMENT_GAP_MS = 3000;

export function reconcileSegmentSpeakerAssignmentHint({
  hint,
  replacedIds,
  previousWords,
  nextWords,
  hints,
  newFinalWords,
}: {
  hint: SpeakerHintWithId;
  replacedIds: Set<string>;
  previousWords: WordWithId[];
  nextWords: WordWithId[];
  hints: SpeakerHintWithId[];
  newFinalWords: LiveTranscriptDelta["new_words"];
}): SpeakerHintWithId[] {
  const segmentAssignment = getSegmentSpeakerAssignment(hint);
  if (!segmentAssignment) {
    return [hint];
  }

  const nextWordIds = getReconciledSegmentWordIds({
    segmentWordIds: segmentAssignment.wordIds,
    extendToAdjacent: segmentAssignment.value.extend_to_adjacent !== false,
    replacedIds,
    previousWords,
    nextWords,
    hints,
    newFinalWords,
  });
  const hintWordId = hint.word_id ?? "";
  const nextAnchorWordId = replacedIds.has(hintWordId)
    ? nextWordIds[0]
    : hintWordId;

  if (!nextAnchorWordId || nextWordIds.length === 0) {
    return [];
  }

  return [
    {
      ...hint,
      id: `${nextAnchorWordId}:user_speaker_assignment:segment`,
      word_id: nextAnchorWordId,
      value: JSON.stringify({
        ...segmentAssignment.value,
        word_ids: nextWordIds,
      }),
    },
  ];
}

function getReconciledSegmentWordIds({
  segmentWordIds,
  extendToAdjacent,
  replacedIds,
  previousWords,
  nextWords,
  hints,
  newFinalWords,
}: {
  segmentWordIds: string[];
  extendToAdjacent: boolean;
  replacedIds: Set<string>;
  previousWords: WordWithId[];
  nextWords: WordWithId[];
  hints: SpeakerHintWithId[];
  newFinalWords: LiveTranscriptDelta["new_words"];
}): string[] {
  const previousWordsById = new Map(
    previousWords.map((word) => [word.id, word]),
  );
  const nextWordsById = new Map(nextWords.map((word) => [word.id, word]));
  const newSpeakerIndexByWordId = new Map(
    newFinalWords.flatMap((word) =>
      typeof word.speaker_index === "number"
        ? [[word.id, word.speaker_index] as const]
        : [],
    ),
  );
  const scopedPreviousWords = segmentWordIds.flatMap((wordId) => {
    const word = previousWordsById.get(wordId);
    return word ? [word] : [];
  });
  const scopedNextWords = segmentWordIds.flatMap((wordId) => {
    const word = nextWordsById.get(wordId);
    return word ? [word] : [];
  });
  const anchorWord = scopedPreviousWords[0] ?? scopedNextWords[0];
  if (!anchorWord) {
    return [];
  }

  const segmentKey = getSpeakerSegmentKey(
    anchorWord,
    hints,
    newSpeakerIndexByWordId,
  );
  const seedWordIds = new Set(
    segmentWordIds.filter((wordId) => {
      return !replacedIds.has(wordId) && nextWordsById.has(wordId);
    }),
  );

  if (segmentWordIds.some((wordId) => replacedIds.has(wordId))) {
    const previousRange = getWordRange(scopedPreviousWords);
    for (const word of newFinalWords) {
      if (
        previousRange &&
        isSameSpeakerSegment(
          word,
          segmentKey,
          hints,
          newSpeakerIndexByWordId,
        ) &&
        (!extendToAdjacent || segmentKey.speakerIndex == null
          ? scopedPreviousWords.some(
              (previous) =>
                replacedIds.has(previous.id) &&
                Math.min(previous.end_ms ?? 0, word.end_ms) >
                  Math.max(previous.start_ms ?? 0, word.start_ms),
            )
          : isWithinSegmentRange(word, previousRange))
      ) {
        seedWordIds.add(word.id);
      }
    }
  }

  if (seedWordIds.size === 0) {
    return [];
  }
  if (!extendToAdjacent || segmentKey.speakerIndex == null) {
    return nextWords
      .filter((word) => seedWordIds.has(word.id))
      .map((word) => word.id);
  }

  const seedIndexes = nextWords.flatMap((word, index) =>
    seedWordIds.has(word.id) ? [index] : [],
  );
  if (seedIndexes.length === 0) {
    return [];
  }

  let startIndex = Math.min(...seedIndexes);
  let endIndex = Math.max(...seedIndexes);

  while (
    startIndex > 0 &&
    canMergeSegmentWords(
      nextWords[startIndex - 1],
      nextWords[startIndex],
      segmentKey,
      hints,
      newSpeakerIndexByWordId,
    )
  ) {
    startIndex -= 1;
  }

  while (
    endIndex < nextWords.length - 1 &&
    canMergeSegmentWords(
      nextWords[endIndex],
      nextWords[endIndex + 1],
      segmentKey,
      hints,
      newSpeakerIndexByWordId,
    )
  ) {
    endIndex += 1;
  }

  return getUniqueWordIds(
    nextWords
      .slice(startIndex, endIndex + 1)
      .filter((word) =>
        isSameSpeakerSegment(word, segmentKey, hints, newSpeakerIndexByWordId),
      )
      .map((word) => word.id),
  );
}

function getSpeakerSegmentKey(
  word: WordWithId,
  hints: SpeakerHintWithId[],
  newSpeakerIndexByWordId: Map<string, number>,
): { channel: number; speakerIndex: number | null } {
  return {
    channel: word.channel ?? 0,
    speakerIndex:
      newSpeakerIndexByWordId.get(word.id) ??
      findSpeakerIndexForWord(hints, word.id) ??
      null,
  };
}

function isSameSpeakerSegment(
  word: WordWithId,
  key: { channel: number; speakerIndex: number | null },
  hints: SpeakerHintWithId[],
  newSpeakerIndexByWordId: Map<string, number>,
): boolean {
  const wordKey = getSpeakerSegmentKey(word, hints, newSpeakerIndexByWordId);
  return (
    wordKey.channel === key.channel && wordKey.speakerIndex === key.speakerIndex
  );
}

function canMergeSegmentWords(
  left: WordWithId,
  right: WordWithId,
  key: { channel: number; speakerIndex: number | null },
  hints: SpeakerHintWithId[],
  newSpeakerIndexByWordId: Map<string, number>,
): boolean {
  return (
    isSameSpeakerSegment(left, key, hints, newSpeakerIndexByWordId) &&
    isSameSpeakerSegment(right, key, hints, newSpeakerIndexByWordId) &&
    (right.start_ms ?? 0) - (left.end_ms ?? 0) <= MAX_SEGMENT_GAP_MS
  );
}

function getWordRange(
  words: WordWithId[],
): { startMs: number; endMs: number } | null {
  if (words.length === 0) {
    return null;
  }

  return {
    startMs: Math.min(...words.map((word) => word.start_ms ?? 0)),
    endMs: Math.max(...words.map((word) => word.end_ms ?? 0)),
  };
}

function isWithinSegmentRange(
  word: WordWithId,
  range: { startMs: number; endMs: number },
): boolean {
  return (
    (word.start_ms ?? 0) <= range.endMs + MAX_SEGMENT_GAP_MS &&
    (word.end_ms ?? 0) >= range.startMs - MAX_SEGMENT_GAP_MS
  );
}
