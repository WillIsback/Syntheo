import { t } from "@lingui/core/macro";

import {
  commands as transcriptionCommands,
  type BatchRefinementSource,
  type BatchProvider,
  type BatchTranscriptPromotion,
  type StoredSpeakerHint,
  type StoredTranscriptWord,
} from "@syntheo/plugin-transcription";

import { BatchResponseProcessingError } from "./batch-response-processing-error";

import type { BatchPersistCallback } from "~/store/zustand/listener/transcript";
import type { TranscriptRecord } from "~/stt/queries";
import type { SpeakerHintWithId, WordWithId } from "~/stt/types";

export type RunOptions = {
  signal?: AbortSignal;
  /**
   * Sans mode par lot, transcrire par le flux temps réel du fournisseur
   * (issue 463) : import de fichier et morceaux d'audio d'une capture à
   * réparer (issue 515).
   */
  allowRealtimeStream?: boolean;
  /**
   * Audio transmis en mémoire (dictée) : prioritaire sur le chemin de fichier,
   * et jamais écrit sur le disque. Base64, car Tauri sérialise `Vec<u8>` en
   * tableau de nombres.
   */
  audio?: { data_base64: string; file_name: string };
  /**
   * Fichier déposé reçu par morceaux et gardé en mémoire côté Rust
   * (`streamAudioFileToMemory`) : prioritaire sur `audio` et le chemin.
   */
  audioUploadId?: string;
  recovery?: {
    persist: (words: WordWithId[], hints: SpeakerHintWithId[]) => Promise<void>;
  };
  deferAudioFinalization?: boolean;
  handlePersist?: BatchPersistCallback;
  notifyOnCompletion?: boolean;
  resume?: { provider: BatchProvider; model: string };
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  keywords?: string[];
  languages?: string[];
  numSpeakers?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
  promotion?: RunOptionsPromotion;
  captureInterval?: { startedAtMs: number; stoppedAtMs: number };
};

type RunOptionsPromotion =
  | { scope: "preserve_existing" }
  | { scope: "whole_session" }
  | {
      scope: "current_capture";
      audioOffsetMs: number;
      replaceTranscriptId?: string;
      startedAt: number;
    };

export function toStoredTranscriptWord(word: WordWithId): StoredTranscriptWord {
  return {
    ...word,
    metadata: word.metadata as StoredTranscriptWord["metadata"],
  };
}

export function toStoredSpeakerHint(
  hint: SpeakerHintWithId,
): StoredSpeakerHint {
  return {
    id: hint.id,
    word_id: hint.word_id ?? undefined,
    type: hint.type ?? "",
    value: hint.value as StoredSpeakerHint["value"],
  };
}

function toSpeakerHintWithId(hint: StoredSpeakerHint): SpeakerHintWithId {
  return {
    id: hint.id,
    word_id: hint.word_id ?? "",
    type: hint.type,
    value: hint.value as SpeakerHintWithId["value"],
  };
}

function toBatchRefinementSource(
  transcript: TranscriptRecord,
): BatchRefinementSource {
  return {
    id: transcript.id,
    started_at: transcript.startedAt,
    words: transcript.words.map(toStoredTranscriptWord),
    speaker_hints: transcript.speakerHints.map(toStoredSpeakerHint),
  };
}

export async function reconcileRefinedSpeakerClusters(
  source: TranscriptRecord,
  words: WordWithId[],
  hints: SpeakerHintWithId[],
): Promise<SpeakerHintWithId[]> {
  const result = await transcriptionCommands.reconcileRefinedSpeakerClusters({
    source: toBatchRefinementSource(source),
    words: words.map(toStoredTranscriptWord),
    hints: hints.map(toStoredSpeakerHint),
  });
  if (result.status === "error") throw new Error(result.error);
  return result.data.map(toSpeakerHintWithId);
}

const STOPPED_TRANSCRIPTION_ERROR_MESSAGE = "Transcription stopped.";
export const EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE =
  "Batch transcription did not include the current recording.";
export const INCOMPLETE_BATCH_TRANSCRIPT_ERROR_MESSAGE =
  "The new transcription returned much less text. Your saved transcript and recording were kept. Try transcribing again.";
const NO_SPEECH_RECOVERY_ERROR_MESSAGE = "No speech was detected in the audio.";

export function canRunBatchTranscription(
  _conn: { provider: string; model: string } | null,
  _modelOverride?: string,
) {
  return true;
}

export function selectedProviderLabel(
  conn: { provider: string; model: string } | null,
  modelOverride?: string,
) {
  if (!conn) {
    return t`The selected transcription provider`;
  }

  return modelOverride ?? conn.model ?? conn.provider;
}

export function isStoppedTranscriptionError(error: unknown) {
  return (
    (error instanceof Error ? error.message : String(error)) ===
    STOPPED_TRANSCRIPTION_ERROR_MESSAGE
  );
}

function isTranscriptionAuthenticationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /authentication failed|invalid_token|unauthorized|\b401\b/i.test(
    message,
  );
}

export function isTerminalTranscriptionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    error instanceof BatchResponseProcessingError ||
    message === EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE ||
    message === INCOMPLETE_BATCH_TRANSCRIPT_ERROR_MESSAGE ||
    isTranscriptionAuthenticationError(error) ||
    /corrupt or unsupported|unsupported (?:audio|data)|invalid audio|no speech|empty transcript/i.test(
      message,
    ) ||
    /\b(?:400|403|404|413|415|422)\b|bad request|invalid api key/i.test(message)
  );
}

export function getSessionSpeakerCount(
  participantHumanIds: Iterable<string>,
  selfHumanId?: string | null,
): number | undefined {
  const humanIds = new Set(Array.from(participantHumanIds).filter(Boolean));

  if (typeof selfHumanId === "string" && selfHumanId) {
    humanIds.add(selfHumanId);
  }

  return humanIds.size > 1 ? humanIds.size : undefined;
}

export function isRecoveryNoSpeechError(
  options: RunOptions | undefined,
  error: unknown,
): boolean {
  return (
    Boolean(options?.recovery) &&
    error instanceof Error &&
    error.message === NO_SPEECH_RECOVERY_ERROR_MESSAGE
  );
}

export function isTerminalBatchSaveError(error: unknown): boolean {
  if (error instanceof BatchResponseProcessingError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message === EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE ||
    error.message === INCOMPLETE_BATCH_TRANSCRIPT_ERROR_MESSAGE
  );
}

export function toBatchTranscriptPromotion(
  promotion: RunOptionsPromotion,
): BatchTranscriptPromotion {
  if (promotion.scope === "current_capture") {
    return {
      scope: "current_capture",
      audio_offset_ms: promotion.audioOffsetMs,
      replace_transcript_id: promotion.replaceTranscriptId,
      started_at: promotion.startedAt,
    };
  }
  return { scope: promotion.scope };
}
