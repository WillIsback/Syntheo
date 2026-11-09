import { t } from "@lingui/core/macro";

import { toast } from "@syntheo/ui/components/ui/toast";

import {
  completeCaptureTranscript,
  loadCaptureStop,
} from "./capture-completion";
import type {
  CaptureLifecycleContext,
  CaptureLifecycleDeps,
} from "./capture-lifecycle-context";
import {
  getAudioDurationMs,
  getPostCaptureAction,
  getPostCaptureRepairReasons,
  recordCaptureStop,
  requestCaptureRecoverySafely,
  sessionWasDeleted,
} from "./capture-lifecycle-helpers";
import type { createCaptureRecovery } from "./capture-lifecycle-recovery";
import { discardEmptyAutomaticCapture } from "./empty-automatic-capture";
import { cancelMeetingRecordingDisclosure } from "./meeting-disclosure";
import {
  deferPausedSummary,
  strongerSummaryMode,
  takePausedSummary,
} from "./pause-listening";
import { persistTranscriptWrite } from "./persist-retry";
import {
  isStoppedTranscriptionError,
  isTerminalTranscriptionError,
} from "./useRunBatch";

import { requestMainAutoEnhance } from "~/ai/task-window-sync";
import { deleteProcessedAudioForRetention } from "~/services/audio-retention";
import { getEnhancerService } from "~/services/enhancer";
import {
  catalogLocalSessionAudio,
  markSessionAudioTranscriptionComplete,
} from "~/session/attachments";
import { enqueueSessionAudioOperation } from "~/session/audio-operations";
import { flushCanonicalSessionEditorChanges } from "~/session/editor-activity";
import { playCompletionSound } from "~/shared/completion-sound";
import type { OnStoppedCallback } from "~/store/zustand/listener/transcript";
import {
  clearCaptureLifecycleMarker,
  saveCaptureLifecycleMarker,
} from "~/stt/capture-lifecycle-storage";
import { transcriptExists } from "~/stt/queries";
import { waitForSessionSearchIndex } from "~/stt/search-index-consistency";

/**
 * Finalisation d'une capture arrêtée : réparation du transcript par lot,
 * planification de la synthèse et libération du marqueur de reprise.
 */
export function createFinalizeStoppedInner(
  state: CaptureLifecycleContext,
  deps: Pick<
    CaptureLifecycleDeps,
    "sessionId" | "runBatchRef" | "canRunBatchRef" | "stopMeetingChatTasks"
  >,
  recovery: Pick<
    ReturnType<typeof createCaptureRecovery>,
    "transcriptPersistence" | "marker" | "releaseMarker"
  >,
) {
  const { sessionId, runBatchRef, canRunBatchRef, stopMeetingChatTasks } = deps;
  const { transcriptPersistence, marker, releaseMarker } = recovery;
  const {
    recoveredMarker,
    inheritedCaptures,
    automatic,
    initialTitle,
    existingAudioPromise,
    transcriptId,
    startedAt,
    preserveExistingTranscript,
    retainAudio,
    refreshSummaryAfterRepair,
    existingAudioDurationPromise,
  } = state;
  const finalizeStoppedInner = async (
    details: Parameters<OnStoppedCallback>[1],
    requestRecoveryOnFailure: boolean,
  ) => {
    const stoppedAtMs = await recordCaptureStop(
      sessionId,
      transcriptId,
      details.stoppedAtMs,
    );
    toast.dismiss("recording-without-transcription");
    toast.dismiss("recording-with-limited-transcription-languages");
    toast.dismiss("live-transcription-stalled");
    toast.dismiss("meeting-disclosure-send-failed");
    const notifyFailure = async (message: string, id: string) => {
      if (requestRecoveryOnFailure && !(await sessionWasDeleted(sessionId))) {
        toast.error(message, { id });
      }
    };
    const requestRecovery = async () => {
      state.recoveryPending = true;
      if (await sessionWasDeleted(sessionId)) {
        try {
          await persistTranscriptWrite(() =>
            clearCaptureLifecycleMarker(sessionId, transcriptId),
          );
          state.recoveryPending = false;
          state.recoveryStateCleared = true;
        } catch (error) {
          console.error(
            "[listener] failed to clear deleted session capture state",
            error,
          );
          if (requestRecoveryOnFailure) {
            await requestCaptureRecoverySafely(sessionId);
          }
        }
        return;
      }
      if (requestRecoveryOnFailure) {
        await requestCaptureRecoverySafely(sessionId);
      }
    };
    const finishCaptureSyncDeferral = async (): Promise<boolean> => {
      if (state.capturePhase !== "finalizing") {
        state.capturePhase = "finalizing";
        try {
          await persistTranscriptWrite(async () => {
            await saveCaptureLifecycleMarker(await marker());
          });
        } catch (error) {
          console.error(
            "[listener] failed to finalize capture recovery state",
            error,
          );
          await requestRecovery();
          return false;
        }
      }
      return true;
    };
    cancelMeetingRecordingDisclosure(sessionId);
    await stopMeetingChatTasks();
    await transcriptPersistence.flush();
    if (
      details.audioPath &&
      (await discardEmptyAutomaticCapture({
        sessionId,
        automatic,
        preserveExistingAudio: await existingAudioPromise,
        preserveExistingTranscript,
        initialTitle: initialTitle ?? undefined,
        transcriptTouched: state.transcriptTouched,
        transcriptionComplete:
          (!details.requestedLiveTranscription ||
            details.liveTranscriptionActive) &&
          !details.needsBatchRepair &&
          !state.transcriptWriteError,
      }))
    ) {
      await releaseMarker();
      state.recoveryPending = false;
      state.recoveryStateCleared = true;
      return;
    }
    trackSessionCompletion(
      details,
      recoveredMarker ? "recovered_capture_stopped" : "capture_stopped",
    );
    if (details.audioPath) {
      try {
        await enqueueSessionAudioOperation(sessionId, () =>
          catalogLocalSessionAudio(sessionId),
        );
      } catch (error) {
        console.error("[listener] failed to catalog recorded audio", error);
      }
    }
    state.transcriptCreated ??= await transcriptExists(transcriptId);
    if (state.transcriptCreated) {
      try {
        await waitForSessionSearchIndex(sessionId);
      } catch (error) {
        console.warn(
          "[listener] search index finalization is still pending",
          error,
        );
      }
    }

    const postCaptureAction = state.pendingSummaryMode
      ? ("enhance_only" as const)
      : getPostCaptureAction(
          {
            ...details,
            transcriptWriteFailed: Boolean(state.transcriptWriteError),
          },
          canRunBatchRef.current &&
            (!state.usesChunkedAudio || state.batchFromRetainedAudio),
        );
    const repairReasons = state.pendingSummaryMode
      ? []
      : getPostCaptureRepairReasons({
          ...details,
          transcriptWriteFailed: Boolean(state.transcriptWriteError),
        });

    let batchCompleted = false;
    if (postCaptureAction === "batch_then_enhance") {
      state.updateBatchTranscriptionPending(true);
      console.info("[listener] starting post-stop transcript repair", {
        sessionId,
        reasons: repairReasons,
      });
      try {
        const existingAudioDurationMs = await existingAudioDurationPromise;
        const finalAudioDurationMs = preserveExistingTranscript
          ? await getAudioDurationMs(details.audioPath!)
          : null;
        const audioOffsetMs =
          existingAudioDurationMs > 0 &&
          finalAudioDurationMs !== null &&
          finalAudioDurationMs + 1_000 >= existingAudioDurationMs
            ? Math.min(existingAudioDurationMs, finalAudioDurationMs)
            : 0;
        await runBatchRef.current(details.audioPath!, {
          deferAudioFinalization: true,
          ...(stoppedAtMs !== null
            ? { captureInterval: { startedAtMs: startedAt, stoppedAtMs } }
            : {}),
          notifyOnCompletion: !details.liveTranscriptionActive,
          promotion:
            preserveExistingTranscript || state.transcriptCreated
              ? {
                  scope: "current_capture",
                  audioOffsetMs,
                  ...(state.transcriptCreated
                    ? { replaceTranscriptId: transcriptId }
                    : {}),
                  startedAt,
                }
              : { scope: "whole_session" },
        });
        batchCompleted = true;
        console.info("[listener] completed post-stop transcript repair", {
          sessionId,
          reasons: repairReasons,
        });
      } catch (error) {
        if (isStoppedTranscriptionError(error)) {
          await persistTranscriptWrite(() =>
            clearCaptureLifecycleMarker(sessionId, transcriptId),
          );
          state.recoveryPending = false;
          state.recoveryStateCleared = true;
          return;
        }
        console.error("[listener] post-stop transcript repair failed", {
          sessionId,
          reasons: repairReasons,
          error,
        });
        if (state.transcriptWriteError || !details.liveTranscriptionActive) {
          await notifyFailure(
            t`Syntheo could not finish saving the transcript. The recording was kept so you can try again.`,
            "post-capture-transcript-incomplete",
          );
        } else {
          await notifyFailure(
            t`Post-meeting transcription failed. The recording was kept so you can try again.`,
            "post-capture-batch-failed",
          );
        }
        if (isTerminalTranscriptionError(error)) {
          try {
            await clearCaptureLifecycleMarker(sessionId, transcriptId);
            state.recoveryPending = false;
            state.recoveryStateCleared = true;
          } catch (clearError) {
            console.error(
              "[listener] failed to stop automatic capture recovery",
              clearError,
            );
            await requestRecovery();
          }
          return;
        }
        await requestRecovery();
        return;
      }
    }

    if (
      state.transcriptWriteError &&
      postCaptureAction !== "batch_then_enhance"
    ) {
      await notifyFailure(
        details.audioPath
          ? t`Syntheo could not finish saving the transcript. The recording was kept so you can try again.`
          : t`Syntheo could not save part of the live transcript.`,
        details.audioPath
          ? "post-capture-transcript-incomplete"
          : "live-transcript-persist-failed",
      );
    }

    const emptyFreshCapture =
      !recoveredMarker &&
      !details.audioPath &&
      !(state.usesChunkedAudio && details.needsBatchRepair) &&
      !state.transcriptTouched &&
      !state.transcriptWriteError;
    const transcriptIsComplete =
      Boolean(state.pendingSummaryMode) ||
      batchCompleted ||
      postCaptureAction === "enhance_only" ||
      emptyFreshCapture;
    if (!transcriptIsComplete) {
      await requestRecovery();
      return;
    }
    if (!(await finishCaptureSyncDeferral())) {
      return;
    }

    // Une pause (issue 353) n'est pas la fin de la réunion : ni son de fin,
    // ni synthèse ; le transcript de la capture est enregistré normalement.
    const paused = details.paused === true;
    // Batch repair already plays the sound when runBatchSession
    // finishes; a recovered summary-only pass has no new transcript.
    if (
      !paused &&
      !batchCompleted &&
      !state.pendingSummaryMode &&
      (state.transcriptTouched || preserveExistingTranscript)
    ) {
      void playCompletionSound();
    }

    try {
      await flushCanonicalSessionEditorChanges(sessionId);
    } catch (error) {
      console.error(
        "[listener] failed to flush session notes before completing capture",
        error,
      );
      await requestRecovery();
      return;
    }

    const hasTranscriptEvidence =
      Boolean(state.pendingSummaryMode) ||
      preserveExistingTranscript ||
      state.transcriptTouched ||
      batchCompleted;
    if (stoppedAtMs !== null && hasTranscriptEvidence) {
      await persistTranscriptWrite(() =>
        completeCaptureTranscript(sessionId, transcriptId, stoppedAtMs),
      );
    }
    if (!details.needsBatchRepair) {
      for (const capture of inheritedCaptures) {
        const inheritedStoppedAtMs = await loadCaptureStop(
          sessionId,
          capture.transcriptId,
        );
        if (inheritedStoppedAtMs !== null) {
          await completeCaptureTranscript(
            sessionId,
            capture.transcriptId,
            inheritedStoppedAtMs,
          );
        }
      }
    }
    // Synthèse gardée par les captures mises en pause de cette réunion.
    const pausedSummaryMode = paused ? undefined : takePausedSummary(sessionId);
    const shouldEnhance =
      (hasTranscriptEvidence &&
        (transcriptIsComplete ||
          (postCaptureAction === "none" &&
            preserveExistingTranscript &&
            !state.transcriptWriteError))) ||
      pausedSummaryMode !== undefined;
    const captureSummaryMode =
      refreshSummaryAfterRepair ||
      (preserveExistingTranscript &&
        (state.transcriptTouched || batchCompleted))
        ? ("regenerate" as const)
        : batchCompleted
          ? ("refresh" as const)
          : ("if_empty" as const);

    let summaryScheduled = true;
    if (shouldEnhance && paused) {
      // Rien n'est écrit dans le marqueur : quitter l'application pendant
      // la pause termine la session sans synthèse.
      deferPausedSummary(sessionId, captureSummaryMode);
    } else if (shouldEnhance) {
      const summaryMode =
        state.pendingSummaryMode ??
        strongerSummaryMode(captureSummaryMode, pausedSummaryMode);
      if (!state.pendingSummaryMode) {
        state.pendingSummaryMode = summaryMode;
        try {
          await persistTranscriptWrite(async () => {
            await saveCaptureLifecycleMarker(await marker());
          });
        } catch (error) {
          state.pendingSummaryMode = undefined;
          console.error(
            "[listener] failed to persist summary recovery state",
            error,
          );
          await notifyFailure(
            t`The transcript was saved, but Syntheo could not start the summary. Try generating it again.`,
            "post-capture-summary-failed",
          );
          await requestRecovery();
          return;
        }
      }
      try {
        const service = getEnhancerService();
        if (!service) {
          await requestMainAutoEnhance(sessionId, summaryMode);
        } else {
          await service.requestAutoEnhance(sessionId, summaryMode);
        }
      } catch (error) {
        summaryScheduled = false;
        console.error("[listener] failed to schedule summary", error);
        await notifyFailure(
          t`The transcript was saved, but Syntheo could not start the summary. Try generating it again.`,
          "post-capture-summary-failed",
        );
      }
    }

    const recoveryComplete =
      !retainAudio ||
      (!details.audioPath && !state.transcriptWriteError) ||
      (transcriptIsComplete && summaryScheduled);
    if (!recoveryComplete) {
      await requestRecovery();
      return;
    }

    try {
      if (details.audioPath && transcriptIsComplete) {
        await persistTranscriptWrite(() =>
          markSessionAudioTranscriptionComplete(sessionId),
        );
      }
      await releaseMarker();
      state.recoveryPending = false;
      state.recoveryStateCleared = true;
      if (hasTranscriptEvidence && !batchCompleted) {
      }
    } catch (error) {
      await requestRecovery();
      throw error;
    }

    // Native capture cleanup and the retention sweep enforce deletion even
    // when legacy post-capture processing cannot finish.
    if (
      (postCaptureAction !== "batch_then_enhance" || batchCompleted) &&
      !state.transcriptWriteError
    ) {
      await deleteProcessedAudioForRetention("none", sessionId);
    }
  };
  const trackSessionCompletion = (
    _details: Parameters<OnStoppedCallback>[1],
    _completionReason: "capture_stopped" | "recovered_capture_stopped",
  ) => {
    if (!state.completionTracked) {
      state.completionTracked = true;
    }
  };

  return finalizeStoppedInner;
}
