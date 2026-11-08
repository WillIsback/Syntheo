import { create as mutate } from "mutative";
import type { StoreApi } from "zustand";

import type {
  LiveTranscriptDelta,
  LiveTranscriptSegment,
  LiveTranscriptSegmentDelta,
} from "@syntheo/plugin-transcription";

import type { LiveTranscriptBatch } from "./live-transcript-batch";

import type { RuntimeSpeakerHint, WordLike } from "~/stt/segment";

type WordsByChannel = Record<number, LiveTranscriptDelta["partials"][number][]>;
type LiveCaptionFinalWord = LiveTranscriptDelta["new_words"][number];
const LIVE_CAPTION_HISTORY_CHARACTERS = 2048;
const LIVE_CAPTION_HISTORY_WORDS = 2048;
// The database retains the complete transcript; UI/native previews only need recent context.
export const LIVE_TRANSCRIPT_PREVIEW_SEGMENT_LIMIT = 200;

export type BatchPersistCallback = (
  words: WordLike[],
  hints: RuntimeSpeakerHint[],
  options?: { mode?: "append" | "replace" },
) => void;

export type LiveTranscriptPersistCallback = (
  delta: LiveTranscriptDelta,
) => void;

export type OnStoppedCallback = (
  sessionId: string,
  details: {
    durationSeconds: number;
    stoppedAtMs?: number;
    chunkedAudio?: boolean;
    audioDeletionFailed?: boolean;
    audioPath: string | null;
    requestedLiveTranscription: boolean;
    liveTranscriptionActive: boolean;
    needsBatchRepair: boolean;
    // Arrêt dû à « Mettre en pause » : transcript enregistré, synthèse et fin
    // de réunion attendent « Terminer » (issue 353).
    paused?: boolean;
  },
) => void | Promise<void>;

export type TranscriptState = {
  liveSegments: LiveTranscriptSegment[];
  liveCaptionFinalWordsById: Record<string, LiveCaptionFinalWord>;
  liveCaptionText: string;
  partialWordsByChannel: WordsByChannel;
  partialHintsByChannel: Record<number, RuntimeSpeakerHint[]>;
  handlePersistBySession: Record<string, LiveTranscriptPersistCallback>;
  onStoppedBySession: Record<string, OnStoppedCallback>;
};

export type TranscriptActions = {
  setTranscriptPersist: (
    sessionId: string,
    callback?: LiveTranscriptPersistCallback,
  ) => void;
  setOnStopped: (sessionId: string, callback?: OnStoppedCallback) => void;
  handleTranscriptDelta: (
    sessionId: string,
    delta: LiveTranscriptDelta,
    options?: { updateLivePreview?: boolean },
  ) => void;
  handleTranscriptSegmentDelta: (delta: LiveTranscriptSegmentDelta) => void;
  // Applique un lot regroupé (`live-transcript-batch.ts`) en un seul `set` :
  // aperçu (sous-titres, partiels) et segments vivants. Ne persiste rien.
  applyLiveTranscriptBatch: (batch: LiveTranscriptBatch) => void;
  takeOnStopped: (sessionId: string) => OnStoppedCallback | undefined;
  resetTranscript: () => void;
};

const initialState: TranscriptState = {
  liveSegments: [],
  liveCaptionFinalWordsById: {},
  liveCaptionText: "",
  partialWordsByChannel: {},
  partialHintsByChannel: {},
  handlePersistBySession: {},
  onStoppedBySession: {},
};

export const createTranscriptSlice = <
  T extends TranscriptState & TranscriptActions,
>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): TranscriptState & TranscriptActions => ({
  ...initialState,
  setTranscriptPersist: (sessionId, callback) => {
    set((state) =>
      mutate(state, (draft) => {
        if (callback) {
          draft.handlePersistBySession[sessionId] = callback;
        } else {
          delete draft.handlePersistBySession[sessionId];
        }
      }),
    );
  },
  setOnStopped: (sessionId, callback) => {
    set((state) =>
      mutate(state, (draft) => {
        if (callback) {
          draft.onStoppedBySession[sessionId] = callback;
        } else {
          delete draft.onStoppedBySession[sessionId];
        }
      }),
    );
  },
  handleTranscriptDelta: (sessionId, delta, options) => {
    const state = get();
    const handlePersist = state.handlePersistBySession[sessionId];

    if (options?.updateLivePreview !== false) {
      const updates = getPreviewUpdates(state.partialWordsByChannel, [delta]);
      if (updates.length > 0) {
        set((state) =>
          mutate(state, (draft) => {
            updates.forEach((update) => applyPreviewUpdate(draft, update));
          }),
        );
      }
    }

    if (delta.new_words.length === 0 && delta.replaced_ids.length === 0) {
      return;
    }

    handlePersist?.(delta);
  },
  handleTranscriptSegmentDelta: (delta) => {
    if (delta.upserts.length === 0 && delta.removed_ids.length === 0) {
      return;
    }
    set((state) =>
      mutate(state, (draft) => {
        draft.liveSegments = applyLiveSegmentDelta(draft.liveSegments, delta);
      }),
    );
  },
  applyLiveTranscriptBatch: ({ previewDeltas, segmentDelta }) => {
    const updates = getPreviewUpdates(
      get().partialWordsByChannel,
      previewDeltas,
    );
    const hasSegmentChanges =
      segmentDelta !== null &&
      (segmentDelta.upserts.length > 0 || segmentDelta.removed_ids.length > 0);
    if (updates.length === 0 && !hasSegmentChanges) {
      return;
    }
    set((state) =>
      mutate(state, (draft) => {
        updates.forEach((update) => applyPreviewUpdate(draft, update));
        if (hasSegmentChanges) {
          draft.liveSegments = applyLiveSegmentDelta(
            draft.liveSegments,
            segmentDelta,
          );
        }
      }),
    );
  },
  takeOnStopped: (sessionId) => {
    const callback = get().onStoppedBySession[sessionId];
    set((state) =>
      mutate(state, (draft) => {
        delete draft.onStoppedBySession[sessionId];
        delete draft.handlePersistBySession[sessionId];
      }),
    );
    return callback;
  },
  resetTranscript: () => {
    set((state) =>
      mutate(state, (draft) => {
        draft.liveSegments = [];
        draft.liveCaptionFinalWordsById = {};
        draft.liveCaptionText = "";
        draft.partialWordsByChannel = {};
        draft.partialHintsByChannel = {};
      }),
    );
  },
});

type PreviewUpdate = {
  delta: LiveTranscriptDelta;
  wordsByChannel: WordsByChannel;
  hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
};

// Les deltas qui changent l'aperçu, dans l'ordre ; un delta dont les partiels
// sont identiques aux précédents (et sans mot final) ne change rien.
function getPreviewUpdates(
  currentPartials: WordsByChannel,
  deltas: readonly LiveTranscriptDelta[],
): PreviewUpdate[] {
  const updates: PreviewUpdate[] = [];
  let partials = currentPartials;
  for (const delta of deltas) {
    const { wordsByChannel, hintsByChannel } = groupPartialsByChannel(
      delta.partials,
    );
    if (
      delta.new_words.length > 0 ||
      delta.replaced_ids.length > 0 ||
      !partialWordsByChannelEqual(partials, wordsByChannel)
    ) {
      updates.push({ delta, wordsByChannel, hintsByChannel });
      partials = wordsByChannel;
    }
  }
  return updates;
}

function applyPreviewUpdate(
  draft: TranscriptState,
  { delta, wordsByChannel, hintsByChannel }: PreviewUpdate,
) {
  updateLiveCaptionFinalWords(draft.liveCaptionFinalWordsById, delta);
  draft.liveCaptionText = getCaptionTextFromDelta(
    delta,
    draft.liveCaptionFinalWordsById,
    draft.liveCaptionText,
  );
  draft.partialWordsByChannel = wordsByChannel;
  draft.partialHintsByChannel = hintsByChannel;
}

function groupPartialsByChannel(partials: LiveTranscriptDelta["partials"]): {
  wordsByChannel: WordsByChannel;
  hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
} {
  const wordsByChannel: WordsByChannel = {};
  const hintsByChannel: Record<number, RuntimeSpeakerHint[]> = {};

  partials.forEach((word) => {
    const channel = word.channel;
    const channelWords = wordsByChannel[channel] ?? [];
    if (!(channel in wordsByChannel)) {
      wordsByChannel[channel] = channelWords;
      hintsByChannel[channel] = [];
    }

    const channelIndex = channelWords.length;
    channelWords.push(word);

    if (word.speaker_index != null) {
      hintsByChannel[channel]!.push({
        wordIndex: channelIndex,
        data: {
          type: "provider_speaker_index",
          speaker_index: word.speaker_index,
          channel,
        },
      });
    }
  });

  return { wordsByChannel, hintsByChannel };
}

function partialWordsByChannelEqual(
  left: WordsByChannel,
  right: WordsByChannel,
): boolean {
  const leftChannels = Object.keys(left);
  const rightChannels = Object.keys(right);
  if (leftChannels.length !== rightChannels.length) {
    return false;
  }

  return leftChannels.every((channelKey) => {
    const channel = Number(channelKey);
    const leftWords = left[channel] ?? [];
    const rightWords = right[channel] ?? [];
    return (
      leftWords.length === rightWords.length &&
      leftWords.every((word, index) => {
        const other = rightWords[index];
        return (
          other !== undefined &&
          word.text === other.text &&
          word.start_ms === other.start_ms &&
          word.end_ms === other.end_ms &&
          word.channel === other.channel &&
          word.speaker_index === other.speaker_index
        );
      })
    );
  });
}

function getCaptionTextFromDelta(
  delta: LiveTranscriptDelta,
  finalWordsById: Record<string, LiveCaptionFinalWord>,
  currentCaptionText: string,
): string {
  const finalWords = Object.values(finalWordsById);

  if (delta.partials.length > 0) {
    return trimLiveCaptionHistory(
      wordsToText([...finalWords, ...delta.partials]),
    );
  }

  if (finalWords.length > 0) {
    return trimLiveCaptionHistory(wordsToText(finalWords));
  }

  return currentCaptionText;
}

function updateLiveCaptionFinalWords(
  finalWordsById: Record<string, LiveCaptionFinalWord>,
  delta: LiveTranscriptDelta,
) {
  for (const replacedId of delta.replaced_ids) {
    delete finalWordsById[replacedId];
  }

  for (const word of delta.new_words) {
    const text = trimLiveCaptionHistory(word.text);
    finalWordsById[word.id] = text === word.text ? word : { ...word, text };
  }

  const newestWords = Object.values(finalWordsById).sort(
    (a, b) => b.start_ms - a.start_ms,
  );
  let retainedCharacters = 0;

  for (const [index, word] of newestWords.entries()) {
    retainedCharacters += word.text.length;
    if (
      index >= LIVE_CAPTION_HISTORY_WORDS ||
      (retainedCharacters > LIVE_CAPTION_HISTORY_CHARACTERS && index > 0)
    ) {
      delete finalWordsById[word.id];
    }
  }
}

function wordsToText(words: Array<{ text: string; start_ms: number }>): string {
  return words
    .slice()
    .sort((a, b) => a.start_ms - b.start_ms)
    .map((word) => word.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function trimLiveCaptionHistory(text: string): string {
  if (text.length <= LIVE_CAPTION_HISTORY_CHARACTERS) {
    return text;
  }

  let start = text.length - LIVE_CAPTION_HISTORY_CHARACTERS;
  const firstCodeUnit = text.charCodeAt(start);
  const previousCodeUnit = text.charCodeAt(start - 1);
  if (
    firstCodeUnit >= 0xdc00 &&
    firstCodeUnit <= 0xdfff &&
    previousCodeUnit >= 0xd800 &&
    previousCodeUnit <= 0xdbff
  ) {
    start += 1;
  }

  return text.slice(start);
}

function applyLiveSegmentDelta(
  segments: LiveTranscriptSegment[],
  delta: LiveTranscriptSegmentDelta,
): LiveTranscriptSegment[] {
  const changedIds = new Set([
    ...delta.removed_ids,
    ...delta.upserts.map((segment) => segment.id),
  ]);
  const nextSegments = segments.filter(
    (segment) => !changedIds.has(segment.id),
  );
  nextSegments.push(...delta.upserts);
  nextSegments.sort(
    (a, b) =>
      a.start_ms - b.start_ms ||
      a.end_ms - b.end_ms ||
      a.id.localeCompare(b.id),
  );
  return nextSegments.slice(-LIVE_TRANSCRIPT_PREVIEW_SEGMENT_LIMIT);
}
