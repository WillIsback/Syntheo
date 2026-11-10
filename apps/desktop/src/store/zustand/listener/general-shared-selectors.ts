import {
  type LiveCaptureUiMode,
  type LiveStartBlockReason,
  type LiveState,
  type SessionMode,
} from "./general-shared-state";

export const getLiveStartBlockReason = (
  live: Pick<
    LiveState,
    | "status"
    | "loading"
    | "sessionId"
    | "finalizingBySession"
    | "postStopProcessingBySession"
  >,
  targetSessionId: string,
): LiveStartBlockReason | null => {
  if (live.postStopProcessingBySession[targetSessionId]) {
    return "post_stop_processing";
  }

  if (live.sessionId === targetSessionId) {
    if (live.status === "active") {
      return "session_active";
    }
    if (live.status === "finalizing") {
      return "session_finalizing";
    }
    if (live.loading) {
      return "start_in_progress";
    }
  }

  if (live.finalizingBySession[targetSessionId]) {
    return "session_finalizing";
  }

  if (live.status === "active") {
    return "another_session_active";
  }

  if (live.status === "inactive" && live.loading) {
    return "start_in_progress";
  }

  return null;
};

/**
 * Écoute en pause (ou en cours de mise en pause) : `sessionId` omis, toutes
 * sessions confondues. Aucune capture n'est ouverte, mais la réunion continue.
 */
export const isListeningPaused = (
  live: Pick<LiveState, "pause">,
  sessionId?: string,
): boolean =>
  live.pause !== null &&
  (sessionId === undefined || live.pause.sessionId === sessionId);

/** Durée écoutée de `sessionId`, pauses exclues (0 hors écoute et hors pause). */
export const getListeningElapsedSeconds = (
  live: Pick<
    LiveState,
    "pause" | "sessionId" | "seconds" | "elapsedOffsetSeconds"
  >,
  sessionId: string,
): number => {
  if (live.pause?.sessionId === sessionId) {
    return live.pause.elapsedSeconds;
  }
  return live.sessionId === sessionId
    ? live.elapsedOffsetSeconds + live.seconds
    : 0;
};

// A recording is in progress, broadly: starting, capturing, or finalizing
// (including a previous session still finalizing in the background). Post-stop
// processing such as the summary is not part of it. A paused meeting (issue
// 353) counts too: no capture is open, but the meeting goes on. Callers that
// must stay quiet during a recording (the mic-detected prompt, issue 349) rely
// on this rather than listing states.
export const isLiveRecordingInProgress = (
  live: Pick<
    LiveState,
    "status" | "loading" | "sessionId" | "finalizingBySession" | "pause"
  >,
) =>
  live.status === "active" ||
  live.status === "finalizing" ||
  (live.status === "inactive" && live.loading && !!live.sessionId) ||
  Object.keys(live.finalizingBySession).length > 0 ||
  live.pause !== null;

export const getLiveCaptureUiMode = (
  live: Pick<
    LiveState,
    "requestedLiveTranscription" | "liveTranscriptionActive"
  >,
): LiveCaptureUiMode => {
  if (live.liveTranscriptionActive === false) {
    return live.requestedLiveTranscription === true
      ? "fallback_record_only"
      : "record_only";
  }

  return "live";
};

export const isLiveTranscriptInterrupted = (
  live: Pick<
    LiveState,
    | "status"
    | "requestedLiveTranscription"
    | "liveTranscriptionActive"
    | "degraded"
    | "transcriptionStalled"
  >,
) =>
  live.status === "active" &&
  live.requestedLiveTranscription === true &&
  (live.liveTranscriptionActive === false ||
    live.degraded !== null ||
    live.transcriptionStalled);

export const isBatchTranscriptionPending = (
  sessionMode: SessionMode,
  live: Pick<
    LiveState,
    "requestedLiveTranscription" | "liveTranscriptionActive"
  >,
  postStopBatchPending = false,
) =>
  postStopBatchPending ||
  sessionMode === "running_batch" ||
  ((sessionMode === "active" || sessionMode === "finalizing") &&
    getLiveCaptureUiMode(live) !== "live");
