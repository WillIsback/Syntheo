import { t } from "@lingui/core/macro";
import { useCallback, useLayoutEffect, useRef } from "react";

import { toast } from "@syntheo/ui/components/ui/toast";

import { useCaptureLifecycle } from "./capture-lifecycle";
import {
  clearCaptureAudioSaved,
  hasAudioAwaitingUser,
  hasPendingZeroRetentionAudio,
  loadCaptureLifecycleMarker,
} from "./capture-lifecycle-storage";
import { useListener } from "./contexts";
import { notifyListeningElsewhere } from "./listening-elsewhere";
import { startMeetingChatCapture } from "./meeting-chat-capture";
import {
  MEETING_DISCLOSURE_MESSAGE,
  startMeetingRecordingDisclosure,
} from "./meeting-disclosure";
import { startMeetingScreenCapture } from "./meeting-screen-capture";
import { finishPausedListening, getPausedSessionId } from "./pause-listening";
import {
  classifyStartFailure,
  getMicrophonePermission,
  showStartFailureToast,
  type StartFailureStage,
} from "./start-failure";

import { useConfigValue } from "~/shared/config";
import { useLiveTranscriptionLanguages } from "~/store/zustand/live-transcription-languages";
import { useTabs } from "~/store/zustand/tabs";
import {
  getLiveTranscriptionConfig,
  getSttModelTranscriptionMode,
  getTranscriptionLanguages,
} from "~/stt/capabilities";
import {
  getSessionParticipantHumanIds,
  useSessionParticipantHumanIds,
} from "~/stt/queries";

// Fonctions et non constantes : le texte suit la langue active à l'affichage.
export const getCaptureReminderMessage = () =>
  t`Remind participants that the meeting is being transcribed.`;

export const getNoTranscriptionProviderMessage = () =>
  t`No transcription provider is set up. Syntheo does not keep audio: set up a transcription endpoint before recording.`;

// Délai maximal d'attente des réglages avant de conclure à l'absence de
// fournisseur (issue 515).
const CONNECTION_LOADING_TIMEOUT_MS = 5_000;

export const getBatchOnlyCaptureMessage = () =>
  t`This model only transcribes after the recording, which would require keeping the audio. Choose a real-time transcription model.`;

export {
  getPostCaptureAction,
  getPostCaptureRepairReasons,
} from "./capture-lifecycle";
export { sendMeetingRecordingDisclosure } from "./meeting-disclosure";
export { useResumeListeningLifecycle } from "./resume-listening";

export function useStartListening(sessionId: string) {
  return useStartListeningState(sessionId).startListening;
}

export function useStartListeningState(
  sessionId: string,
  { automatic = false }: { automatic?: boolean } = {},
) {
  const {
    conn,
    connectionLoading,
    connectionReady,
    createCaptureLifecycle,
    session,
    setStopMeetingChatCapture,
    stopMeetingChatTasks,
  } = useCaptureLifecycle(sessionId);
  const participantHumanIds = useSessionParticipantHumanIds(sessionId);
  const getSessionMode = useListener((state) => state.getSessionMode);
  const canStartLiveSession = useListener((state) => state.canStartLiveSession);
  const getLiveStartError = useListener((state) => state.getLiveStartError);

  const aiLanguage = useConfigValue("ai_language");
  const spokenLanguages = useConfigValue("spoken_languages");
  const dictionaryTerms = useConfigValue("personalization_dictionary_terms");
  const microphoneDevice = useConfigValue("microphone_device");
  // Sortie capturée comme son système (issue 450).
  const speakerDevice = useConfigValue("speaker_device");
  // Règle audio de Syntheo : la capture ne conserve jamais l'audio.
  const retainAudio = false;
  const meetingDisclosureAutoSendChat = useConfigValue(
    "consent_auto_send_chat",
  );
  const captureReminderEnabled = useConfigValue("capture_reminder_enabled");

  const start = useListener((state) => state.start);
  const stop = useListener((state) => state.stop);
  const openNew = useTabs((state) => state.openNew);

  const reportStartFailure = useCallback(
    async (stage: StartFailureStage, error: string | null) => {
      const microphonePermission =
        stage === "recovery_marker" ? null : await getMicrophonePermission();
      showStartFailureToast(
        classifyStartFailure({ stage, error, microphonePermission }),
        (tab) => openNew({ type: "settings", state: { tab } }),
      );
    },
    [openNew],
  );

  // Issue 516 : un démarrage refusé parce qu'une autre note écoute ne reste
  // plus muet ; « Arrêter et démarrer ici » relance ce même démarrage.
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const notifyBlockedStart = useCallback(() => {
    void notifyListeningElsewhere(sessionId, {
      openNote: (id) => openNew({ type: "sessions", id }),
      stop,
      startHere: () => startListeningRef.current(),
    });
  }, [openNew, sessionId, stop]);

  const startListeningNow = useCallback(async () => {
    if (!canStartLiveSession(sessionId)) {
      notifyBlockedStart();
      return;
    }
    // Sans recorder, une capture sans STT ne produirait rien.
    if (!conn) {
      toast.error(getNoTranscriptionProviderMessage(), {
        id: "recording-without-transcription",
        duration: Infinity,
        action: {
          label: t`Set up`,
          onClick: () =>
            openNew({ type: "settings", state: { tab: "transcription" } }),
        },
      });
      return;
    }
    // Un modèle « après l'enregistrement » exigerait de conserver l'audio.
    if (
      conn &&
      getSttModelTranscriptionMode(conn.provider, conn.model) === "batch"
    ) {
      toast.error(getBatchOnlyCaptureMessage(), { id: "batch-only-capture" });
      return;
    }
    // Une autre réunion restée en pause se termine : une seule écoute à la fois.
    const pausedSessionId = getPausedSessionId();
    if (pausedSessionId && pausedSessionId !== sessionId) {
      await finishPausedListening(pausedSessionId);
    }
    if (captureReminderEnabled) {
      toast.info(getCaptureReminderMessage(), {
        id: "capture-reminder",
        duration: 8000,
      });
    }
    await stopMeetingChatTasks();
    const previousMarker = await loadCaptureLifecycleMarker(sessionId).catch(
      (error) => {
        console.error("[listener] failed to load pending capture", error);
        return null;
      },
    );
    const pendingMarker =
      previousMarker &&
      (hasAudioAwaitingUser(previousMarker) ||
        hasPendingZeroRetentionAudio(previousMarker))
        ? previousMarker
        : undefined;
    const lifecycle = createCaptureLifecycle(
      undefined,
      automatic,
      pendingMarker,
    );
    const [keywords, liveTranscriptionConfig, remoteParticipantHumanIds] =
      await Promise.all([
        import("./useKeywords").then(({ getSessionKeywords }) =>
          getSessionKeywords({ sessionId, dictionaryTerms }),
        ),
        getLiveTranscriptionConfig({
          provider: conn?.provider,
          model: conn?.model,
          languages: getTranscriptionLanguages(aiLanguage, spokenLanguages),
        }),
        getSessionParticipantHumanIds(sessionId).catch((error) => {
          console.error(
            "[listener] failed to read session participants before capture",
            error,
          );
          return participantHumanIds;
        }),
        lifecycle.ready,
      ]);
    if (!canStartLiveSession(sessionId)) {
      notifyBlockedStart();
      return;
    }

    try {
      await lifecycle.persistMarker({
        postStopBatch: liveTranscriptionConfig.transcriptionMode === "batch",
      });
    } catch (error) {
      console.error(
        "[listener] failed to prepare durable capture state",
        error,
      );
      try {
        await lifecycle.cleanupFailedStart();
      } catch (cleanupError) {
        console.error(
          "[listener] failed to clean up capture state",
          cleanupError,
        );
      }
      await reportStartFailure("recovery_marker", null);
      return;
    }

    let started = false;
    try {
      started = await start(
        {
          session_id: sessionId,
          retain_audio: retainAudio,
          languages: liveTranscriptionConfig.languages,
          onboarding: false,
          model: conn?.model ?? "",
          base_url: conn?.baseUrl ?? "",
          api_key: conn?.apiKey ?? "",
          keywords,
          mic_device: microphoneDevice || null,
          speaker_device: speakerDevice || null,
          transcription_mode: liveTranscriptionConfig.transcriptionMode,
          participant_human_ids: remoteParticipantHumanIds,
          self_human_id: session?.user_id || null,
          live_transcript: lifecycle.liveTranscript,
        },
        {
          handlePersist: lifecycle.handlePersist,
          onStopped: lifecycle.onStopped,
        },
      );
    } catch (error) {
      console.error("[listener] failed to start recording", error);
      try {
        await lifecycle.cleanupFailedStart();
      } catch (cleanupError) {
        console.error(
          "[listener] failed to clean up capture state",
          cleanupError,
        );
      }
      await reportStartFailure(
        "capture_start",
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    if (!started) {
      await stopMeetingChatTasks();
      try {
        await lifecycle.cleanupFailedStart();
      } catch (error) {
        console.error("[listener] failed to clean up capture state", error);
      }
      await reportStartFailure(
        "capture_rejected",
        getLiveStartError(sessionId),
      );
      return;
    }

    if (pendingMarker) {
      void clearCaptureAudioSaved(sessionId).catch((error) => {
        console.error("[listener] failed to clear capture audio state", error);
      });
    }

    // Pas de toast (issue 351) : la marge de transcription indique la langue
    // retenue quand d'autres langues parlées sont omises.
    useLiveTranscriptionLanguages
      .getState()
      .setLanguages(sessionId, liveTranscriptionConfig);

    const stopChatCapture = startMeetingChatCapture({
      sessionId,
      excludedTexts: [MEETING_DISCLOSURE_MESSAGE],
      onParticipantDeclined: () => {
        toast.warning(
          t`A participant declined recording. Syntheo stopped listening.`,
          { id: "meeting-consent-declined", duration: Infinity },
        );
        stop();
      },
    });
    const stopScreenCapture = startMeetingScreenCapture({ sessionId });
    setStopMeetingChatCapture(async () => {
      await Promise.all([stopChatCapture(), stopScreenCapture()]);
    });

    if (meetingDisclosureAutoSendChat) {
      startMeetingRecordingDisclosure(
        sessionId,
        () => getSessionMode(sessionId) === "active",
      );
    }
  }, [
    automatic,
    aiLanguage,
    canStartLiveSession,
    conn,
    createCaptureLifecycle,
    dictionaryTerms,
    getLiveStartError,
    getSessionMode,
    microphoneDevice,
    notifyBlockedStart,
    speakerDevice,
    reportStartFailure,
    retainAudio,
    openNew,
    participantHumanIds,
    session,
    sessionId,
    setStopMeetingChatCapture,
    meetingDisclosureAutoSendChat,
    spokenLanguages,
    start,
    stop,
    stopMeetingChatTasks,
  ]);

  // Issue 515 : la reprise depuis la pastille passe par un composant monté à
  // la demande dans la fenêtre principale, dont le premier rendu n'a pas
  // encore les réglages (`conn` null). Le démarrage attend leur chargement,
  // borné, puis s'exécute avec le dernier rendu au lieu d'afficher « aucun
  // fournisseur ».
  const connectionLoadingRef = useRef(connectionLoading === true);
  const loadedWaitersRef = useRef(new Set<() => void>());
  useLayoutEffect(() => {
    startListeningRef.current = startListeningNow;
    connectionLoadingRef.current = connectionLoading === true;
    if (!connectionLoadingRef.current) {
      const waiters = [...loadedWaitersRef.current];
      loadedWaitersRef.current.clear();
      waiters.forEach((resolve) => resolve());
    }
  }, [connectionLoading, startListeningNow]);

  const startListening = useCallback(async () => {
    if (connectionLoadingRef.current) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timeout);
          loadedWaitersRef.current.delete(done);
          resolve();
        };
        const timeout = setTimeout(done, CONNECTION_LOADING_TIMEOUT_MS);
        loadedWaitersRef.current.add(done);
      });
    }
    await startListeningRef.current();
  }, []);

  return { connectionReady, startListening };
}
