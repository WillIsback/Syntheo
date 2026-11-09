import { t } from "@lingui/core/macro";

import { commands as detectCommands } from "@syntheo/plugin-detect";
import { commands as notificationCommands } from "@syntheo/plugin-notification";

import { AUTO_STOP_ACCESSIBILITY_TIMEOUT_MS } from "./auto-stop";
import { cancelAutoStopEndedNotification } from "./auto-stop-notification";
import { recordDetectedMeetingApps } from "./meeting-source-apps";

import type { ListenerStore } from "~/store/zustand/listener";

export const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

export type PendingAutoStop = {
  timeout?: ReturnType<typeof setTimeout>;
  requireMicSnapshot: boolean;
  sessionId: string | null;
  networkInterrupted: boolean;
  networkHoldUntilMs?: number;
};

export function getMicDetectedNotificationTitle(): string {
  return t`Are you in a meeting?`;
}

/**
 * Inspection d'accessibilité avant un arrêt automatique. Une seule
 * inspection native tourne à la fois ; au-delà du délai, le résultat vaut
 * `null`.
 */
export function createAutoStopAccessibilityInspector() {
  let accessibilityInspection: Promise<Awaited<
    ReturnType<typeof detectCommands.inspectMeetingAccessibility>
  > | null> | null = null;

  async function inspectForAutoStop() {
    // A timed-out native walk may still run and its result may be stale for a new stop event.
    if (accessibilityInspection) {
      return null;
    }
    accessibilityInspection = detectCommands
      .inspectMeetingAccessibility()
      .catch(() => null)
      .finally(() => {
        accessibilityInspection = null;
      });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        accessibilityInspection,
        new Promise<null>((resolve) => {
          timeout = setTimeout(
            () => resolve(null),
            AUTO_STOP_ACCESSIBILITY_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  return inspectForAutoStop;
}

/** Ajoute des applications aux déclencheurs de la capture en cours. */
export function captureDetectedTriggerApps(
  store: ListenerStore,
  clearPendingAutoStop: () => void,
  apps: { id: string; name: string }[],
) {
  const appIds = apps.map((app) => app.id);
  if (appIds.length === 0) {
    return;
  }

  const currentLive = store.getState().live;
  const currentTrigger = currentLive.triggerAppIds ?? [];
  if (appIds.some((id) => currentTrigger.includes(id))) {
    clearPendingAutoStop();
    if (
      currentLive.sessionId &&
      cancelAutoStopEndedNotification(currentLive.sessionId)
    ) {
      void notificationCommands
        .clearNotifications()
        .catch((error) =>
          console.error("[listener] failed to clear notifications", error),
        );
    }
  }
  store
    .getState()
    .setTriggerAppIds([...new Set([...currentTrigger, ...appIds])]);
  if (currentLive.sessionId) {
    void recordDetectedMeetingApps(currentLive.sessionId, apps).catch((error) =>
      console.warn("[listener] failed to persist detected meeting apps", error),
    );
  }
}
