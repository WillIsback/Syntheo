import type { LiveTranscriptDelta } from "@syntheo/plugin-transcription";

import type { SpeakerHintWithId, WordWithId } from "./types";

export function getProviderHintChannel(
  hint: SpeakerHintWithId,
  word: WordWithId | undefined,
) {
  const value = parseHintValue(hint.value);
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { channel?: unknown }).channel === "number"
  ) {
    return (value as { channel: number }).channel;
  }

  return word?.channel ?? 0;
}

export type SpeakerAssignmentScope =
  | {
      kind: "all";
      channel: number | null | undefined;
      speakerIndex: number | null;
    }
  | {
      kind: "words";
      wordIds: Set<string>;
    };

export function getSpeakerAssignmentScopeForHint(
  hints: SpeakerHintWithId[],
  wordsById: Map<string, WordWithId>,
  hint: SpeakerHintWithId,
): SpeakerAssignmentScope | null {
  const value = parseHintValue(hint.value);
  const explicitScope =
    value && typeof value === "object"
      ? (value as {
          scope?: unknown;
          channel?: unknown;
          speaker_index?: unknown;
        })
      : null;
  if (
    explicitScope?.scope === "speaker" &&
    (explicitScope.channel === 0 ||
      explicitScope.channel === 1 ||
      explicitScope.channel === 2)
  ) {
    const speakerIndex = explicitScope.speaker_index;
    if (speakerIndex === null || typeof speakerIndex === "number") {
      return {
        kind: "all",
        channel: explicitScope.channel,
        speakerIndex,
      };
    }
  }

  if (
    value &&
    typeof value === "object" &&
    (value as { scope?: unknown }).scope === "segment" &&
    Array.isArray((value as { word_ids?: unknown }).word_ids)
  ) {
    return {
      kind: "words",
      wordIds: new Set(
        (value as { word_ids: unknown[] }).word_ids.filter(
          (wordId): wordId is string =>
            typeof wordId === "string" && wordId.length > 0,
        ),
      ),
    };
  }

  const wordId = hint.word_id;
  if (typeof wordId !== "string") {
    return null;
  }

  const word = wordsById.get(wordId);
  if (!word) {
    return null;
  }

  return {
    kind: "all",
    channel: word.channel,
    speakerIndex: findSpeakerIndexForWord(hints, wordId),
  };
}

export function speakerAssignmentScopesConflict(
  left: SpeakerAssignmentScope,
  right: SpeakerAssignmentScope,
  hints: SpeakerHintWithId[],
  wordsById: Map<string, WordWithId>,
): boolean {
  if (right.kind === "words") {
    if (left.kind === "words") {
      return setsOverlap(left.wordIds, right.wordIds);
    }

    return false;
  }

  if (left.kind === "words") {
    for (const wordId of left.wordIds) {
      const word = wordsById.get(wordId);
      if (!word || word.channel !== right.channel) {
        continue;
      }

      const speakerIndex = findSpeakerIndexForWord(hints, wordId);
      if (right.speakerIndex == null || speakerIndex === right.speakerIndex) {
        return true;
      }
    }

    return false;
  }

  if (left.channel !== right.channel) {
    return false;
  }

  return (
    left.speakerIndex == null ||
    right.speakerIndex == null ||
    left.speakerIndex === right.speakerIndex
  );
}

export function findSpeakerIndexForWord(
  hints: SpeakerHintWithId[],
  wordId: string,
): number | null {
  for (let index = hints.length - 1; index >= 0; index -= 1) {
    const hint = hints[index];
    if (hint.type !== "provider_speaker_index" || hint.word_id !== wordId)
      continue;
    const value = parseHintValue(hint.value);
    if (
      value &&
      typeof value === "object" &&
      "speaker_index" in value &&
      typeof value.speaker_index === "number"
    ) {
      return value.speaker_index;
    }
  }
  return null;
}

export function parseHintValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  return value;
}

export function isSegmentSpeakerAssignmentHint(
  hint: SpeakerHintWithId,
): boolean {
  return getSegmentSpeakerAssignment(hint) !== null;
}

export function isSpeakerScopedAssignmentHint(
  hint: SpeakerHintWithId,
): boolean {
  if (
    hint.type !== "automatic_speaker_assignment" &&
    hint.type !== "user_speaker_assignment"
  ) {
    return false;
  }

  const value = parseHintValue(hint.value);
  if (!value || typeof value !== "object") {
    return false;
  }

  const scope = value as {
    scope?: unknown;
    channel?: unknown;
    speaker_index?: unknown;
  };
  return (
    scope.scope === "speaker" &&
    (scope.channel === 0 || scope.channel === 1 || scope.channel === 2) &&
    (scope.speaker_index === null || typeof scope.speaker_index === "number")
  );
}

export function getSegmentSpeakerAssignment(
  hint: SpeakerHintWithId,
): { value: Record<string, unknown>; wordIds: string[] } | null {
  if (hint.type !== "user_speaker_assignment") {
    return null;
  }

  const value = parseHintValue(hint.value);
  if (
    !value ||
    typeof value !== "object" ||
    (value as { scope?: unknown }).scope !== "segment" ||
    !Array.isArray((value as { word_ids?: unknown }).word_ids)
  ) {
    return null;
  }

  return {
    value: value as Record<string, unknown>,
    wordIds: getUniqueWordIds((value as { word_ids: unknown[] }).word_ids),
  };
}

export function getUniqueWordIds(wordIds: unknown[]): string[] {
  return Array.from(
    new Set(
      wordIds.filter(
        (wordId): wordId is string =>
          typeof wordId === "string" && wordId.length > 0,
      ),
    ),
  );
}

export function setsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }

  return false;
}

export function toStorageSpeakerHints(
  word: LiveTranscriptDelta["new_words"][number],
): SpeakerHintWithId[] {
  if (word.speaker_index == null) {
    return [];
  }

  return [
    {
      id: `${word.id}:provider_speaker_index`,
      word_id: word.id,
      type: "provider_speaker_index",
      value: JSON.stringify({
        channel: word.channel,
        speaker_index: word.speaker_index,
      }),
    },
  ];
}
