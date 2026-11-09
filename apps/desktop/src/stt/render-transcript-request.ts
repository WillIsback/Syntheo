import type { TranscriptSpeakerHint } from "@syntheo/plugin-fs-sync";
import type {
  IdentityAssignment,
  RenderTranscriptHuman,
  RenderTranscriptInput,
  RenderTranscriptRequest,
  RenderedTranscriptSegment,
} from "@syntheo/plugin-transcription";

import type { SegmentWord } from "~/stt/live-segment";
import type { TranscriptWordMetadata } from "~/stt/timing";

export type RenderedTranscriptSegmentWithWordMetadata = Omit<
  RenderedTranscriptSegment,
  "words"
> & {
  words: SegmentWord[];
};

export type TranscriptRow = {
  started_at?: number | null;
  words?: Array<{
    id?: string | null;
    text?: string | null;
    start_ms?: number | null;
    end_ms?: number | null;
    channel?: number | null;
    metadata?: unknown;
  }> | null;
  speaker_hints?: Array<
    TranscriptSpeakerHint | { word_id?: string; type?: string; value?: unknown }
  > | null;
};

export type RenderTranscriptRequestHumans = {
  selfHumanId?: string;
  humans: RenderTranscriptHuman[];
};

export function buildRenderTranscriptRequest(
  transcripts: TranscriptRow[],
  humans?: RenderTranscriptRequestHumans,
  participantHumanIds?: string[],
): RenderTranscriptRequest | null {
  if (transcripts.length === 0) {
    return null;
  }

  const normalizedTranscripts: RenderTranscriptInput[] = [];

  for (const transcript of transcripts) {
    const words: RenderTranscriptInput["words"] = [];
    const assignments: IdentityAssignment[] = [];
    const wordIndexById = new Map<string, number>();

    for (const word of transcript.words ?? []) {
      if (
        typeof word.id !== "string" ||
        typeof word.text !== "string" ||
        typeof word.start_ms !== "number" ||
        typeof word.end_ms !== "number"
      ) {
        continue;
      }

      wordIndexById.set(word.id, words.length);
      const metadata = normalizeWordMetadata(word.metadata);
      const renderWord: RenderTranscriptInput["words"][number] & {
        metadata?: TranscriptWordMetadata;
      } = {
        id: word.id,
        text: word.text,
        start_ms: word.start_ms,
        end_ms: word.end_ms,
        channel: typeof word.channel === "number" ? word.channel : 0,
        speaker_index: null,
        ...(metadata ? { metadata } : {}),
      };
      words.push(renderWord);
    }

    for (const hint of transcript.speaker_hints ?? []) {
      if (hint.type !== "provider_speaker_index") {
        continue;
      }

      normalizeSpeakerHint(hint, words, wordIndexById);
    }

    for (const hint of transcript.speaker_hints ?? []) {
      if (hint.type === "automatic_speaker_assignment") {
        const normalized = normalizeSpeakerHint(hint, words, wordIndexById);
        if (normalized) {
          assignments.push(normalized);
        }
      }
    }

    for (const hint of transcript.speaker_hints ?? []) {
      if (hint.type === "user_speaker_assignment") {
        const normalized = normalizeSpeakerHint(hint, words, wordIndexById);
        if (normalized) {
          assignments.push(normalized);
        }
      }
    }

    if (words.length === 0) {
      continue;
    }

    normalizedTranscripts.push({
      started_at:
        typeof transcript.started_at === "number"
          ? transcript.started_at
          : null,
      words,
      assignments,
    });
  }

  if (normalizedTranscripts.length === 0) {
    return null;
  }

  return {
    transcripts: normalizedTranscripts,
    participant_human_ids: participantHumanIds ?? [],
    self_human_id: humans?.selfHumanId ?? null,
    humans: humans?.humans ?? [],
  };
}

function normalizeSpeakerHint(
  hint:
    | TranscriptSpeakerHint
    | { word_id?: string; type?: string; value?: unknown },
  words: RenderTranscriptInput["words"],
  wordIndexById: Map<string, number>,
): IdentityAssignment | null {
  if (typeof hint.word_id !== "string" || typeof hint.type !== "string") {
    return null;
  }

  const value = parseHintValue(hint.value);
  if (!value || typeof value !== "object") {
    return null;
  }

  const isSpeakerAssignment =
    hint.type === "automatic_speaker_assignment" ||
    hint.type === "user_speaker_assignment";
  const humanId = (value as { human_id?: unknown }).human_id;
  if (isSpeakerAssignment && typeof humanId === "string") {
    const explicitSpeakerScope = getExplicitSpeakerScope(value);
    if (explicitSpeakerScope) {
      return {
        human_id: humanId,
        scope: explicitSpeakerScope,
      };
    }

    if (
      (value as { scope?: unknown }).scope === "segment" &&
      Array.isArray((value as { word_ids?: unknown }).word_ids)
    ) {
      const wordIds = (value as { word_ids: unknown[] }).word_ids.filter(
        (wordId): wordId is string =>
          typeof wordId === "string" && wordId.length > 0,
      );
      if (wordIds.length > 0) {
        return {
          human_id: humanId,
          scope: {
            kind: "words",
            word_ids: wordIds,
          },
        };
      }
    }
  }

  const wordIndex = wordIndexById.get(hint.word_id);
  if (typeof wordIndex !== "number") {
    return null;
  }

  const word = words[wordIndex];
  if (!word) {
    return null;
  }

  if (
    hint.type === "provider_speaker_index" &&
    typeof (value as { speaker_index?: unknown }).speaker_index === "number"
  ) {
    word.speaker_index = (value as { speaker_index: number }).speaker_index;
    if (typeof (value as { channel?: unknown }).channel === "number") {
      word.channel = (value as { channel: number }).channel;
    }
    return null;
  }

  if (isSpeakerAssignment && typeof humanId === "string") {
    return word.speaker_index == null
      ? {
          human_id: humanId,
          scope: {
            kind: "channel",
            channel:
              word.channel === 0
                ? "DirectMic"
                : word.channel === 1
                  ? "RemoteParty"
                  : "MixedCapture",
          },
        }
      : {
          human_id: humanId,
          scope: {
            kind: "channel_speaker",
            channel:
              word.channel === 0
                ? "DirectMic"
                : word.channel === 1
                  ? "RemoteParty"
                  : "MixedCapture",
            speaker_index: word.speaker_index,
          },
        };
  }

  return null;
}

function getExplicitSpeakerScope(
  value: object,
): IdentityAssignment["scope"] | null {
  if ((value as { scope?: unknown }).scope !== "speaker") {
    return null;
  }

  const channel = (value as { channel?: unknown }).channel;
  if (channel !== 0 && channel !== 1 && channel !== 2) {
    return null;
  }

  const channelProfile =
    channel === 0
      ? "DirectMic"
      : channel === 1
        ? "RemoteParty"
        : "MixedCapture";
  const speakerIndex = (value as { speaker_index?: unknown }).speaker_index;

  return typeof speakerIndex === "number"
    ? {
        kind: "channel_speaker",
        channel: channelProfile,
        speaker_index: speakerIndex,
      }
    : speakerIndex === null
      ? { kind: "channel", channel: channelProfile }
      : null;
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

export function normalizeRenderTranscriptRequest(
  request: RenderTranscriptRequest,
): RenderTranscriptRequest {
  return {
    ...request,
    transcripts: request.transcripts.map((transcript) => ({
      ...transcript,
      started_at: normalizeOptionalTranscriptMs(transcript.started_at),
      words: transcript.words.map((word) => {
        const chunkStartMs = syntheticChunkStartMs(
          (word as { metadata?: unknown }).metadata,
        );
        return {
          ...word,
          start_ms: normalizeTranscriptMs(word.start_ms),
          end_ms: normalizeTranscriptMs(word.end_ms),
          ...(chunkStartMs !== undefined
            ? { synthetic_timing: { chunk_start_ms: chunkStartMs } }
            : {}),
        };
      }),
    })),
  };
}

export function syntheticChunkStartMs(
  metadata: unknown,
): number | null | undefined {
  const timing = normalizeWordMetadata(metadata)?.timing;
  if (!timing || typeof timing !== "object" || Array.isArray(timing)) {
    return undefined;
  }
  const record = timing as Record<string, unknown>;
  if (record.source !== "synthetic_text") {
    return undefined;
  }
  const chunkStartMs = record.chunk_start_ms;
  return typeof chunkStartMs === "number" && Number.isFinite(chunkStartMs)
    ? chunkStartMs
    : null;
}

export function collectWordMetadataById(
  request: RenderTranscriptRequest,
): Map<string, TranscriptWordMetadata> {
  const metadataByWordId = new Map<string, TranscriptWordMetadata>();

  for (const transcript of request.transcripts) {
    for (const word of transcript.words) {
      const metadata = normalizeWordMetadata(
        (word as { metadata?: unknown }).metadata,
      );
      if (metadata) {
        metadataByWordId.set(word.id, metadata);
      }
    }
  }

  return metadataByWordId;
}

export function attachWordMetadata(
  segments: RenderedTranscriptSegment[],
  metadataByWordId: Map<string, TranscriptWordMetadata>,
): RenderedTranscriptSegmentWithWordMetadata[] {
  if (metadataByWordId.size === 0) {
    return segments as RenderedTranscriptSegmentWithWordMetadata[];
  }

  return segments.map((segment) => ({
    ...segment,
    words: segment.words.map((word) =>
      attachMetadataToWord(word, metadataByWordId),
    ),
  }));
}

function attachMetadataToWord(
  word: RenderedTranscriptSegment["words"][number],
  metadataByWordId: Map<string, TranscriptWordMetadata>,
): SegmentWord {
  if (!word.id) {
    return word;
  }

  const metadata = metadataByWordId.get(word.id);
  return metadata ? { ...word, metadata } : word;
}

function normalizeWordMetadata(value: unknown): TranscriptWordMetadata | null {
  if (typeof value === "string") {
    try {
      return normalizeWordMetadata(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as TranscriptWordMetadata)
    : null;
}

function normalizeTranscriptMs(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : value;
}

function normalizeOptionalTranscriptMs(value: number | null): number | null {
  return typeof value === "number" ? normalizeTranscriptMs(value) : value;
}
