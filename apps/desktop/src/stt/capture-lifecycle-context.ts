import { commands as fsSyncCommands } from "@syntheo/plugin-fs-sync";

import { getExistingAudioDurationMs } from "./capture-lifecycle-helpers";
import { clearIncompleteCapture } from "./capture-result";
import type { useRunBatch } from "./useRunBatch";

import { id } from "~/shared/utils";
import type {
  CaptureLifecycleMarker,
  InheritedCapture,
} from "~/stt/capture-lifecycle-storage";

/** Dépendances fournies par le hook `useCaptureLifecycle`. */
export type CaptureLifecycleDeps = {
  sessionId: string;
  sessionTitle: string | undefined;
  sessionRawMd: string | undefined;
  sessionUserId: string | undefined;
  connProvider: string | undefined;
  connModel: string | undefined;
  transcriptExistence: boolean | null | undefined;
  runBatchRef: { current: ReturnType<typeof useRunBatch> };
  canRunBatchRef: { current: boolean };
  setBatchTranscriptionPending: (sessionId: string, pending: boolean) => void;
  stopMeetingChatTasks: () => Promise<void>;
};

/**
 * État d'une capture : constantes calculées au démarrage et variables
 * mutables partagées par les étapes de récupération et de finalisation.
 */
export type CaptureLifecycleContext = ReturnType<typeof createCaptureContext>;

export function createCaptureContext(
  deps: CaptureLifecycleDeps,
  recoveredMarker: CaptureLifecycleMarker | undefined,
  startedAutomatically: boolean,
  pendingMarker: CaptureLifecycleMarker | undefined,
) {
  const { sessionId, transcriptExistence, setBatchTranscriptionPending } = deps;
  const inheritedCaptures: InheritedCapture[] =
    recoveredMarker?.inheritedCaptures ??
    (pendingMarker
      ? [
          ...(pendingMarker.inheritedCaptures ?? []),
          {
            transcriptId: pendingMarker.transcriptId,
            startedAt: pendingMarker.startedAt,
            createdAt: pendingMarker.createdAt,
            ownerUserId: pendingMarker.ownerUserId,
            memo: pendingMarker.memo,
            ...(pendingMarker.retainAudio !== undefined
              ? { retainAudio: pendingMarker.retainAudio }
              : {}),
            ...(pendingMarker.provider
              ? { provider: pendingMarker.provider }
              : {}),
            ...(pendingMarker.model ? { model: pendingMarker.model } : {}),
          },
        ]
      : []);
  const inheritedAudioPending = inheritedCaptures.some(
    (capture) => capture.retainAudio === false,
  );
  const clearInheritedIncomplete = async () => {
    for (const capture of inheritedCaptures)
      await clearIncompleteCapture(sessionId, capture.transcriptId);
  };
  const inheritedOnly = recoveredMarker?.inheritedOnly === true;
  const usesChunkedAudio =
    !recoveredMarker || recoveredMarker.chunkedAudio === true;
  const automatic = recoveredMarker
    ? recoveredMarker.automatic === true
    : startedAutomatically;
  const initialTitle = recoveredMarker
    ? recoveredMarker.initialTitle
    : deps.sessionTitle;
  const existingAudioPromise = recoveredMarker
    ? Promise.resolve(recoveredMarker.preserveExistingAudio ?? true)
    : automatic
      ? fsSyncCommands
          .audioExist(sessionId)
          .then((result) => (result.status === "ok" ? result.data : true))
          .catch(() => true)
      : Promise.resolve(true);
  const transcriptId = recoveredMarker?.transcriptId ?? id();
  const transcriptCreated: boolean | null = recoveredMarker ? null : false;
  const startedAt = recoveredMarker?.startedAt ?? Date.now();
  const memoMd = recoveredMarker?.memo ?? deps.sessionRawMd ?? "";
  const createdAt = recoveredMarker?.createdAt ?? new Date().toISOString();
  const preserveExistingTranscript =
    recoveredMarker?.preserveExistingTranscript ??
    transcriptExistence !== false;
  const ownerUserId = recoveredMarker?.ownerUserId ?? deps.sessionUserId ?? "";
  const provider = recoveredMarker?.provider ?? deps.connProvider;
  const model = recoveredMarker?.model ?? deps.connModel;
  // Règle audio de Syntheo : jamais de conservation, même pour un marqueur
  // de capture hérité qui la demandait.
  const retainAudio = false;
  // Persisted on the marker so restarts still run the full-file pass
  // instead of the chunks released during the meeting.
  const postStopBatch = recoveredMarker?.postStopBatch === true;
  const batchFromRetainedAudio: boolean = retainAudio && postStopBatch;
  const pendingSummaryMode: CaptureLifecycleMarker["summaryMode"] =
    recoveredMarker?.summaryMode;
  const refreshSummaryAfterRepair =
    recoveredMarker?.refreshSummaryAfterRepair ?? false;
  const capturePhase: NonNullable<CaptureLifecycleMarker["phase"]> =
    recoveredMarker?.phase ??
    (recoveredMarker?.summaryMode ? "finalizing" : "capturing");
  const existingAudioDurationPromise = recoveredMarker
    ? Promise.resolve(recoveredMarker.audioOffsetMs)
    : preserveExistingTranscript
      ? getExistingAudioDurationMs(sessionId)
      : Promise.resolve(0);

  const state = {
    recoveredMarker,
    pendingMarker,
    inheritedCaptures,
    inheritedAudioPending,
    clearInheritedIncomplete,
    automatic,
    initialTitle,
    existingAudioPromise,
    transcriptId,
    startedAt,
    memoMd,
    createdAt,
    preserveExistingTranscript,
    ownerUserId,
    provider,
    model,
    retainAudio,
    refreshSummaryAfterRepair,
    existingAudioDurationPromise,
    // Variables mutables.
    inheritedOnly,
    usesChunkedAudio,
    transcriptCreated: transcriptCreated as boolean | null,
    transcriptTouched: false as boolean,
    batchFromRetainedAudio,
    pendingSummaryMode,
    completionTracked: false as boolean,
    capturePhase,
    transcriptWriteError: undefined as unknown,
    recoveryPending: Boolean(recoveredMarker),
    recoveryStateCleared: false as boolean,
    batchTranscriptionPending: false as boolean,
    recoveryUnlisten: [] as (() => void)[],
    updateBatchTranscriptionPending: (pending: boolean) => {
      if (state.batchTranscriptionPending === pending) {
        return;
      }
      state.batchTranscriptionPending = pending;
      setBatchTranscriptionPending(sessionId, pending);
    },
  };
  return state;
}
