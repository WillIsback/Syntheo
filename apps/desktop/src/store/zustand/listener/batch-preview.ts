import type { BatchStreamEvent } from "@syntheo/plugin-transcription";

import {
  getWordTimingSourceForBatchResponse,
  transformBatch,
  wordEntriesFromTranscript,
} from "./batch-transform";
import { transformWordEntries } from "./utils";

import { type RuntimeSpeakerHint, type WordLike } from "~/stt/segment";

export function batchPreviewResult(
  currentPreview: {
    wordsByChannel: Record<number, WordLike[]>;
    hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
  },
  event: BatchStreamEvent,
): {
  nextPreview: {
    wordsByChannel: Record<number, WordLike[]>;
    hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
  };
  words: WordLike[];
  hints: RuntimeSpeakerHint[];
  shouldPersist: boolean;
} {
  if (event.type === "result") {
    const [words, hints] = transformBatch(event.response);
    return {
      nextPreview: batchPreviewFromWords(words, hints),
      words,
      hints,
      shouldPersist: true,
    };
  }

  const nextPreview = mergeBatchPreview(currentPreview, event);
  const [words, hints] = flattenBatchPreview(nextPreview);

  return {
    nextPreview,
    words,
    hints,
    shouldPersist: event.type === "segment",
  };
}

function flattenBatchPreview(preview: {
  wordsByChannel: Record<number, WordLike[]>;
  hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
}): [WordLike[], RuntimeSpeakerHint[]] {
  const allWords: WordLike[] = [];
  const allHints: RuntimeSpeakerHint[] = [];
  let wordOffset = 0;

  Object.keys(preview.wordsByChannel)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((channel) => {
      const words = preview.wordsByChannel[channel] ?? [];
      const hints = preview.hintsByChannel[channel] ?? [];

      hints.forEach((hint) => {
        allHints.push({
          ...hint,
          wordIndex: hint.wordIndex + wordOffset,
        });
      });
      allWords.push(...words);
      wordOffset += words.length;
    });

  return [allWords, allHints];
}

function batchPreviewFromWords(
  words: WordLike[],
  hints: RuntimeSpeakerHint[],
): {
  wordsByChannel: Record<number, WordLike[]>;
  hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
} {
  const wordsByChannel: Record<number, WordLike[]> = {};
  const hintsByChannel: Record<number, RuntimeSpeakerHint[]> = {};
  const channelIndexByWordIndex = new Map<
    number,
    { channel: number; wordIndex: number }
  >();

  words.forEach((word, wordIndex) => {
    const channelWords = wordsByChannel[word.channel] ?? [];
    if (!(word.channel in wordsByChannel)) {
      wordsByChannel[word.channel] = channelWords;
      hintsByChannel[word.channel] = [];
    }

    channelIndexByWordIndex.set(wordIndex, {
      channel: word.channel,
      wordIndex: channelWords.length,
    });
    channelWords.push(word);
  });

  hints.forEach((hint) => {
    const target = channelIndexByWordIndex.get(hint.wordIndex);
    if (!target) {
      return;
    }

    hintsByChannel[target.channel]!.push({
      ...hint,
      wordIndex: target.wordIndex,
    });
  });

  return { wordsByChannel, hintsByChannel };
}

function mergeBatchPreview(
  preview: {
    wordsByChannel: Record<number, WordLike[]>;
    hintsByChannel: Record<number, RuntimeSpeakerHint[]>;
  },
  event: BatchStreamEvent,
) {
  if (event.type !== "segment") {
    return preview;
  }

  const response = event.response;
  if (response.type !== "Results") {
    return preview;
  }

  const channelIndex = response.channel_index[0];
  const alternative = response.channel.alternatives[0];
  if (channelIndex === undefined || !alternative) {
    return preview;
  }

  const timingSource = getWordTimingSourceForBatchResponse(
    response,
    Boolean(alternative.words?.length),
    "provider_segment_interpolated",
  );
  const wordEntries = wordEntriesFromTranscript(
    alternative.words,
    alternative.transcript,
    {
      channel: channelIndex,
      startSeconds: response.start,
      durationSeconds: response.duration,
      timingSource,
    },
  );

  const [incomingWords, incomingHints] = transformWordEntries(
    wordEntries,
    alternative.transcript,
    channelIndex,
    { timingSource },
  );
  if (incomingWords.length === 0) {
    return preview;
  }

  if (response.from_finalize) {
    return {
      wordsByChannel: {
        ...preview.wordsByChannel,
        [channelIndex]: incomingWords,
      },
      hintsByChannel: {
        ...preview.hintsByChannel,
        [channelIndex]: incomingHints,
      },
    };
  }

  const existingWords = preview.wordsByChannel[channelIndex] ?? [];
  const existingHints = preview.hintsByChannel[channelIndex] ?? [];
  const firstStartMs = incomingWords[0]?.start_ms ?? 0;
  const lastEndMs = incomingWords[incomingWords.length - 1]?.end_ms ?? 0;

  const beforeWords = existingWords.filter(
    (word) => word.end_ms <= firstStartMs,
  );
  const afterWords = existingWords.filter((word) => word.start_ms >= lastEndMs);
  const mergedWords = [...beforeWords, ...incomingWords, ...afterWords];

  const hintsBefore = existingHints.filter((hint) => {
    const word = existingWords[hint.wordIndex];
    return word && word.end_ms <= firstStartMs;
  });
  const afterIndexMap = new Map<number, number>();
  let afterIndex = 0;
  for (let index = 0; index < existingWords.length; index += 1) {
    if (existingWords[index].start_ms >= lastEndMs) {
      afterIndexMap.set(
        index,
        beforeWords.length + incomingWords.length + afterIndex,
      );
      afterIndex += 1;
    }
  }
  const hintsAfter = existingHints
    .filter((hint) => afterIndexMap.has(hint.wordIndex))
    .map((hint) => ({
      ...hint,
      wordIndex: afterIndexMap.get(hint.wordIndex)!,
    }));
  const adjustedIncomingHints = incomingHints.map((hint) => ({
    ...hint,
    wordIndex: beforeWords.length + hint.wordIndex,
  }));

  return {
    wordsByChannel: {
      ...preview.wordsByChannel,
      [channelIndex]: mergedWords,
    },
    hintsByChannel: {
      ...preview.hintsByChannel,
      [channelIndex]: [...hintsBefore, ...adjustedIncomingHints, ...hintsAfter],
    },
  };
}

export function getBatchStreamPercentage(event: BatchStreamEvent): number {
  switch (event.type) {
    case "progress":
    case "segment":
      return event.percentage;
    case "result":
    case "terminal":
      return 1;
    case "error":
      return 0;
  }
}
