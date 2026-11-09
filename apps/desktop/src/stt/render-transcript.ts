import { commands as listenerCommands } from "@syntheo/plugin-transcription";
import type {
  SpeakerContext,
  RenderTranscriptInput,
  RenderTranscriptRequest,
} from "@syntheo/plugin-transcription";

import {
  type RenderTranscriptRequestHumans,
  type RenderedTranscriptSegmentWithWordMetadata,
  type TranscriptRow,
  attachWordMetadata,
  buildRenderTranscriptRequest,
  collectWordMetadataById,
  normalizeRenderTranscriptRequest,
  parseHintValue,
  syntheticChunkStartMs,
} from "./render-transcript-request";

export {
  type RenderedTranscriptSegmentWithWordMetadata,
  type TranscriptRow,
  type RenderTranscriptRequestHumans,
} from "./render-transcript-request";

export async function renderTranscriptSegments(
  request: RenderTranscriptRequest,
): Promise<RenderedTranscriptSegmentWithWordMetadata[]> {
  const normalizedRequest = normalizeRenderTranscriptRequest(request);
  const metadataByWordId = collectWordMetadataById(normalizedRequest);
  const result =
    await listenerCommands.renderTranscriptSegments(normalizedRequest);
  if (result.status === "error") {
    throw new Error(result.error);
  }

  return attachWordMetadata(result.data, metadataByWordId);
}

export function getRenderTranscriptRequestKey(
  request: RenderTranscriptRequest | null | undefined,
): string {
  if (!request) {
    return "empty";
  }

  let hash = 2_166_136_261;
  let wordCount = 0;
  let assignmentCount = 0;

  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619) >>> 0;
    }
    hash = Math.imul(hash ^ 31, 16_777_619) >>> 0;
  };

  const writeValue = (value: unknown) => {
    if (value == null) {
      writeString("");
      return;
    }

    if (typeof value === "object") {
      try {
        writeString(JSON.stringify(value));
      } catch {
        writeString("[object]");
      }
      return;
    }

    writeString(String(value));
  };

  writeValue(request.self_human_id);
  writeValue(request.speaker_context);
  writeValue(request.preview);

  for (const humanId of request.participant_human_ids) {
    writeValue(humanId);
  }

  for (const human of request.humans) {
    writeValue(human.human_id);
    writeValue(human.name);
  }

  for (const transcript of request.transcripts) {
    writeValue(transcript.started_at);
    wordCount += transcript.words.length;
    assignmentCount += transcript.assignments.length;

    for (const word of transcript.words) {
      writeValue(word.id);
      writeValue(word.text);
      writeValue(word.start_ms);
      writeValue(word.end_ms);
      writeValue(word.channel);
      writeValue(word.speaker_index);
      writeValue((word as { metadata?: unknown }).metadata);
      writeValue(
        syntheticChunkStartMs((word as { metadata?: unknown }).metadata),
      );
    }

    for (const assignment of transcript.assignments) {
      writeValue(assignment.human_id);
      writeValue(assignment.scope.kind);
      writeValue(
        "channel" in assignment.scope ? assignment.scope.channel : null,
      );
      writeValue(
        "speaker_index" in assignment.scope
          ? assignment.scope.speaker_index
          : null,
      );
      writeValue(
        "word_ids" in assignment.scope ? assignment.scope.word_ids : null,
      );
    }
  }

  return [
    request.transcripts.length,
    wordCount,
    assignmentCount,
    hash.toString(36),
  ].join(":");
}

export function buildRenderTranscriptRequestFromRows(
  transcripts: TranscriptRow[],
  humans?: RenderTranscriptRequestHumans,
  participantHumanIds?: string[],
  speakerContext?: SpeakerContext,
): RenderTranscriptRequest | null {
  const request = buildRenderTranscriptRequest(
    transcripts,
    humans,
    participantHumanIds,
  );
  return request && speakerContext?.intervals.length
    ? { ...request, speaker_context: speakerContext }
    : request;
}

export function resolveScopedWordHumanIds(
  transcript: RenderTranscriptInput,
): Map<string, string> {
  const humansByWord = new Map<string, string>();
  const humansBySpeaker = new Map<string, string>();
  for (const assignment of transcript.assignments) {
    if (!assignment.human_id.trim()) continue;
    if (assignment.scope.kind === "words") {
      for (const wordId of assignment.scope.word_ids) {
        humansByWord.set(wordId, assignment.human_id);
      }
    } else if (assignment.scope.kind === "channel_speaker") {
      humansBySpeaker.set(
        `${assignment.scope.channel}:${assignment.scope.speaker_index}`,
        assignment.human_id,
      );
    }
  }

  return new Map(
    transcript.words.flatMap((word) => {
      const channel =
        word.channel === 0
          ? "DirectMic"
          : word.channel === 1
            ? "RemoteParty"
            : "MixedCapture";
      const humanId =
        humansByWord.get(word.id) ??
        humansBySpeaker.get(`${channel}:${word.speaker_index}`);
      return humanId ? [[word.id, humanId] as const] : [];
    }),
  );
}

export function collectAssignedHumanIdsFromTranscriptRows(
  transcripts: TranscriptRow[],
): string[] {
  const humanIds = new Set<string>();

  for (const transcript of transcripts) {
    for (const hint of transcript.speaker_hints ?? []) {
      if (
        hint.type !== "automatic_speaker_assignment" &&
        hint.type !== "user_speaker_assignment"
      ) {
        continue;
      }

      const value = parseHintValue(hint.value);
      const humanId =
        value && typeof value === "object"
          ? (value as { human_id?: unknown }).human_id
          : undefined;

      if (typeof humanId === "string" && humanId) {
        humanIds.add(humanId);
      }
    }
  }

  return [...humanIds];
}
