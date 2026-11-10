import { t } from "@lingui/core/macro";
import { useRef } from "react";
import { useStore } from "zustand";

import {
  commands as detectCommands,
  events as detectEvents,
} from "@syntheo/plugin-detect";
import { commands as notificationCommands } from "@syntheo/plugin-notification";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import {
  AUTO_STOP_CONFIRM_DELAY_MS,
  getAutoStopActiveCheckAppIds,
  getAutoStopCandidateAppIds,
  getMeetingAppsStillOnCall,
  isRecentNetworkDrop,
  resolveNetworkHoldUntilMs,
  shouldPromptBeforeAutoStopping,
  showMeetingEndedPrompt,
} from "./auto-stop";
import { cancelAutoStopEndedNotification } from "./auto-stop-notification";
import {
  captureDetectedTriggerApps,
  createAutoStopAccessibilityInspector,
  getMicDetectedNotificationTitle,
  MAX_TIMEOUT_DELAY_MS,
  type PendingAutoStop,
} from "./detect-events-helpers";
import { inspectionsShowActiveMeetingForApps } from "./meeting-accessibility";
import {
  getIgnorableApps,
  getIgnoreAppsFooterText,
  getNotificationAppName,
  getNotificationIconForApp,
  getNotificationIconForDetectedApps,
} from "./meeting-apps";

import { useConfigValue } from "~/shared/config";
import type { ListenerStore } from "~/store/zustand/listener";
import { isLiveRecordingInProgress } from "~/store/zustand/listener/general-shared";

export { getMicDetectedNotificationTitle } from "./detect-events-helpers";

export const useHandleDetectEvents = (store: ListenerStore) => {
  const stop = useStore(store, (state) => state.stop);
  const setMuted = useStore(store, (state) => state.setMuted);
  const autoStopMeetings = useConfigValue("auto_stop_meetings");
  const notificationsDisabled = useConfigValue("notification_disabled");
  const notificationDetect = useConfigValue("notification_detect");
  const notificationRecording = useConfigValue("notification_recording");

  const autoStopMeetingsRef = useRef(autoStopMeetings);
  autoStopMeetingsRef.current = autoStopMeetings;
  const notificationDetectRef = useRef(notificationDetect);
  notificationDetectRef.current = notificationDetect && !notificationsDisabled;
  const notificationRecordingRef = useRef(notificationRecording);
  notificationRecordingRef.current =
    notificationRecording && !notificationsDisabled;
  const isOnlineRef = useRef(true);
  const lastReconnectAtMsRef = useRef<number | null>(null);
  const pendingAutoStopRef = useRef<PendingAutoStop | null>(null);
  const pendingMicDetectedPromptRef = useRef(false);

  useMountEffect(() => {
    let unlistenDetect: (() => void) | undefined;
    let cancelled = false;
    const inspectForAutoStop = createAutoStopAccessibilityInspector();

    isOnlineRef.current = navigator.onLine;
    const clearNotificationsIfActive = () => {
      const live = store.getState().live;
      if (live.status === "active") {
        if (live.sessionId) {
          cancelAutoStopEndedNotification(live.sessionId);
        }
        void notificationCommands
          .clearNotifications()
          .catch((error) =>
            console.error("[listener] failed to clear notifications", error),
          );
      }
    };
    clearNotificationsIfActive();
    const unsubscribeStore = store.subscribe((state, previousState) => {
      if (
        state.live.status === "active" &&
        previousState.live.status !== "active"
      ) {
        if (state.live.sessionId) {
          cancelAutoStopEndedNotification(state.live.sessionId);
        }
        void notificationCommands
          .clearNotifications()
          .catch((error) =>
            console.error("[listener] failed to clear notifications", error),
          );
      }
    });
    const clearPendingAutoStop = () => {
      if (pendingAutoStopRef.current) {
        if (pendingAutoStopRef.current.timeout) {
          clearTimeout(pendingAutoStopRef.current.timeout);
        }
        pendingAutoStopRef.current = null;
      }
    };
    const shouldCaptureMicDetectedTriggerApps = () => {
      const live = store.getState().live;
      return (
        live.status === "active" ||
        (live.status === "inactive" && live.loading && !!live.sessionId)
      );
    };
    // Never prompt "Are you in a meeting?" while a note is recording, from
    // start to the end of finalizing (issue 349).
    const isRecordingInProgress = () =>
      isLiveRecordingInProgress(store.getState().live);
    const captureTriggerApps = (apps: { id: string; name: string }[]) =>
      captureDetectedTriggerApps(store, clearPendingAutoStop, apps);

    function scheduleAutoStop(
      delayMs: number,
      candidateAppIds: string[],
      stoppedApps: { id: string; name: string }[],
      requireMicSnapshot: boolean,
      sessionId: string | null,
      networkInterrupted: boolean,
      networkHoldUntilMs?: number,
    ) {
      clearPendingAutoStop();

      const pending: PendingAutoStop = {
        requireMicSnapshot,
        sessionId,
        networkInterrupted,
        networkHoldUntilMs,
      };
      pending.timeout = setTimeout(
        () => {
          void confirmAutoStop(candidateAppIds, stoppedApps, pending).finally(
            () => {
              if (pendingAutoStopRef.current === pending) {
                pendingAutoStopRef.current = null;
              }
            },
          );
        },
        Math.min(Math.max(delayMs, 0), MAX_TIMEOUT_DELAY_MS),
      );
      pendingAutoStopRef.current = pending;
    }

    async function confirmAutoStop(
      candidateAppIds: string[],
      stoppedApps: { id: string; name: string }[],
      pending: PendingAutoStop,
    ) {
      const live = store.getState().live;
      if (
        pendingAutoStopRef.current !== pending ||
        live.status !== "active" ||
        live.sessionId !== pending.sessionId
      ) {
        return;
      }

      const currentTrigger = live.triggerAppIds;
      if (
        !currentTrigger ||
        !candidateAppIds.some((id) => currentTrigger.includes(id))
      ) {
        return;
      }

      const activeCheckAppIds = getAutoStopActiveCheckAppIds(
        currentTrigger,
        candidateAppIds,
      );
      const hasUnreliableActiveCheckApp = activeCheckAppIds.some(
        (id) => !candidateAppIds.includes(id),
      );
      const result = await detectCommands.listMicUsingApplications();
      if (result.status === "ok") {
        const activeAppIds = new Set(result.data.map((app) => app.id));
        if (activeCheckAppIds.some((id) => activeAppIds.has(id))) {
          return;
        }

        // Every app in the stop event went quiet, including meeting apps that
        // never became triggers.
        const quietApps = [
          ...stoppedApps,
          ...candidateAppIds
            .filter((id) => !stoppedApps.some((app) => app.id === id))
            .map((id) => ({ id, name: "" })),
        ];
        const meetingAppsStillOnCall = getMeetingAppsStillOnCall({
          triggerAppIds: currentTrigger,
          quietApps,
          micApps: result.data,
        });
        if (meetingAppsStillOnCall.length > 0) {
          const liveAfterCheck = store.getState().live;
          if (
            pendingAutoStopRef.current !== pending ||
            liveAfterCheck.status !== "active" ||
            liveAfterCheck.sessionId !== pending.sessionId
          ) {
            return;
          }
          if (
            pending.sessionId &&
            cancelAutoStopEndedNotification(pending.sessionId)
          ) {
            void notificationCommands
              .clearNotifications()
              .catch((error) =>
                console.error(
                  "[listener] failed to clear notifications",
                  error,
                ),
              );
          }
          // Track them so the recording stops when the call itself ends.
          captureTriggerApps(meetingAppsStillOnCall);
          return;
        }
      } else if (pending.requireMicSnapshot || hasUnreliableActiveCheckApp) {
        return;
      }

      if (pendingAutoStopRef.current !== pending) {
        return;
      }

      const accessibilityResult = await inspectForAutoStop();
      if (
        accessibilityResult?.status === "ok" &&
        inspectionsShowActiveMeetingForApps(
          accessibilityResult.data,
          activeCheckAppIds,
        )
      ) {
        if (pendingAutoStopRef.current !== pending) {
          return;
        }
        scheduleAutoStop(
          AUTO_STOP_CONFIRM_DELAY_MS,
          candidateAppIds,
          stoppedApps,
          pending.requireMicSnapshot,
          pending.sessionId,
          pending.networkInterrupted,
          pending.networkHoldUntilMs,
        );
        return;
      }

      if (pendingAutoStopRef.current !== pending) {
        return;
      }

      if (pending.networkInterrupted || !isOnlineRef.current) {
        const holdUntilMs =
          pending.networkHoldUntilMs ?? resolveNetworkHoldUntilMs(Date.now());
        if (pendingAutoStopRef.current !== pending) {
          return;
        }
        if (holdUntilMs > Date.now()) {
          scheduleAutoStop(
            holdUntilMs - Date.now(),
            candidateAppIds,
            stoppedApps,
            pending.requireMicSnapshot,
            pending.sessionId,
            true,
            holdUntilMs,
          );
          return;
        }

        if (pending.sessionId) {
          await showMeetingEndedPrompt({
            sessionId: pending.sessionId,
            stoppedTriggerAppIds: candidateAppIds,
            stoppedApps,
            notificationEnabled: notificationRecordingRef.current,
          });
        }
        return;
      }

      const shouldPrompt =
        accessibilityResult?.status !== "ok" ||
        shouldPromptBeforeAutoStopping({
          appIds: candidateAppIds,
          sessionId: pending.sessionId,
        });
      if (pendingAutoStopRef.current !== pending) {
        return;
      }
      if (shouldPrompt) {
        if (pending.sessionId) {
          await showMeetingEndedPrompt({
            sessionId: pending.sessionId,
            stoppedTriggerAppIds: candidateAppIds,
            stoppedApps,
            notificationEnabled: notificationRecordingRef.current,
          });
        }
        return;
      }

      const currentLive = store.getState().live;
      if (
        pendingAutoStopRef.current !== pending ||
        currentLive.status !== "active" ||
        currentLive.sessionId !== pending.sessionId
      ) {
        return;
      }

      stop();
    }

    const handleOffline = () => {
      isOnlineRef.current = false;
      if (pendingAutoStopRef.current) {
        pendingAutoStopRef.current.networkInterrupted = true;
      }
    };
    const handleOnline = () => {
      isOnlineRef.current = true;
      lastReconnectAtMsRef.current = Date.now();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    detectEvents.detectEvent
      .listen(({ payload }) => {
        if (payload.type === "micDetected") {
          const ignorableApps = getIgnorableApps(payload.apps);
          const appIds = ignorableApps.map((app) => app.id);

          if (shouldCaptureMicDetectedTriggerApps()) {
            captureTriggerApps(ignorableApps);
            return;
          }

          if (isRecordingInProgress()) {
            return;
          }

          if (!notificationDetectRef.current) {
            return;
          }

          if (pendingMicDetectedPromptRef.current) {
            return;
          }
          pendingMicDetectedPromptRef.current = true;

          void (async () => {
            try {
              const footerIcon =
                ignorableApps.length > 0
                  ? await getNotificationIconForApp(ignorableApps[0]!)
                  : null;
              const notificationIcon = await getNotificationIconForDetectedApps(
                payload.apps,
              );
              const footer =
                ignorableApps.length > 0
                  ? {
                      text: getIgnoreAppsFooterText(ignorableApps),
                      actionLabel: t`Yes`,
                      icon: footerIcon,
                    }
                  : null;

              if (shouldCaptureMicDetectedTriggerApps()) {
                captureTriggerApps(ignorableApps);
                return;
              }
              if (isRecordingInProgress()) {
                return;
              }

              await notificationCommands.showNotification({
                key: payload.key,
                title: getMicDetectedNotificationTitle(),
                message: "",
                timeout: { secs: 15, nanos: 0 },
                source: {
                  type: "mic_detected",
                  app_names: payload.apps.map((app) =>
                    getNotificationAppName(app),
                  ),
                  app_ids: appIds,
                  event_ids: [],
                },
                start_time: null,
                participants: null,
                event_details: null,
                action_label: t`Yes`,
                action: null,
                action_menu: null,
                action_variant: null,
                options: null,
                footer,
                icon: notificationIcon,
              });
            } finally {
              pendingMicDetectedPromptRef.current = false;
            }
          })();
        } else if (payload.type === "micStopped") {
          const autoStopEnabled = autoStopMeetingsRef.current !== false;
          if (!autoStopEnabled) {
            return;
          }

          const trigger = store.getState().live.triggerAppIds;
          const stoppedTriggerAppIds =
            trigger?.filter((id) =>
              payload.apps.some((app) => app.id === id),
            ) ?? [];
          const candidateAppIds = getAutoStopCandidateAppIds(
            trigger,
            payload.apps,
          );
          if (candidateAppIds.length > 0) {
            const requireMicSnapshot = stoppedTriggerAppIds.length === 0;
            if (
              pendingAutoStopRef.current &&
              !pendingAutoStopRef.current.requireMicSnapshot &&
              requireMicSnapshot
            ) {
              return;
            }

            scheduleAutoStop(
              AUTO_STOP_CONFIRM_DELAY_MS,
              candidateAppIds,
              payload.apps,
              requireMicSnapshot,
              store.getState().live.sessionId,
              !isOnlineRef.current ||
                isRecentNetworkDrop(lastReconnectAtMsRef.current, Date.now()),
            );
          }
        } else if (payload.type === "sleepStateChanged") {
          if (payload.value) {
            clearPendingAutoStop();
            stop();
          }
        } else if (payload.type === "micMuted") {
          setMuted(payload.value);
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlistenDetect = fn;
        }
      })
      .catch((err) => {
        console.error("Failed to setup detect event listener:", err);
      });

    return () => {
      cancelled = true;
      clearPendingAutoStop();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      unsubscribeStore();
      unlistenDetect?.();
    };
  });
};
