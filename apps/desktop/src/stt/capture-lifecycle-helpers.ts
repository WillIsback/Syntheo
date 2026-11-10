import { commands as fsSyncCommands } from "@syntheo/plugin-fs-sync";
import { commands as transcriptionCommands } from "@syntheo/plugin-transcription";

import { loadCaptureStop, saveCaptureStop } from "./capture-completion";
import { persistTranscriptWrite } from "./persist-retry";

import { isSessionDeleted } from "~/session/queries";
import { requestCaptureRecovery } from "~/stt/capture-recovery-requests";

export async function getAudioDurationMs(audioPath: string) {
  try {
    const metadataResult = await fsSyncCommands.audioSourceMetadata(audioPath);
    if (metadataResult.status === "error") {
      return null;
    }

    const durationMs = metadataResult.data.durationMs;
    return typeof durationMs === "number" && Number.isFinite(durationMs)
      ? Math.max(0, durationMs)
      : null;
  } catch {
    return null;
  }
}

export async function getExistingAudioDurationMs(sessionId: string) {
  try {
    const pathResult = await fsSyncCommands.audioPath(sessionId);
    if (pathResult.status === "error") {
      return 0;
    }

    return (await getAudioDurationMs(pathResult.data)) ?? 0;
  } catch {
    return 0;
  }
}

export async function requestCaptureRecoverySafely(sessionId: string) {
  try {
    await requestCaptureRecovery(sessionId);
  } catch (error) {
    console.error("[listener] failed to request capture recovery", error);
  }
}

export type PostCaptureDetails = {
  audioPath: string | null;
  liveTranscriptionActive: boolean;
  needsBatchRepair: boolean;
  transcriptWriteFailed?: boolean;
};

export type PostCaptureRepairReason =
  | "live_transcription_unavailable"
  | "live_stream_incomplete"
  | "transcript_persistence_failed";

export function getPostCaptureRepairReasons(
  details: PostCaptureDetails,
): PostCaptureRepairReason[] {
  const reasons: PostCaptureRepairReason[] = [];
  if (!details.liveTranscriptionActive) {
    reasons.push("live_transcription_unavailable");
  }
  if (details.needsBatchRepair) {
    reasons.push("live_stream_incomplete");
  }
  if (details.transcriptWriteFailed) {
    reasons.push("transcript_persistence_failed");
  }
  return reasons;
}

export function getPostCaptureAction(
  details: PostCaptureDetails,
  canRunBatch: boolean,
) {
  const liveTranscriptComplete =
    details.liveTranscriptionActive &&
    !details.needsBatchRepair &&
    !details.transcriptWriteFailed;

  if (liveTranscriptComplete) {
    return "enhance_only" as const;
  }

  if (!!details.audioPath && canRunBatch) {
    return "batch_then_enhance" as const;
  }

  if (liveTranscriptComplete) {
    return "enhance_only" as const;
  }

  return "none" as const;
}

/**
 * Enregistre l'heure d'arrêt native de la capture et, si le registre natif la
 * connaît, sa durée réelle. Renvoie l'heure d'arrêt connue.
 */
export async function recordCaptureStop(
  sessionId: string,
  transcriptId: string,
  nativeStoppedAtMs: number | undefined,
) {
  if (nativeStoppedAtMs !== undefined) {
    await persistTranscriptWrite(() =>
      saveCaptureStop(sessionId, transcriptId, nativeStoppedAtMs),
    );
  }
  const stoppedAtMs = await loadCaptureStop(sessionId, transcriptId);
  // The native registry knows when capture actually began. Transcript
  // replacement and retry clocks cannot measure recorded minutes.
  if (stoppedAtMs !== null) {
    try {
      const result = await transcriptionCommands.getStoppedCapture(sessionId);
      if (
        result.status === "ok" &&
        result.data?.stopped_at_ms === stoppedAtMs
      ) {
        const durationMs = Math.round(result.data.duration_seconds * 1000);
        if (
          Number.isSafeInteger(durationMs) &&
          durationMs > 0 &&
          durationMs <= stoppedAtMs
        ) {
          await saveCaptureStop(sessionId, transcriptId, stoppedAtMs, {
            startedAtMs: stoppedAtMs - durationMs,
            requestedLiveTranscription:
              result.data.requested_live_transcription,
            liveTranscriptionActiveAtStop:
              result.data.live_transcription_active,
          });
        }
      }
    } catch {
      // Missing measurement metadata is counted by the pilot report;
      // it must not interrupt saving the meeting itself.
      console.warn("[listener] capture usage metadata is unavailable");
    }
  }
  return stoppedAtMs;
}

export async function sessionWasDeleted(sessionId: string) {
  try {
    return await isSessionDeleted(sessionId);
  } catch (error) {
    console.warn(
      "[listener] failed to check whether the session was deleted",
      error,
    );
    return false;
  }
}
