import { t } from "@lingui/core/macro";
import type { StoreApi } from "zustand";

import { commands as iconCommands } from "@syntheo/plugin-icon";
import {
  commands as listenerCommands,
  type LiveTranscriptDelta,
  type LiveTranscriptSegmentDelta,
} from "@syntheo/plugin-transcription";
import { toast } from "@syntheo/ui/components/ui/toast";

import {
  type EventListeners,
  type LiveStore,
  clearLiveEventUnlisteners,
  clearLiveInterval,
  createLiveSecondsInterval,
  createSessionTranscriptBatcher,
  dispatchMeetingCompleted,
  notifyCaptureWarning,
  openMicrophoneSettings,
} from "./general-live-helpers";
import {
  markLiveActive,
  markLiveFinalizing,
  markLiveInactive,
  noteLiveTranscriptActivity,
  releaseLiveCaptureGeneration,
  setLiveState,
  updateLiveAmplitude,
  updateLiveProgress,
} from "./general-shared";
import { flushLiveTranscriptBatches } from "./live-transcript-batch";
import { notifyMicFallback } from "./mic-fallback";

import {
  startSpeakerContextCapture,
  observeSpeakerMicrophone,
  stopSpeakerContextCapture,
} from "~/stt/speaker-context-capture";

export const createSessionEventHandlers = <T extends LiveStore>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
  targetSessionId: string,
  // Retourne `true` quand le delta est pris en charge ailleurs (tampon
  // d'`attachLiveSession` avant l'instantané natif).
  interceptSegmentDelta?: (delta: LiveTranscriptSegmentDelta) => boolean,
  requestedMic: string | null = null,
  batcher = createSessionTranscriptBatcher(get, targetSessionId),
): EventListeners => ({
  dispose: batcher.dispose,
  lifecycle: (payload) => {
    if (payload.session_id !== targetSessionId) {
      return;
    }

    // Tout changement d'état de la capture (démarrage, finalisation, arrêt)
    // s'appuie sur la transcription complète : aucun mot ne reste en attente.
    flushLiveTranscriptBatches();

    if (payload.type === "stopped")
      toast.dismiss(`audio-capture-${targetSessionId}`);
    if (payload.type === "started") {
      startSpeakerContextCapture(targetSessionId);
      const currentLive = get().live;

      if (currentLive.status === "active" && currentLive.intervalId) {
        // Le supervisor Rust a rouvert le flux STT tout seul : c'est un
        // nouveau flux, la transcription reprend sans action de
        // l'utilisateur et le chien de garde repart de zéro.
        const reconnected =
          payload.live_transcription_active &&
          !payload.degraded &&
          (currentLive.degraded !== null ||
            currentLive.liveTranscriptionActive === false ||
            currentLive.transcriptionStalled);
        setLiveState(set, (live) => {
          live.degraded = payload.degraded ?? null;
          live.requestedLiveTranscription =
            payload.requested_live_transcription;
          live.liveTranscriptionActive = payload.live_transcription_active;
          live.needsBatchRepair ||=
            payload.requested_live_transcription &&
            (!payload.live_transcription_active || payload.degraded !== null);
          if (reconnected) {
            live.stallAudibleSeconds = 0;
            live.finalStallAudibleSeconds = 0;
            live.transcriptionStalled = false;
          }
        });
        if (reconnected) {
          toast.dismiss("live-transcription-stalled");
        }
        return;
      }

      clearLiveInterval(currentLive.intervalId);

      const intervalId = createLiveSecondsInterval(set);

      void iconCommands
        .setRecordingIndicator(true)
        .catch((error) =>
          console.error("[listener] failed to set recording indicator", error),
        );

      setLiveState(set, (live) => {
        markLiveActive(
          live,
          targetSessionId,
          intervalId,
          payload.requested_live_transcription,
          payload.live_transcription_active,
          payload.degraded ?? null,
        );
      });
      return;
    }

    if (payload.type === "finalizing") {
      void stopSpeakerContextCapture(targetSessionId);
      setLiveState(set, (live) => {
        if (live.sessionId === targetSessionId) {
          clearLiveInterval(live.intervalId);
        }
        markLiveFinalizing(live, targetSessionId);
      });
      return;
    }

    void stopSpeakerContextCapture(targetSessionId);
    const currentLive = get().live;
    const stoppedSeconds =
      currentLive.sessionId === targetSessionId
        ? currentLive.seconds
        : (currentLive.finalizingBySession[targetSessionId]?.seconds ?? 0);
    const onStopped = get().takeOnStopped(targetSessionId);
    const unlisteners = currentLive.eventUnlistenersBySession[targetSessionId];
    const hasUnfinalizedTranscript =
      currentLive.sessionId === targetSessionId &&
      Object.values(get().partialWordsByChannel).some(
        (words) => words.length > 0,
      );
    const needsBatchRepair =
      currentLive.sessionId === targetSessionId
        ? currentLive.needsBatchRepair ||
          (payload.requested_live_transcription && hasUnfinalizedTranscript)
        : (currentLive.finalizingBySession[targetSessionId]?.needsBatchRepair ??
          false);

    // Arrêt demandé par « Mettre en pause » : la capture est close, mais la
    // réunion continue (pas de synthèse, pas de « meeting.completed »).
    const pausing =
      currentLive.pause?.sessionId === targetSessionId &&
      currentLive.pause.phase === "pausing";

    clearLiveEventUnlisteners(unlisteners);
    toast.dismiss(`audio-saving-delayed-${targetSessionId}`);
    toast.dismiss(`audio-disk-low-${targetSessionId}`);

    setLiveState(set, (live) => {
      delete live.eventUnlistenersBySession[targetSessionId];
      delete live.finalizingBySession[targetSessionId];
      releaseLiveCaptureGeneration(live, targetSessionId);
      if (onStopped) {
        live.postStopProcessingBySession[targetSessionId] = true;
      }

      if (live.sessionId === targetSessionId) {
        clearLiveInterval(live.intervalId);
        markLiveInactive(live, targetSessionId, payload.error ?? null);
      }
      // Une reprise arrêtée par « Terminer » finit la réunion : plus de pause.
      if (!pausing && live.pause?.sessionId === targetSessionId) {
        live.pause = null;
      }
    });

    if (currentLive.sessionId === targetSessionId) {
      void iconCommands
        .setRecordingIndicator(false)
        .catch((error) =>
          console.error(
            "[listener] failed to clear recording indicator",
            error,
          ),
        );
      get().resetTranscript();
    }

    if (payload.audio_path) {
    }

    const finishMeetingOrPause = () => {
      if (!pausing) {
        dispatchMeetingCompleted(targetSessionId);
        return;
      }
      setLiveState(set, (live) => {
        if (live.pause?.sessionId === targetSessionId) {
          live.pause.phase = "paused";
        }
      });
    };

    const acknowledgeStoppedCapture = () => {
      void listenerCommands
        .acknowledgeStoppedCapture(targetSessionId, payload.stopped_at_ms)
        .then((result) => {
          if (result.status === "error") {
            console.error(
              "[listener] failed to acknowledge stopped capture",
              result.error,
            );
          }
        })
        .catch((error) => {
          console.error(
            "[listener] failed to acknowledge stopped capture",
            error,
          );
        });
    };

    if (onStopped) {
      const finishPostStopProcessing = (acknowledge: boolean) => {
        setLiveState(set, (live) => {
          delete live.postStopProcessingBySession[targetSessionId];
        });
        if (acknowledge) {
          acknowledgeStoppedCapture();
        }
        finishMeetingOrPause();
      };
      try {
        const stopped = onStopped(targetSessionId, {
          durationSeconds: stoppedSeconds,
          stoppedAtMs: payload.stopped_at_ms,
          chunkedAudio: payload.chunked_audio,
          audioDeletionFailed:
            payload.error?.includes("audio_deletion_failed:") ?? false,
          audioPath: payload.audio_path ?? null,
          requestedLiveTranscription: payload.requested_live_transcription,
          liveTranscriptionActive: payload.live_transcription_active,
          needsBatchRepair,
          paused: pausing,
        });
        void Promise.resolve(stopped).then(
          () => finishPostStopProcessing(true),
          (error) => {
            finishPostStopProcessing(false);
            console.error("[listener] post-stop processing failed", error);
          },
        );
      } catch (error) {
        finishPostStopProcessing(false);
        console.error("[listener] post-stop processing failed", error);
      }
    } else {
      acknowledgeStoppedCapture();
      finishMeetingOrPause();
    }
  },
  progress: (payload) => {
    if (payload.session_id !== targetSessionId) {
      return;
    }

    if (get().live.sessionId !== targetSessionId) {
      return;
    }

    if (
      payload.type === "audio_error" &&
      payload.error.startsWith("audio_saving_delayed")
    ) {
      toast.warning(t`Audio saving is delayed`, {
        id: `audio-saving-delayed-${targetSessionId}`,
        duration: Infinity,
        description: t`Free up disk space. Audio is kept in memory and saved once storage is available. Live transcription continues.`,
      });
      return;
    }

    if (
      payload.type === "audio_error" &&
      payload.error === "audio_saving_resumed"
    ) {
      toast.dismiss(`audio-saving-delayed-${targetSessionId}`);
      return;
    }

    if (payload.type === "audio_error" && payload.error === "audio_disk_low") {
      toast.warning(t`Disk almost full`, {
        id: `audio-disk-low-${targetSessionId}`,
        duration: Infinity,
        description: t`Free up disk space. Audio saving stops if the disk fills up. Live transcription continues.`,
      });
      return;
    }

    if (payload.type === "audio_error" && payload.error === "audio_disk_ok") {
      toast.dismiss(`audio-disk-low-${targetSessionId}`);
      return;
    }

    if (
      payload.type === "audio_error" &&
      payload.error.startsWith("audio_storage_")
    ) {
      toast.dismiss(`audio-saving-delayed-${targetSessionId}`);
      toast.dismiss(`audio-disk-low-${targetSessionId}`);
      setLiveState(set, (live) => updateLiveProgress(live, payload));
      toast.error(t`Audio saving was interrupted`, {
        id: `audio-storage-${targetSessionId}`,
        duration: Infinity,
        description: t`Live transcription continues. Free up disk space to resume audio saving. Audio missing during this interruption cannot be recovered.`,
      });
      return;
    }

    if (
      payload.type === "audio_error" &&
      !payload.is_fatal &&
      payload.error === "recording_recovered"
    ) {
      toast.warning(t`The previous recording needs recovery`, {
        id: `recording-recovered-${targetSessionId}`,
        duration: Infinity,
        description: t`The unreadable audio was preserved in this note's folder as an audio.recovery-*.wav file. New audio will be recorded separately. Your transcript is unchanged.`,
      });
      return;
    }

    if (
      (payload.type === "audio_error" &&
        /^audio_(mic|speaker|capture)_(ready|unavailable)/.test(
          payload.error,
        )) ||
      payload.type === "audio_ready"
    ) {
      setLiveState(set, (live) => updateLiveProgress(live, payload));
      notifyCaptureWarning(get, targetSessionId);
      if (payload.type === "audio_ready")
        notifyMicFallback(
          targetSessionId,
          requestedMic,
          payload.device,
          () =>
            void openMicrophoneSettings().catch((error) =>
              console.error("[listener] opening device settings failed", error),
            ),
        );
      if (payload.type === "audio_ready")
        observeSpeakerMicrophone(targetSessionId, {
          device: payload.device,
          available:
            payload.device !== null || get().live.captureHealth.mic === true,
        });
      else if (payload.error === "audio_mic_ready")
        observeSpeakerMicrophone(targetSessionId, { available: true });
      else if (payload.error.startsWith("audio_mic_unavailable"))
        observeSpeakerMicrophone(targetSessionId, {
          device: null,
          available: false,
        });
      return;
    }

    setLiveState(set, (live) => {
      updateLiveProgress(live, payload);
    });
  },
  data: (payload) => {
    if (payload.session_id !== targetSessionId) {
      return;
    }

    if (
      payload.type === "mic_isolated" &&
      get().live.sessionId === targetSessionId &&
      (get().live.status === "active" || get().live.loading)
    ) {
      observeSpeakerMicrophone(targetSessionId, { isolated: payload.value });
      return;
    }
    if (payload.type === "audio_amplitude") {
      if (get().live.sessionId !== targetSessionId) {
        return;
      }

      setLiveState(set, (live) => {
        updateLiveAmplitude(live, payload.mic, payload.speaker);
      });
      return;
    }

    if (payload.type === "transcript_delta") {
      const delta = payload.delta as unknown as LiveTranscriptDelta;
      const currentLive = get().live;
      const hasFinalWords = delta.new_words.length > 0;
      if (
        currentLive.sessionId === targetSessionId &&
        (hasFinalWords || delta.partials.length > 0) &&
        (currentLive.stallAudibleSeconds !== 0 ||
          (hasFinalWords &&
            (currentLive.finalStallAudibleSeconds !== 0 ||
              currentLive.transcriptionStalled)))
      ) {
        if (hasFinalWords && currentLive.transcriptionStalled) {
          toast.dismiss("live-transcription-stalled");
        }
        setLiveState(set, (live) => {
          noteLiveTranscriptActivity(live, {
            hasFinalWords,
          });
        });
      }
      // Persistance des mots finaux : à la réception, sans attendre le lot.
      if (delta.new_words.length > 0 || delta.replaced_ids.length > 0) {
        get().handlePersistBySession[targetSessionId]?.(delta);
      }
      if (
        get().live.sessionId === targetSessionId &&
        get().live.liveTranscriptionActive === true
      ) {
        batcher.addPreviewDelta(delta);
      }
      return;
    }

    if (payload.type === "transcript_segment_delta") {
      if (get().live.sessionId !== targetSessionId) {
        return;
      }

      const delta = payload.delta as unknown as LiveTranscriptSegmentDelta;
      if (!interceptSegmentDelta?.(delta)) {
        batcher.addSegmentDelta(delta);
      }
      return;
    }

    if (payload.type === "mic_muted" || payload.type === "speaker_muted") {
      if (get().live.sessionId !== targetSessionId) {
        return;
      }

      const channel = payload.type;
      setLiveState(set, (live) => {
        if (channel === "mic_muted") {
          live.muted = payload.value;
        } else {
          live.speakerMuted = payload.value;
        }
      });
    }
  },
});
