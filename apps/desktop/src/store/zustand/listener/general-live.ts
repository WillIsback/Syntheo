import { getIdentifier } from "@tauri-apps/api/app";
import { Effect, Exit } from "effect";
import type { StoreApi } from "zustand";

import { commands as detectCommands } from "@syntheo/plugin-detect";
import { commands as hooksCommands } from "@syntheo/plugin-hooks";
import { commands as settingsCommands } from "@syntheo/plugin-settings";
import { type CaptureParams } from "@syntheo/plugin-transcription";

import { createSessionEventHandlers } from "./general-live-events";
import {
  type LiveStore,
  clearLiveEventUnlisteners,
  clearLiveInterval,
  createLiveSecondsInterval,
  getAutoStopTriggerAppIds,
  getCaptureStartErrorMessage,
  listenToAllSessionEvents,
  startSessionEffect,
  stopSessionEffect,
} from "./general-live-helpers";
import {
  type GeneralState,
  getListeningElapsedSeconds,
  markLiveCaptureStarted,
  markLiveFinalizing,
  markLiveStartFailed,
  setLiveState,
} from "./general-shared";
import { flushLiveTranscriptBatches } from "./live-transcript-batch";

import { getSessionResourcePath } from "~/session/resource-path";
import { isAppStoreBuild } from "~/shared/app-store";
import { recordDetectedMeetingApps } from "~/stt/meeting-source-apps";
import { stopSpeakerContextCapture } from "~/stt/speaker-context-capture";

export {
  updateLiveSessionConfig,
  openMicrophoneSettings,
  dispatchMeetingCompleted,
} from "./general-live-helpers";
export { attachLiveSession } from "./general-live-attach";

export const startLiveSession = <T extends LiveStore>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
  targetSessionId: string,
  params: CaptureParams,
): Promise<boolean> => {
  flushLiveTranscriptBatches();
  clearLiveEventUnlisteners(
    get().live.eventUnlistenersBySession[targetSessionId],
  );
  setLiveState(set, (live) => {
    delete live.eventUnlistenersBySession[targetSessionId];
  });

  const handlers = createSessionEventHandlers(
    set,
    get,
    targetSessionId,
    undefined,
    params.mic_device ?? null,
  );

  const program = Effect.gen(function* () {
    const unlisteners = yield* listenToAllSessionEvents(handlers);

    setLiveState(set, (live) => {
      live.eventUnlistenersBySession[targetSessionId] = unlisteners;
    });

    const [dataDirPath, micUsingApps, bundleId] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          settingsCommands.vaultBase().then((r) => {
            if (r.status === "error") throw new Error(r.error);
            return r.data;
          }),
          detectCommands
            .listMicUsingApplications()
            .then((r) => (r.status === "ok" ? r.data : null)),
          getIdentifier().catch(() => "fr.willisback.syntheo"),
        ]),
      catch: (error) => error,
    });

    const sessionPath = getSessionResourcePath(dataDirPath, targetSessionId);
    const micUsingAppIds = micUsingApps?.map((app) => app.id) ?? null;
    const app_meeting = micUsingAppIds?.[0] ?? null;
    const triggerAppIds = getAutoStopTriggerAppIds(micUsingAppIds, bundleId);

    if (triggerAppIds.length > 0) {
      setLiveState(set, (live) => {
        if (live.sessionId === targetSessionId) {
          live.triggerAppIds = triggerAppIds;
        }
      });
    }

    if (!isAppStoreBuild()) {
      yield* Effect.tryPromise({
        try: () =>
          hooksCommands.runEventHooks({
            beforeListeningStarted: {
              args: {
                resource_dir: sessionPath,
                app_syntheo: bundleId,
                app_meeting,
              },
            },
          }),
        catch: (error) => {
          console.error("[hooks] BeforeListeningStarted failed:", error);
          return error;
        },
      });
    }

    yield* startSessionEffect(params);

    setLiveState(set, (live) => {
      markLiveCaptureStarted(live, targetSessionId);
    });

    return micUsingApps;
  });

  return Effect.runPromiseExit(program).then((exit) =>
    Exit.match(exit, {
      onFailure: (cause) => {
        console.error(JSON.stringify(cause));
        const error = getCaptureStartErrorMessage(cause);
        const currentLive = get().live;
        clearLiveInterval(currentLive.intervalId);
        clearLiveEventUnlisteners(
          currentLive.eventUnlistenersBySession[targetSessionId],
        );
        setLiveState(set, (live) => {
          delete live.eventUnlistenersBySession[targetSessionId];
          markLiveStartFailed(live, targetSessionId, error);
        });
        void stopSpeakerContextCapture(targetSessionId);
        return false;
      },
      onSuccess: (micUsingApps) => {
        if (micUsingApps?.length) {
          void recordDetectedMeetingApps(targetSessionId, micUsingApps).catch(
            (error) =>
              console.warn(
                "[listener] failed to persist detected meeting apps",
                error,
              ),
          );
        }
        return true;
      },
    }),
  );
};

/**
 * Met l'écoute en pause : la capture native est arrêtée comme pour « Terminer »
 * (micro et audio système fermés, plus rien n'est envoyé à la transcription),
 * mais la session reste en pause pour une reprise. Retourne `false` sans
 * écoute active.
 */
export const pauseLiveSession = <T extends GeneralState>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): boolean => {
  const { live } = get();
  const sessionId = live.sessionId;
  if (live.status !== "active" || !sessionId) {
    return false;
  }

  setLiveState(set, (draft) => {
    draft.pause = {
      sessionId,
      elapsedSeconds: getListeningElapsedSeconds(draft, sessionId),
      phase: "pausing",
    };
  });
  stopLiveSession(set, get);
  return true;
};

export const stopLiveSession = <T extends GeneralState>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
) => {
  // L'arrêt et la pause partent de la transcription complète.
  flushLiveTranscriptBatches();
  const sessionId = get().live.sessionId;

  if (sessionId) {
    setLiveState(set, (live) => {
      if (live.sessionId !== sessionId || live.status !== "active") {
        return;
      }

      clearLiveInterval(live.intervalId);
      markLiveFinalizing(live, sessionId);
    });
  }

  const program = Effect.gen(function* () {
    yield* stopSessionEffect();
  });

  void Effect.runPromiseExit(program).then((exit) => {
    Exit.match(exit, {
      onFailure: (cause) => {
        console.error("Failed to stop session:", cause);
        setLiveState(set, (live) => {
          // La capture tourne toujours : la pause demandée n'a pas eu lieu.
          if (
            sessionId &&
            live.pause?.sessionId === sessionId &&
            live.pause.phase === "pausing"
          ) {
            live.pause = null;
          }
          if (sessionId && live.sessionId === sessionId) {
            delete live.finalizingBySession[sessionId];
            if (live.status === "finalizing") {
              const intervalId = createLiveSecondsInterval(
                set,
                (currentLive) =>
                  currentLive.sessionId === sessionId &&
                  currentLive.status === "active",
              );
              live.status = "active";
              live.intervalId = intervalId;
            }
          }
          live.loading = false;
        });
      },
      onSuccess: () => {
        if (!sessionId) {
          return;
        }

        if (isAppStoreBuild()) {
          return;
        }

        void Promise.all([
          settingsCommands.vaultBase().then((r) => {
            if (r.status === "error") throw new Error(r.error);
            return r.data;
          }),
          getIdentifier().catch(() => "fr.willisback.syntheo"),
        ])
          .then(([dataDirPath, bundleId]) => {
            const sessionPath = getSessionResourcePath(dataDirPath, sessionId);
            return hooksCommands.runEventHooks({
              afterListeningStopped: {
                args: {
                  resource_dir: sessionPath,
                  app_syntheo: bundleId,
                  app_meeting: null,
                },
              },
            });
          })
          .catch((error) => {
            console.error("[hooks] AfterListeningStopped failed:", error);
          });
      },
    });
  });
};
