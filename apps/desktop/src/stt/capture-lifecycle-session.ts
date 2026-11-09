import { t } from "@lingui/core/macro";

import type { LiveTranscriptTarget } from "@syntheo/plugin-transcription";
import { toast } from "@syntheo/ui/components/ui/toast";

import {
  completeCaptureTranscript,
  loadCaptureStop,
} from "./capture-completion";
import {
  type CaptureLifecycleDeps,
  createCaptureContext,
} from "./capture-lifecycle-context";
import { createFinalizeStoppedInner } from "./capture-lifecycle-finalize";
import { requestCaptureRecoverySafely } from "./capture-lifecycle-helpers";
import { createCaptureRecovery } from "./capture-lifecycle-recovery";
import {
  saveIncompleteCapture,
  clearIncompleteCapture,
} from "./capture-result";
import { persistTranscriptWrite } from "./persist-retry";

import { requestMainAutoEnhance } from "~/ai/task-window-sync";
import { getEnhancerService } from "~/services/enhancer";
import type {
  LiveTranscriptPersistCallback,
  OnStoppedCallback,
} from "~/store/zustand/listener/transcript";
import {
  type CaptureLifecycleMarker,
  clearCaptureLifecycleMarker,
  saveCaptureLifecycleMarker,
} from "~/stt/capture-lifecycle-storage";
import { softDeleteTranscript } from "~/stt/queries";

/**
 * Construit le cycle de vie d'une capture : arrêt, reprise après
 * redémarrage, persistance du marqueur et nettoyage d'un démarrage raté.
 */
export function createCaptureLifecycleSession(
  deps: CaptureLifecycleDeps,
  recoveredMarker: CaptureLifecycleMarker | undefined,
  startedAutomatically: boolean,
  pendingMarker: CaptureLifecycleMarker | undefined,
) {
  const { sessionId, canRunBatchRef } = deps;
  const state = createCaptureContext(
    deps,
    recoveredMarker,
    startedAutomatically,
    pendingMarker,
  );
  const {
    inheritedCaptures,
    inheritedAudioPending,
    clearInheritedIncomplete,
    existingAudioPromise,
    transcriptId,
    startedAt,
    memoMd,
    createdAt,
    ownerUserId,
    provider,
    model,
    retainAudio,
    existingAudioDurationPromise,
  } = state;
  const recovery = createCaptureRecovery(state, deps);
  const {
    transcriptPersistence,
    audioRecovery,
    toCaptureInterruptions,
    restoreAudioRecovery,
    startAudioRecovery,
    stopAudioRecovery,
    repairChunksWithoutRecording,
    marker,
  } = recovery;
  const finalizeStoppedInner = createFinalizeStoppedInner(
    state,
    deps,
    recovery,
  );
  const finalizeStopped = async (
    details: Parameters<OnStoppedCallback>[1],
    requestRecoveryOnFailure: boolean,
  ) => {
    try {
      await finalizeStoppedInner(details, requestRecoveryOnFailure);
    } catch (error) {
      if (!state.recoveryStateCleared && !state.recoveryPending) {
        state.recoveryPending = true;
        if (requestRecoveryOnFailure) {
          await requestCaptureRecoverySafely(sessionId);
        }
      }
      throw error;
    } finally {
      if (!transcriptPersistence.hasPendingFailure())
        transcriptPersistence.dispose();
      state.updateBatchTranscriptionPending(false);
    }
  };

  const onStopped: OnStoppedCallback = async (_sessionId, details) => {
    state.usesChunkedAudio = details.chunkedAudio === true;
    if (state.usesChunkedAudio) {
      await transcriptPersistence.flush();
      if (transcriptPersistence.hasPendingFailure())
        audioRecovery.persistenceFailed();
      // The native stop is authoritative for whether live STT ran.
      state.batchFromRetainedAudio =
        retainAudio && details.requestedLiveTranscription === false;
      await repairChunksWithoutRecording(details.audioPath);
      const recovery = await stopAudioRecovery().catch((error) => {
        console.error("[listener] failed to delete transcribed audio", error);
        details = { ...details, audioDeletionFailed: true };
        return { incomplete: false, interruptions: [] };
      });
      details = {
        ...details,
        needsBatchRepair: recovery.incomplete,
        liveTranscriptionActive:
          !recovery.incomplete && !state.batchFromRetainedAudio,
      };
      // Aucun audio conservé : rien n'est gardé « pour finir le transcript ».
      const audioKeptForTranscription =
        recovery.incomplete && retainAudio && inheritedAudioPending;
      if (!recovery.incomplete)
        await clearInheritedIncomplete().catch((error) =>
          console.error(
            "[listener] failed to clear earlier capture status",
            error,
          ),
        );
      if (
        recovery.incomplete ||
        details.audioDeletionFailed ||
        (recovery.interruptions?.length ?? 0) > 0
      ) {
        await saveIncompleteCapture(
          sessionId,
          transcriptId,
          false,
          details.audioDeletionFailed ?? false,
          audioKeptForTranscription,
          toCaptureInterruptions(recovery.interruptions),
        ).catch((error) =>
          console.error(
            "[listener] failed to save incomplete capture status",
            error,
          ),
        );
      }
      if (details.audioDeletionFailed) {
        toast.error(t`Audio could not be deleted`, {
          id: `audio-deletion-${sessionId}`,
          duration: Infinity,
          description: t`Syntheo could not remove the temporary audio. Cleanup will be retried automatically.`,
        });
      }
    } else {
      audioRecovery.cancel();
      state.recoveryUnlisten.forEach((unlisten) => unlisten());
    }
    if (!retainAudio) details = { ...details, audioPath: null };
    state.recoveryPending = false;
    markExpectedPostStopBatch(details);
    return finalizeStopped(details, true);
  };
  const markExpectedPostStopBatch = (
    details: Parameters<OnStoppedCallback>[1],
  ) => {
    if (
      (!state.usesChunkedAudio || state.batchFromRetainedAudio) &&
      !state.pendingSummaryMode &&
      details.audioPath &&
      canRunBatchRef.current &&
      (!details.liveTranscriptionActive || details.needsBatchRepair)
    ) {
      state.updateBatchTranscriptionPending(true);
    }
  };
  const recoverStopped: OnStoppedCallback = async (_sessionId, details) => {
    if (state.inheritedOnly) {
      audioRecovery.batchOnly(true);
      const recovery = await stopAudioRecovery();
      if (recovery.incomplete)
        throw new Error("earlier capture audio is still pending");
      for (const capture of inheritedCaptures) {
        const stoppedAtMs = await loadCaptureStop(
          sessionId,
          capture.transcriptId,
        );
        if (stoppedAtMs !== null) {
          await completeCaptureTranscript(
            sessionId,
            capture.transcriptId,
            stoppedAtMs,
          );
        }
      }
      await clearIncompleteCapture(sessionId, transcriptId);
      await clearInheritedIncomplete();
      toast.dismiss(`capture-incomplete-${sessionId}`);
      const service = getEnhancerService();
      if (!service) await requestMainAutoEnhance(sessionId, "regenerate");
      else await service.requestAutoEnhance(sessionId, "regenerate");
      await clearCaptureLifecycleMarker(sessionId, transcriptId);
      return;
    }
    let recoveredInterruptions: { start: number; end: number }[] = [];
    if (state.usesChunkedAudio) {
      await repairChunksWithoutRecording(details.audioPath);
      if (!state.batchFromRetainedAudio) await restoreAudioRecovery();
      const recovery = await stopAudioRecovery();
      recoveredInterruptions = recovery.interruptions ?? [];
      details = {
        ...details,
        needsBatchRepair: recovery.incomplete,
        liveTranscriptionActive:
          !recovery.incomplete && !state.batchFromRetainedAudio,
        ...(!retainAudio ? { audioPath: null } : {}),
      };
    }
    if (
      state.usesChunkedAudio &&
      !details.needsBatchRepair &&
      recoveredInterruptions.length === 0
    ) {
      await clearIncompleteCapture(sessionId, transcriptId);
      await clearInheritedIncomplete();
      toast.dismiss(`capture-incomplete-${sessionId}`);
    } else if (state.usesChunkedAudio)
      await saveIncompleteCapture(
        sessionId,
        transcriptId,
        false,
        false,
        false,
        toCaptureInterruptions(recoveredInterruptions),
      );
    markExpectedPostStopBatch(details);
    return finalizeStopped(details, false);
  };

  const handlePersist: LiveTranscriptPersistCallback = (delta) => {
    if (delta.new_words.length === 0 && delta.replaced_ids.length === 0) {
      return;
    }

    state.transcriptTouched = true;
  };

  return {
    handlePersist,
    liveTranscript: {
      transcript_id: transcriptId,
      owner_user_id: ownerUserId,
      created_at: createdAt,
      started_at_ms: startedAt,
      memo: memoMd,
      provider: provider ?? null,
      model: model ?? null,
    } satisfies LiveTranscriptTarget,
    onStopped,
    recoverStopped,
    ready: Promise.all([
      existingAudioDurationPromise,
      existingAudioPromise,
    ]).then(() => undefined),
    startAudioRecovery,
    persistMarker: async (options?: { postStopBatch?: boolean }) => {
      if (options?.postStopBatch && retainAudio) {
        state.batchFromRetainedAudio = true;
      }
      await startAudioRecovery();
      await persistTranscriptWrite(async () => {
        const next = await marker();
        await (pendingMarker
          ? saveCaptureLifecycleMarker(next, pendingMarker.transcriptId)
          : saveCaptureLifecycleMarker(next));
      });
    },
    cleanupFailedStart: async () => {
      audioRecovery.cancel();
      state.recoveryUnlisten.forEach((unlisten) => unlisten());
      await transcriptPersistence.flush();
      transcriptPersistence.dispose();
      if (pendingMarker)
        await saveCaptureLifecycleMarker(pendingMarker, transcriptId);
      else await clearCaptureLifecycleMarker(sessionId, transcriptId);
      if (state.transcriptCreated) {
        await softDeleteTranscript(transcriptId);
      }
    },
  };
}
