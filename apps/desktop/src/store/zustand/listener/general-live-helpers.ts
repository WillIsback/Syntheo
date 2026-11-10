import { t } from "@lingui/core/macro";
import { Cause, Effect } from "effect";
import type { StoreApi } from "zustand";

import { commands as localApiCommands } from "@syntheo/plugin-local-api";
import {
  commands as listenerCommands,
  events as listenerEvents,
  type CaptureDataEvent,
  type CaptureConfigUpdate,
  type CaptureLifecycleEvent,
  type CaptureParams,
  type CaptureStatusEvent,
  type LiveTranscriptSegment,
  type LiveTranscriptSegmentDelta,
} from "@syntheo/plugin-transcription";
import { toast } from "@syntheo/ui/components/ui/toast";

import {
  type GeneralState,
  getCaptureWarning,
  type LiveIntervalId,
  setLiveState,
  tickTranscriptionStallWatchdog,
} from "./general-shared";
import {
  createLiveSegmentDeltaAccumulator,
  createLiveTranscriptBatcher,
  mergeLiveSegmentDelta,
} from "./live-transcript-batch";
import {
  LIVE_TRANSCRIPT_PREVIEW_SEGMENT_LIMIT,
  type TranscriptActions,
  type TranscriptState,
} from "./transcript";

import { runMeetingCompletedAutomations } from "~/automations/engine";
import { fromResult } from "~/stt/fromResult";

export type EventListeners = {
  lifecycle: (payload: CaptureLifecycleEvent) => void;
  progress: (payload: CaptureStatusEvent) => void;
  data: (payload: CaptureDataEvent) => void;
  // Vide le lot de transcription en direct et l'arrête (désabonnement).
  dispose: () => void;
};

export type LiveStore = GeneralState & TranscriptState & TranscriptActions;

const CAPTURE_SNAPSHOT_HYDRATION_TIMEOUT_MS = 5_000;

const trimLiveSegmentDeltaBuffer = (
  entries: Map<string, LiveTranscriptSegment> | Set<string>,
) => {
  while (entries.size > LIVE_TRANSCRIPT_PREVIEW_SEGMENT_LIMIT) {
    const oldest = entries.keys().next();
    if (oldest.done) {
      return;
    }
    entries.delete(oldest.value);
  }
};

export const bufferLiveSegmentDelta = (
  buffer: ReturnType<typeof createLiveSegmentDeltaAccumulator>,
  delta: LiveTranscriptSegmentDelta,
) => {
  mergeLiveSegmentDelta(buffer, delta);
  trimLiveSegmentDeltaBuffer(buffer.removedIds);
  trimLiveSegmentDeltaBuffer(buffer.upsertsById);
};

export const getCaptureSnapshotWithTimeout = (): ReturnType<
  typeof listenerCommands.getCaptureSnapshot
> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (
      result: Awaited<ReturnType<typeof listenerCommands.getCaptureSnapshot>>,
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };
    const timeoutId = setTimeout(
      () =>
        finish({
          status: "error",
          error: `capture snapshot hydration timed out after ${CAPTURE_SNAPSHOT_HYDRATION_TIMEOUT_MS}ms`,
        }),
      CAPTURE_SNAPSHOT_HYDRATION_TIMEOUT_MS,
    );

    void (async () => {
      try {
        finish(await listenerCommands.getCaptureSnapshot());
      } catch (error) {
        finish({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

export const listenToAllSessionEvents = (
  handlers: EventListeners,
): Effect.Effect<(() => void)[], unknown> =>
  Effect.tryPromise({
    try: async () => {
      const unlisteners = await Promise.all([
        listenerEvents.captureLifecycleEvent.listen(({ payload }) =>
          handlers.lifecycle(payload),
        ),
        listenerEvents.captureStatusEvent.listen(({ payload }) =>
          handlers.progress(payload),
        ),
        listenerEvents.captureDataEvent.listen(({ payload }) =>
          handlers.data(payload),
        ),
      ]);
      return [...unlisteners, handlers.dispose];
    },
    catch: (error) => error,
  });

export const startSessionEffect = (params: CaptureParams) =>
  fromResult(() => listenerCommands.startCapture(params));

export const stopSessionEffect = () =>
  fromResult(() => listenerCommands.stopCapture());

export const updateLiveSessionConfig = (update: CaptureConfigUpdate) =>
  fromResult(() => listenerCommands.updateCaptureConfig(update));

export const getCaptureStartErrorMessage = (
  cause: Cause.Cause<unknown>,
): string => {
  const failure = Cause.squash(cause);

  if (failure instanceof Error && failure.message.trim()) {
    return failure.message;
  }

  if (typeof failure === "string" && failure.trim()) {
    return failure;
  }

  return t`Recording could not start. Check your audio permissions and devices.`;
};

export function getAutoStopTriggerAppIds(
  appIds: string[] | null,
  bundleId: string,
): string[] {
  return [
    ...new Set(
      (appIds ?? []).filter(
        (id) => id && id !== bundleId && !id.startsWith("pid:"),
      ),
    ),
  ];
}

export const clearLiveInterval = (intervalId?: LiveIntervalId) => {
  if (intervalId) {
    clearInterval(intervalId);
  }
};

const notifyTranscriptionStalled = () => {
  toast.warning(t`Live transcription interrupted`, {
    id: "live-transcription-stalled",
    duration: Infinity,
    description: t`Syntheo keeps listening while live transcription reconnects. No audio is kept: the missing passage will not be recovered.`,
  });
};

export const createLiveSecondsInterval = <T extends GeneralState>(
  set: StoreApi<T>["setState"],
  guard?: (live: GeneralState["live"]) => boolean,
): LiveIntervalId =>
  setInterval(() => {
    let stalled = false;
    setLiveState(set, (live) => {
      if (guard && !guard(live)) {
        return;
      }
      live.seconds += 1;
      stalled = tickTranscriptionStallWatchdog(live);
    });
    if (stalled) {
      notifyTranscriptionStalled();
    }
  }, 1000);

export const clearLiveEventUnlisteners = (unlisteners?: (() => void)[]) => {
  unlisteners?.forEach((fn) => fn());
};

// Le bouton « Device settings » ouvre la page Réunions sur la ligne
// Microphone, surlignée comme après une recherche de paramètres (issue 419).
// L'ancien onglet `general` n'existe plus : il retombait sur Profil.
export const openMicrophoneSettings = async () => {
  const [{ requestSettingFocus }, { useTabs }] = await Promise.all([
    import("~/settings/setting-focus"),
    import("~/store/zustand/tabs"),
  ]);
  requestSettingFocus("meetings-microphone");
  useTabs.getState().openNew({ type: "settings", state: { tab: "meetings" } });
};

export const notifyCaptureWarning = <T extends GeneralState>(
  get: StoreApi<T>["getState"],
  targetSessionId: string,
) => {
  const warning = getCaptureWarning(get().live);
  if (!warning) {
    toast.dismiss(`audio-capture-${targetSessionId}`);
    return;
  }

  showCaptureWarning(get, targetSessionId, warning, false);
  // Sans aucune entrée audio (PC ou VM sans micro), « choisissez un
  // périphérique qui fonctionne » n'a pas de sens : on le dit clairement.
  void Promise.resolve()
    .then(() => listenerCommands.listMicrophoneDevices())
    .then((result) => {
      if (
        result.status === "ok" &&
        result.data.length === 0 &&
        getCaptureWarning(get().live) === warning
      )
        showCaptureWarning(get, targetSessionId, warning, true);
    })
    .catch((error) =>
      console.error("[listener] microphone listing failed", error),
    );
};

const showCaptureWarning = <T extends GeneralState>(
  get: StoreApi<T>["getState"],
  targetSessionId: string,
  warning: string,
  noMicrophone: boolean,
) => {
  toast.warning(warning, {
    id: `audio-capture-${targetSessionId}`,
    duration: Infinity,
    dismissible: false,
    closeButton: false,
    description: noMicrophone
      ? t`No microphone detected. Plug in a microphone, then retry. Audio missing during this interruption cannot be recovered.`
      : t`Choose a working audio device and retry. Audio missing during this interruption cannot be recovered.`,
    action: {
      label: t`Retry`,
      dismissOnClick: false,
      onClick: () => {
        void import("~/settings/queries")
          .then(async ({ getStoredSettingValues }) => {
            const settings = await getStoredSettingValues();
            if (
              get().live.sessionId !== targetSessionId ||
              get().live.status !== "active"
            )
              return;
            const result = await listenerCommands.retryAudioCapture(
              targetSessionId,
              settings.values.microphone_device || null,
            );
            if (result.status === "error")
              toast.error(t`Audio retry failed`, {
                description: result.error,
              });
          })
          .catch((error) =>
            console.error("[listener] audio retry failed", error),
          );
      },
    },
    secondaryAction: {
      dismissOnClick: false,
      label: t`Device settings`,
      onClick: () => {
        openMicrophoneSettings().catch((error) =>
          console.error("[listener] opening device settings failed", error),
        );
      },
    },
  });
};

// Les deltas reçus pendant 100 ms sont appliqués en un seul `set` (issue 444).
// Une autre session a pu prendre la main entre-temps : son lot est alors
// ignoré, comme un delta reçu pour une session qui n'est plus suivie.
export const createSessionTranscriptBatcher = <T extends LiveStore>(
  get: StoreApi<T>["getState"],
  targetSessionId: string,
) =>
  createLiveTranscriptBatcher((batch) => {
    if (get().live.sessionId !== targetSessionId) {
      return;
    }
    get().applyLiveTranscriptBatch(batch);
  });

/** Fin de réunion : événement local « meeting.completed » et automatisations. */
export const dispatchMeetingCompleted = (sessionId: string) => {
  void localApiCommands
    .dispatchEvent("meeting.completed", sessionId)
    .catch((error) =>
      console.error(
        "[listener] failed to dispatch meeting.completed event",
        error,
      ),
    );
  void runMeetingCompletedAutomations(sessionId);
};

export const elapsedSecondsSince = (startedAtMs: number) =>
  Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
