import { t } from "@lingui/core/macro";

import {
  type RecoveryAudioChunk,
  commands as transcriptionCommands,
  events as transcriptionEvents,
} from "@syntheo/plugin-transcription";
import { toast } from "@syntheo/ui/components/ui/toast";

import {
  chunkInterval,
  createCaptureAudioRecovery,
} from "./capture-audio-recovery";
import type {
  CaptureLifecycleContext,
  CaptureLifecycleDeps,
} from "./capture-lifecycle-context";
import { requestCaptureRecoverySafely } from "./capture-lifecycle-helpers";
import { createNativeTranscriptPersistence } from "./native-transcript-persistence";
import { persistTranscriptWrite } from "./persist-retry";
import { reconcileRefinedSpeakerClusters } from "./useRunBatch";

import { listenerStore } from "~/store/zustand/listener/instance";
import {
  type CaptureLifecycleMarker,
  clearCaptureLifecycleMarker,
  type InheritedCapture,
  saveCaptureLifecycleMarker,
} from "~/stt/capture-lifecycle-storage";
import {
  appendRecoveredTranscriptWords,
  getTranscriptRecord,
  createLiveTranscript,
  flushLiveTranscriptDeltasToDatabase,
  transcriptExists,
} from "~/stt/queries";

/**
 * Persistance du transcript en direct et récupération de l'audio par
 * morceaux : écoute des événements natifs, réparation des trous et marqueur
 * de reprise.
 */
export function createCaptureRecovery(
  state: CaptureLifecycleContext,
  deps: Pick<CaptureLifecycleDeps, "sessionId" | "runBatchRef">,
) {
  const { sessionId, runBatchRef } = deps;
  const {
    recoveredMarker,
    inheritedCaptures,
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
  } = state;
  const transcriptPersistence = createNativeTranscriptPersistence({
    sessionId,
    transcriptId,
    onPersisted: (status) => {
      if (status.transcript_created) state.transcriptCreated = true;
      if (status.transcript_created) state.transcriptTouched = true;
      if (status.persisted_through_ms != null)
        audioRecovery.persistedThrough(status.persisted_through_ms);
      if (!transcriptPersistence.hasPendingFailure())
        state.transcriptWriteError = undefined;
    },
    onError: (error) => {
      state.transcriptWriteError = error;
      audioRecovery.persistenceFailed();
      toast.error(t`Your transcript could not be saved`, {
        id: `transcript-storage-${sessionId}`,
        description: t`Free up disk space. Syntheo will try to recover the missing text while this meeting is still recording.`,
      });
      console.error("[listener] failed to persist transcript", error);
    },
    afterFlush: () =>
      persistTranscriptWrite(() =>
        flushLiveTranscriptDeltasToDatabase(transcriptId),
      ),
  });
  const earliestStartedAt = Math.min(
    startedAt,
    ...inheritedCaptures.map((capture) => capture.startedAt),
  );
  const inheritedCaptureFor = (chunk: RecoveryAudioChunk) => {
    if (chunk.capture_started_at >= startedAt - 5_000) return undefined;
    return inheritedCaptures
      .filter(
        (capture) => chunk.capture_started_at >= capture.startedAt - 5_000,
      )
      .reduce<InheritedCapture | undefined>(
        (latest, capture) =>
          !latest || capture.startedAt > latest.startedAt ? capture : latest,
        undefined,
      );
  };
  const listRecoveryChunks = async () => {
    const result =
      await transcriptionCommands.listCaptureAudioChunks(sessionId);
    if (result.status === "error") throw new Error(result.error);
    return result.data.filter(
      (chunk) => chunk.capture_started_at >= earliestStartedAt - 5_000,
    );
  };
  const toCaptureInterruptions = (
    intervals: { start: number; end: number }[] | undefined,
  ) =>
    (intervals ?? []).map((interval) => ({
      startedAt: startedAt + interval.start,
      endedAt: startedAt + interval.end,
    }));
  const audioRecovery = createCaptureAudioRecovery({
    startedAt,
    list: listRecoveryChunks,
    inherited: (chunk) => inheritedCaptureFor(chunk) !== undefined,
    acknowledge: async (chunk) => {
      const result = await transcriptionCommands.acknowledgeCaptureAudioChunk(
        sessionId,
        chunk.id,
      );
      if (result.status === "error") throw new Error(result.error);
    },
    flush: async () => {
      await transcriptPersistence.flush();
      if (transcriptPersistence.hasPendingFailure())
        audioRecovery.persistenceFailed();
      else state.transcriptWriteError = undefined;
    },
    repair: async (chunk, requestedIntervals, signal) => {
      const inherited = inheritedCaptureFor(chunk);
      const target = inherited ?? {
        transcriptId,
        startedAt,
        createdAt,
        ownerUserId,
        memo: memoMd,
        provider,
        model,
      };
      const intervals = inherited
        ? [chunkInterval(chunk, target.startedAt)]
        : requestedIntervals;
      const beforeRepair = await getTranscriptRecord(target.transcriptId);
      const audioOffset =
        chunk.capture_started_at - target.startedAt + chunk.audio_start_ms;
      try {
        await runBatchRef.current(chunk.path, {
          signal,
          // Issue 515 : un modèle temps réel seul rejoue le morceau dans son
          // flux (issue 463) ; sans cela, l'audio d'une pause restait en
          // échec et la reprise suivante en héritait.
          allowRealtimeStream: true,
          deferAudioFinalization: true,
          notifyOnCompletion: false,
          recovery: {
            persist: async (words, hints) => {
              await transcriptPersistence.flush();
              signal.throwIfAborted();
              if (transcriptPersistence.hasPendingFailure())
                throw new Error("Waiting for transcript storage to recover");
              if (!words.length) return;
              const created = inherited
                ? await transcriptExists(target.transcriptId)
                : (state.transcriptCreated ||=
                    await transcriptExists(transcriptId));
              if (!created) {
                await createLiveTranscript(
                  {
                    id: target.transcriptId,
                    sessionId,
                    ownerUserId: target.ownerUserId,
                    createdAt: target.createdAt,
                    startedAt: target.startedAt,
                    memo: target.memo,
                    source: "live_capture",
                    provider: target.provider ?? undefined,
                    model: target.model ?? undefined,
                  },
                  { new_words: [], replaced_ids: [], partials: [] },
                );
                if (!inherited) state.transcriptCreated = true;
              }
              const shifted = words.map((word) => ({
                ...word,
                start_ms: Number(word.start_ms) + audioOffset,
                end_ms: Number(word.end_ms) + audioOffset,
              }));
              const reconciledHints = beforeRepair
                ? await reconcileRefinedSpeakerClusters(
                    beforeRepair,
                    shifted,
                    hints,
                  )
                : hints;
              await persistTranscriptWrite(() =>
                appendRecoveredTranscriptWords(
                  target.transcriptId,
                  shifted,
                  reconciledHints,
                  intervals,
                  beforeRepair?.words ?? [],
                ),
              );
              if (!inherited) state.transcriptTouched = true;
            },
          },
        });
      } finally {
        listenerStore.getState().clearBatchSession(`${sessionId}:recovery`);
      }
    },
  });
  const restoreAudioRecovery = async () => {
    const result = await transcriptionCommands
      .getCaptureAudioGaps(sessionId)
      .catch((error) => {
        console.warn("[listener] failed to restore capture audio gaps", error);
        audioRecovery.recoverPending();
        return undefined;
      });
    if (!result) return;
    if (result.status === "error") {
      console.warn(
        "[listener] failed to restore capture audio gaps",
        result.error,
      );
      audioRecovery.recoverPending();
      return;
    }
    const ledger = result.data;
    const maxNativeStartDelayMs = 60_000;
    if (
      !ledger ||
      ledger.capture_started_at_ms < startedAt - 5_000 ||
      ledger.capture_started_at_ms > startedAt + maxNativeStartDelayMs
    ) {
      audioRecovery.recoverPending();
      return;
    }
    audioRecovery.restore({
      gaps: ledger.gaps.map((gap) => ({
        start: gap.start_ms - startedAt,
        end: gap.end_ms - startedAt,
      })),
      ...(ledger.open_gap_started_at_ms == null
        ? {}
        : { openGapStart: ledger.open_gap_started_at_ms - startedAt }),
      awaitingConnection: ledger.awaiting_connection,
      storageFailed: ledger.storage_failed,
      ...(ledger.confirmed_through_ms == null
        ? {}
        : { confirmedThrough: ledger.confirmed_through_ms }),
    });
  };
  let recoveryListening: Promise<void> | undefined;
  const startAudioRecovery = () =>
    (recoveryListening ??= Promise.all([
      transcriptionEvents.captureLifecycleEvent.listen(({ payload }) => {
        if (payload.session_id !== sessionId) return;
        if (payload.type === "started") {
          if (payload.live_transcription_active) audioRecovery.connected();
          else if (state.batchFromRetainedAudio) audioRecovery.batchOnly(true);
          else if (!payload.requested_live_transcription) {
            state.batchFromRetainedAudio = retainAudio;
            audioRecovery.batchOnly(retainAudio);
          } else audioRecovery.interrupted();
        }
      }),
      transcriptionEvents.captureStatusEvent.listen(({ payload }) => {
        if (payload.session_id !== sessionId) return;
        if (payload.type === "connected")
          audioRecovery.connected(payload.gap_replayed);
        else if (payload.type === "connection_error")
          audioRecovery.interrupted();
        else if (
          payload.type === "audio_error" &&
          payload.error.startsWith("audio_storage_")
        )
          audioRecovery.storageFailed();
      }),
    ]).then(async (unlisten) => {
      state.recoveryUnlisten = unlisten;
      audioRecovery.start();
      if (
        recoveredMarker &&
        !state.batchFromRetainedAudio &&
        !state.inheritedOnly
      )
        await restoreAudioRecovery();
      if (state.batchFromRetainedAudio || state.inheritedOnly)
        audioRecovery.batchOnly(true);
    }));
  const stopAudioRecovery = async () => {
    await recoveryListening;
    state.recoveryUnlisten.forEach((unlisten) => unlisten());
    state.recoveryUnlisten = [];
    const recovery = await audioRecovery.stop().catch((error) => {
      console.error("[listener] audio recovery did not finish", error);
      return {
        incomplete: true,
        interruptions: audioRecovery.interruptions(),
      };
    });
    if (retainAudio || recovery.incomplete) return recovery;
    const result =
      await transcriptionCommands.deleteTranscribedCaptureAudio(sessionId);
    if (result.status === "error") throw new Error(result.error);
    return {
      incomplete: !result.data,
      interruptions: recovery.interruptions,
    };
  };
  // Without the full recording, the chunks are the only audio left to
  // transcribe, so they must be repaired instead of released.
  const repairChunksWithoutRecording = async (audioPath: string | null) => {
    await recoveryListening;
    if (!state.batchFromRetainedAudio || audioPath) return;
    state.batchFromRetainedAudio = false;
    audioRecovery.batchOnly(false);
    audioRecovery.recoverPending();
  };
  const marker = async (): Promise<CaptureLifecycleMarker> => ({
    version: 1,
    chunkedAudio: state.usesChunkedAudio,
    retainAudio,
    ...(state.batchFromRetainedAudio ? { postStopBatch: true } : {}),
    phase: state.capturePhase,
    sessionId,
    transcriptId,
    startedAt,
    createdAt,
    audioOffsetMs: await existingAudioDurationPromise,
    preserveExistingTranscript,
    automatic,
    preserveExistingAudio: await existingAudioPromise,
    initialTitle,
    ownerUserId,
    memo: memoMd,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(state.pendingSummaryMode
      ? { summaryMode: state.pendingSummaryMode }
      : {}),
    ...(refreshSummaryAfterRepair ? { refreshSummaryAfterRepair: true } : {}),
    ...(inheritedCaptures.length > 0 ? { inheritedCaptures } : {}),
    ...(state.inheritedOnly ? { inheritedOnly: true } : {}),
  });
  const releaseMarker = async () => {
    const inheritedAudioRemains =
      inheritedCaptures.length > 0 &&
      (await listRecoveryChunks().then(
        (chunks) =>
          chunks.some((chunk) => inheritedCaptureFor(chunk) !== undefined),
        () => true,
      ));
    if (!inheritedAudioRemains) {
      await clearCaptureLifecycleMarker(sessionId, transcriptId);
      return;
    }
    state.inheritedOnly = true;
    state.capturePhase = "finalizing";
    await saveCaptureLifecycleMarker(await marker());
    await requestCaptureRecoverySafely(sessionId);
  };

  return {
    transcriptPersistence,
    audioRecovery,
    inheritedCaptureFor,
    listRecoveryChunks,
    toCaptureInterruptions,
    restoreAudioRecovery,
    startAudioRecovery,
    stopAudioRecovery,
    repairChunksWithoutRecording,
    marker,
    releaseMarker,
  };
}
