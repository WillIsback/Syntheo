import type { BatchResponse } from "@syntheo/plugin-transcription";

import { transformWordEntries, type WordEntry } from "./utils";

import { type RuntimeSpeakerHint, type WordLike } from "~/stt/segment";
import {
  createTranscriptTimingMetadata,
  getValidTimingSource,
  type TranscriptTimingSource,
} from "~/stt/timing";

const SYNTHETIC_TEXT_WORD_SECONDS = 0.4;
const MIN_SYNTHETIC_TEXT_WORD_SECONDS = 0.05;

export function transformBatch(
  response: BatchResponse,
): [WordLike[], RuntimeSpeakerHint[]] {
  const allWords: WordLike[] = [];
  const allHints: RuntimeSpeakerHint[] = [];
  let wordOffset = 0;

  response.results.channels.forEach((channel, channelIndex) => {
    const alternative = channel.alternatives[0];
    if (!alternative) {
      return;
    }

    const channelTimingSource = getChannelTimingSource(response, channelIndex);
    const timingSource =
      channelTimingSource ??
      getWordTimingSourceForBatchResponse(
        response,
        Boolean(alternative.words?.length),
        "synthetic_text",
      );
    const wordEntries = attachSyntheticChunkStarts(
      markUnalignedDiarizedWordsSynthetic(
        wordEntriesFromTranscript(alternative.words, alternative.transcript, {
          channel: channelIndex,
          durationSeconds: getBatchDurationSeconds(response),
          timingSource,
        }),
        channelTimingSource,
      ),
      response,
      channelIndex,
    );

    const [transformedWords, hints] = transformWordEntries(
      wordEntries,
      alternative.transcript,
      channelIndex,
      { timingSource },
    );
    const words = transformedWords.map((word, index) => ({
      ...word,
      metadata: wordEntries[index]?.metadata ?? word.metadata,
    }));

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

function getChannelTimingSource(
  response: BatchResponse,
  channel: number,
): TranscriptTimingSource | undefined {
  const metadata = response.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const sources = (metadata as Record<string, unknown>)
    .timing_sources_by_channel;
  return Array.isArray(sources)
    ? getValidTimingSource(sources[channel])
    : undefined;
}

function markUnalignedDiarizedWordsSynthetic(
  entries: WordEntry[],
  timingSource: TranscriptTimingSource | undefined,
): WordEntry[] {
  // Soniqo supplies per-channel provenance for its unaligned fallback words.
  // Other providers' segment timestamps remain useful without speaker labels.
  if (timingSource !== "provider_segment_interpolated") return entries;
  return entries.map((entry) =>
    typeof entry.speaker === "number"
      ? entry
      : {
          ...entry,
          metadata: createTranscriptTimingMetadata(
            "synthetic_text",
            entry.metadata,
          ),
        },
  );
}

function attachSyntheticChunkStarts(
  entries: WordEntry[],
  response: BatchResponse,
  channel: number,
): WordEntry[] {
  const metadata = response.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return entries;
  }
  const rawChunks = (metadata as Record<string, unknown>).synthetic_chunks;
  if (!Array.isArray(rawChunks)) return entries;

  const chunks = rawChunks.filter(
    (
      chunk,
    ): chunk is {
      channel: number;
      start_seconds: number;
      end_seconds: number;
    } =>
      chunk !== null &&
      typeof chunk === "object" &&
      chunk.channel === channel &&
      typeof chunk.start_seconds === "number" &&
      Number.isFinite(chunk.start_seconds) &&
      typeof chunk.end_seconds === "number" &&
      Number.isFinite(chunk.end_seconds) &&
      chunk.end_seconds > chunk.start_seconds,
  );
  if (!chunks.length) return entries;

  const orderedChunks = [...chunks].sort(
    (left, right) => left.start_seconds - right.start_seconds,
  );
  const hasOverlaps = orderedChunks.some(
    (chunk, index) =>
      index > 0 && chunk.start_seconds < orderedChunks[index - 1].end_seconds,
  );
  const findChunk = (start: number) => {
    // Preserve the original first-match behavior for malformed overlapping chunks.
    if (hasOverlaps) {
      return chunks.find(
        (chunk) => start >= chunk.start_seconds && start < chunk.end_seconds,
      );
    }
    let left = 0;
    let right = orderedChunks.length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (orderedChunks[middle].start_seconds <= start) left = middle + 1;
      else right = middle;
    }
    const chunk = orderedChunks[left - 1];
    return chunk && start < chunk.end_seconds ? chunk : undefined;
  };

  return entries.map((entry) => {
    const entryTiming = (
      entry.metadata?.timing as Record<string, unknown> | undefined
    )?.source;
    if (entryTiming !== "synthetic_text") return entry;
    const chunk = findChunk(entry.start);
    if (!chunk) return entry;
    const metadata = createTranscriptTimingMetadata(
      "synthetic_text",
      entry.metadata,
    );
    return {
      ...entry,
      metadata: {
        ...metadata,
        timing: {
          ...(metadata.timing as Record<string, unknown>),
          chunk_start_ms: Math.round(chunk.start_seconds * 1000),
        },
      },
    };
  });
}

export function wordEntriesFromTranscript(
  entries: WordEntry[] | null | undefined,
  transcript: string,
  {
    channel,
    startSeconds = 0,
    durationSeconds,
    timingSource,
  }: {
    channel: number;
    startSeconds?: number;
    durationSeconds?: number;
    timingSource: TranscriptTimingSource;
  },
): WordEntry[] {
  if (entries?.length) {
    return entries.map((entry) => ({
      ...entry,
      metadata: createTranscriptTimingMetadata(timingSource, entry.metadata),
    }));
  }

  if (!transcript.trim()) {
    return [];
  }

  const tokens = transcript.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return [];
  }

  const duration =
    timingSource === "synthetic_text"
      ? tokens.length * SYNTHETIC_TEXT_WORD_SECONDS
      : Math.max(
          durationSeconds && Number.isFinite(durationSeconds)
            ? durationSeconds
            : tokens.length * SYNTHETIC_TEXT_WORD_SECONDS,
          tokens.length * MIN_SYNTHETIC_TEXT_WORD_SECONDS,
        );

  return tokens.map((token, index) => ({
    word: token,
    punctuated_word: token,
    start: startSeconds + (index / tokens.length) * duration,
    end: startSeconds + ((index + 1) / tokens.length) * duration,
    channel,
    speaker: null,
    metadata: createTranscriptTimingMetadata(timingSource),
  }));
}

export function getWordTimingSourceForBatchResponse(
  response: { metadata?: unknown },
  hasProviderWords: boolean,
  fallbackWithoutWords: TranscriptTimingSource,
): TranscriptTimingSource {
  if (!hasProviderWords) {
    return fallbackWithoutWords;
  }

  const explicitSource = getBatchResponseTimingSource(response);
  if (explicitSource) {
    return explicitSource;
  }

  return "provider_word";
}

function getBatchResponseTimingSource(response: {
  metadata?: unknown;
}): TranscriptTimingSource | undefined {
  const metadata = response.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const record = metadata as Record<string, unknown>;
  const timing = record.timing;
  if (timing && typeof timing === "object" && !Array.isArray(timing)) {
    return getValidTimingSource((timing as Record<string, unknown>).source);
  }

  return getValidTimingSource(record.timing_source);
}

function getBatchDurationSeconds(response: BatchResponse): number | undefined {
  const metadata = response.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const duration = (metadata as Record<string, unknown>).duration;
  return typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
    ? duration
    : undefined;
}
