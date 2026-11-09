import { t } from "@lingui/core/macro";
import { create as mutate } from "mutative";
import type { StoreApi } from "zustand";

import type {
  DegradedError,
  CaptureStatusEvent,
} from "@syntheo/plugin-transcription";

export type LiveSessionStatus = "inactive" | "active" | "finalizing";
export type SessionMode = LiveSessionStatus | "running_batch";
export type LiveCaptureUiMode = "live" | "record_only" | "fallback_record_only";

type LoadingPhase =
  | "idle"
  | "audio_initializing"
  | "audio_ready"
  | "connecting"
  | "connected";

export type LiveStartBlockReason =
  | "session_active"
  | "session_finalizing"
  | "post_stop_processing"
  | "another_session_active"
  | "start_in_progress";

export type LiveIntervalId = ReturnType<typeof setInterval>;

// Pause de l'écoute (issue 353) : la capture native est arrêtée (micro et
// audio système fermés), la session reste ouverte pour une reprise.
// « pausing » couvre l'arrêt de la capture et l'enregistrement du transcript.
export type LivePause = {
  sessionId: string;
  elapsedSeconds: number;
  phase: "pausing" | "paused";
};

const TRANSCRIPTION_STALL_AMPLITUDE_THRESHOLD = 0.05;
export const TRANSCRIPTION_STALL_AUDIBLE_SECONDS = 45;
export const TRANSCRIPTION_FINAL_STALL_AUDIBLE_SECONDS = 90;

export type GeneralState = {
  live: {
    eventUnlistenersBySession: Record<string, (() => void)[]>;
    loading: boolean;
    loadingPhase: LoadingPhase;
    status: LiveSessionStatus;
    amplitude: { mic: number; speaker: number };
    seconds: number;
    captureGenerationCounter: number;
    captureGenerationBySession: Record<string, number>;
    intervalId?: LiveIntervalId;
    sessionId: string | null;
    // Micro coupé pendant l'écoute ; `speakerMuted` : son système coupé
    // (issue 447). La capture et le STT continuent, avec du silence.
    muted: boolean;
    speakerMuted: boolean;
    captureHealth: {
      mic: boolean | null;
      speaker: boolean | null;
      unavailable: boolean;
    };
    lastError: string | null;
    lastErrorSessionId: string | null;
    lastErrorIsAudioRelated: boolean;
    device: string | null;
    degraded: DegradedError | null;
    requestedLiveTranscription: boolean | null;
    liveTranscriptionActive: boolean | null;
    needsBatchRepair: boolean;
    stallAudibleSeconds: number;
    finalStallAudibleSeconds: number;
    transcriptionStalled: boolean;
    finalizingBySession: Record<
      string,
      { startedAtMs: number; seconds: number; needsBatchRepair: boolean }
    >;
    batchTranscriptionPendingBySession: Record<string, boolean>;
    postStopProcessingBySession: Record<string, boolean>;
    triggerAppIds: string[] | null;
    pause: LivePause | null;
    // Durée écoutée avant la dernière reprise : le minuteur exclut les pauses.
    elapsedOffsetSeconds: number;
  };
};

type LiveState = GeneralState["live"];

const initialLiveState: LiveState = {
  status: "inactive",
  eventUnlistenersBySession: {},
  loading: false,
  loadingPhase: "idle",
  amplitude: { mic: 0, speaker: 0 },
  seconds: 0,
  captureGenerationCounter: 0,
  captureGenerationBySession: {},
  sessionId: null,
  muted: false,
  speakerMuted: false,
  captureHealth: { mic: null, speaker: null, unavailable: false },
  lastError: null,
  lastErrorSessionId: null,
  lastErrorIsAudioRelated: false,
  device: null,
  degraded: null,
  requestedLiveTranscription: null,
  liveTranscriptionActive: null,
  needsBatchRepair: false,
  stallAudibleSeconds: 0,
  finalStallAudibleSeconds: 0,
  transcriptionStalled: false,
  finalizingBySession: {},
  batchTranscriptionPendingBySession: {},
  postStopProcessingBySession: {},
  triggerAppIds: null,
  pause: null,
  elapsedOffsetSeconds: 0,
};

export const initialGeneralState: GeneralState = {
  live: initialLiveState,
};

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

export const setLiveState = <T extends GeneralState>(
  set: StoreApi<T>["setState"],
  update: (live: LiveState) => void,
) => {
  set((state) =>
    mutate(state, (draft) => {
      update(draft.live);
    }),
  );
};

const ensureLiveCaptureGeneration = (live: LiveState, sessionId: string) => {
  if (live.captureGenerationBySession[sessionId] === undefined) {
    live.captureGenerationCounter += 1;
    live.captureGenerationBySession[sessionId] = live.captureGenerationCounter;
  }
};

export const releaseLiveCaptureGeneration = (
  live: LiveState,
  sessionId: string,
) => {
  delete live.captureGenerationBySession[sessionId];
};

export const markLiveCaptureStarted = (live: LiveState, sessionId: string) => {
  if (live.sessionId !== sessionId && live.lastErrorSessionId !== sessionId) {
    live.captureHealth = { mic: null, speaker: null, unavailable: false };
    live.lastError = null;
    live.lastErrorSessionId = null;
    live.lastErrorIsAudioRelated = false;
  }
  ensureLiveCaptureGeneration(live, sessionId);
  // Une reprise continue le minuteur là où la pause l'a arrêté.
  if (live.pause?.sessionId === sessionId) {
    live.elapsedOffsetSeconds = live.pause.elapsedSeconds;
    live.pause = null;
  }
  live.status = "active";
  live.loading = false;
  live.sessionId = sessionId;
};

export const markLiveStartRequested = (live: LiveState, sessionId: string) => {
  live.captureHealth = { mic: null, speaker: null, unavailable: false };
  ensureLiveCaptureGeneration(live, sessionId);
  live.loading = true;
  live.status = "inactive";
  live.sessionId = sessionId;
  live.lastError = null;
  live.lastErrorSessionId = null;
  live.lastErrorIsAudioRelated = false;
  live.requestedLiveTranscription = null;
  live.liveTranscriptionActive = null;
  live.needsBatchRepair = false;
  live.stallAudibleSeconds = 0;
  live.finalStallAudibleSeconds = 0;
  live.transcriptionStalled = false;
};

export const markLiveActive = (
  live: LiveState,
  sessionId: string,
  intervalId: LiveIntervalId,
  requestedLiveTranscription: boolean,
  liveTranscriptionActive: boolean,
  degraded: DegradedError | null,
) => {
  markLiveCaptureStarted(live, sessionId);
  live.loadingPhase = "idle";
  live.seconds = 0;
  live.intervalId = intervalId;
  live.degraded = degraded;
  live.requestedLiveTranscription = requestedLiveTranscription;
  live.liveTranscriptionActive = liveTranscriptionActive;
  live.needsBatchRepair ||=
    requestedLiveTranscription &&
    (!liveTranscriptionActive || degraded !== null);
  live.stallAudibleSeconds = 0;
  live.finalStallAudibleSeconds = 0;
  live.transcriptionStalled = false;
};

export const markLiveFinalizing = (live: LiveState, sessionId: string) => {
  const existing = live.finalizingBySession[sessionId];
  const seconds =
    live.sessionId === sessionId ? live.seconds : (existing?.seconds ?? 0);
  const needsBatchRepair =
    live.sessionId === sessionId
      ? live.needsBatchRepair
      : (existing?.needsBatchRepair ?? false);
  ensureLiveCaptureGeneration(live, sessionId);
  if (live.sessionId === sessionId) {
    live.status = "finalizing";
    live.loading = true;
    live.intervalId = undefined;
  }
  live.finalizingBySession[sessionId] = {
    startedAtMs: existing?.startedAtMs ?? Date.now(),
    seconds,
    needsBatchRepair,
  };
};

export const markLiveInactive = (
  live: LiveState,
  sessionId: string,
  error: string | null,
) => {
  const isAudioRelated =
    error !== null &&
    live.sessionId === sessionId &&
    live.lastErrorSessionId === sessionId &&
    live.lastErrorIsAudioRelated;
  const audioError = isAudioRelated ? live.lastError : null;
  live.status = "inactive";
  live.loading = false;
  live.loadingPhase = "idle";
  live.sessionId = null;
  live.intervalId = undefined;
  live.lastError = audioError ?? error;
  live.lastErrorSessionId = error === null ? null : sessionId;
  live.lastErrorIsAudioRelated = isAudioRelated;
  live.device = null;
  live.degraded = null;
  live.requestedLiveTranscription = null;
  live.liveTranscriptionActive = null;
  live.needsBatchRepair = false;
  live.stallAudibleSeconds = 0;
  live.finalStallAudibleSeconds = 0;
  live.transcriptionStalled = false;
  live.muted = initialLiveState.muted;
  live.speakerMuted = initialLiveState.speakerMuted;
  live.triggerAppIds = null;
  live.elapsedOffsetSeconds = 0;
};

export const markLiveStartFailed = (
  live: LiveState,
  sessionId: string,
  error: string,
) => {
  const audioError =
    live.sessionId === sessionId &&
    live.lastErrorSessionId === sessionId &&
    live.lastErrorIsAudioRelated
      ? live.lastError
      : null;
  releaseLiveCaptureGeneration(live, sessionId);
  live.intervalId = undefined;
  live.loading = false;
  live.loadingPhase = "idle";
  live.status = "inactive";
  live.amplitude = { mic: 0, speaker: 0 };
  live.seconds = 0;
  live.sessionId = null;
  live.muted = initialLiveState.muted;
  live.speakerMuted = initialLiveState.speakerMuted;
  live.lastError = audioError ?? error;
  live.lastErrorSessionId = sessionId;
  live.lastErrorIsAudioRelated = audioError !== null;
  live.device = null;
  live.degraded = null;
  live.requestedLiveTranscription = null;
  live.liveTranscriptionActive = null;
  live.needsBatchRepair = false;
  live.stallAudibleSeconds = 0;
  live.finalStallAudibleSeconds = 0;
  live.transcriptionStalled = false;
  live.triggerAppIds = null;
  live.elapsedOffsetSeconds = 0;
};

// Live STT can hang mid-session without any error or degraded event from the
// capture pipeline: either the stream stops delivering anything, or it keeps
// streaming partial words that never finalize (only finalized words are
// persisted, so the live view looks fine while nothing reaches the database).
// Count audible seconds since the last activity of each kind; past either
// threshold, flag the session so stop() runs a batch repair from the recording.
export const tickTranscriptionStallWatchdog = (live: LiveState): boolean => {
  // Mic mute must not disable the watchdog: speaker audio keeps feeding live
  // STT, and the amplitude gate below already ignores silent stretches.
  if (
    live.status !== "active" ||
    live.requestedLiveTranscription !== true ||
    live.liveTranscriptionActive !== true ||
    live.transcriptionStalled
  ) {
    return false;
  }

  const audible =
    Math.max(live.amplitude.mic, live.amplitude.speaker) >=
    TRANSCRIPTION_STALL_AMPLITUDE_THRESHOLD;
  if (!audible) {
    return false;
  }

  live.stallAudibleSeconds += 1;
  live.finalStallAudibleSeconds += 1;
  if (
    live.stallAudibleSeconds < TRANSCRIPTION_STALL_AUDIBLE_SECONDS &&
    live.finalStallAudibleSeconds < TRANSCRIPTION_FINAL_STALL_AUDIBLE_SECONDS
  ) {
    return false;
  }

  live.transcriptionStalled = true;
  live.needsBatchRepair = true;
  return true;
};

// Partials only prove the stream is alive; finalized words are what gets
// persisted, so only they mark the pipeline healthy again.
export const noteLiveTranscriptActivity = (
  live: LiveState,
  activity: { hasFinalWords: boolean },
) => {
  live.stallAudibleSeconds = 0;
  if (activity.hasFinalWords) {
    live.finalStallAudibleSeconds = 0;
    live.transcriptionStalled = false;
  }
};

const getChannelCaptureWarning = (
  live: Pick<LiveState, "captureHealth">,
): string | null => {
  const health = live.captureHealth;
  if (health.unavailable || (health.mic === false && health.speaker === false))
    return t`No audio is being captured`;
  if (health.mic === false)
    return health.speaker === true
      ? t`Microphone unavailable. System audio continues`
      : t`Microphone unavailable`;
  if (health.speaker === false)
    return health.mic === true
      ? t`System audio unavailable. Microphone capture continues`
      : t`System audio unavailable`;
  return null;
};

export const getCaptureWarning = (
  live: Pick<
    LiveState,
    "captureHealth" | "lastError" | "lastErrorIsAudioRelated"
  >,
): string | null =>
  getChannelCaptureWarning(live) ??
  (live.lastErrorIsAudioRelated &&
  live.lastError &&
  !live.lastError.startsWith("audio_storage_")
    ? t`Audio capture was interrupted`
    : null);

const updateCaptureHealth = (live: LiveState, error: string): boolean => {
  if (error === "audio_capture_ready") live.captureHealth.unavailable = false;
  else if (error === "audio_capture_unavailable")
    live.captureHealth.unavailable = true;
  else if (error === "audio_mic_ready") live.captureHealth.mic = true;
  else if (error === "audio_speaker_ready") live.captureHealth.speaker = true;
  else if (error.startsWith("audio_mic_unavailable:"))
    live.captureHealth.mic = false;
  else if (error.startsWith("audio_speaker_unavailable:"))
    live.captureHealth.speaker = false;
  else return false;
  return true;
};

export const updateLiveProgress = (
  live: LiveState,
  payload: CaptureStatusEvent,
) => {
  switch (payload.type) {
    case "audio_initializing":
      live.loadingPhase = "audio_initializing";
      if (!live.lastErrorIsAudioRelated) {
        live.lastError = null;
        live.lastErrorSessionId = null;
      }
      return;
    case "audio_ready":
      live.loadingPhase = "audio_ready";
      live.device = payload.device;
      if (
        !getCaptureWarning(live) ||
        (live.captureHealth.mic === null &&
          live.captureHealth.speaker === null &&
          !live.lastError?.startsWith("audio_storage_"))
      ) {
        live.lastError = null;
        live.lastErrorSessionId = null;
        live.lastErrorIsAudioRelated = false;
      }
      return;
    case "connecting":
      live.loadingPhase = "connecting";
      return;
    case "connected":
      live.loadingPhase = "connected";
      // A reconnect resolves a connection error; it does nothing for the audio device.
      if (!live.lastErrorIsAudioRelated) {
        live.lastError = null;
        live.lastErrorSessionId = null;
      }
      return;
    case "audio_error":
      if (updateCaptureHealth(live, payload.error)) {
        if (live.lastError?.startsWith("audio_storage_")) return;
        live.lastError = getChannelCaptureWarning(live);
        live.lastErrorSessionId = live.lastError ? payload.session_id : null;
        live.lastErrorIsAudioRelated = live.lastError !== null;
        return;
      }
      live.lastError = payload.error;
      live.lastErrorSessionId = payload.session_id;
      live.lastErrorIsAudioRelated = true;
      if (payload.is_fatal) {
        live.loading = false;
      }
      return;
    case "connection_error":
      live.loadingPhase = "idle";
      live.lastError = payload.error;
      live.lastErrorSessionId = payload.session_id;
      live.lastErrorIsAudioRelated = false;
      return;
  }
};

export const updateLiveAmplitude = (
  live: LiveState,
  mic: number,
  speaker: number,
) => {
  live.amplitude = {
    mic: Math.max(0, Math.min(1, mic / 1000)),
    speaker: Math.max(0, Math.min(1, speaker / 1000)),
  };
};

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
