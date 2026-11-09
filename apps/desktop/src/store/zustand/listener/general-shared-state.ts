import type { DegradedError } from "@syntheo/plugin-transcription";

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

export const TRANSCRIPTION_STALL_AMPLITUDE_THRESHOLD = 0.05;
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

export type LiveState = GeneralState["live"];

export const initialLiveState: LiveState = {
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
