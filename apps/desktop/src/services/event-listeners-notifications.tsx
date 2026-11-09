import { type UnlistenFn } from "@tauri-apps/api/event";

import {
  events as notificationEvents,
  type NotificationEvent,
  type NotificationSource,
} from "@syntheo/plugin-notification";
import { getCurrentWebviewWindowLabel } from "@syntheo/plugin-windows";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import {
  hasPreparedNoteStart,
  startPreparedNoteFromShortcut,
} from "~/session/components/capsule/start-shortcut";
import { createSession } from "~/session/queries";
import { setSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";
import { useLatestRef } from "~/shared/hooks/useLatestRef";
import { listenerStore } from "~/store/zustand/listener/instance";
import { useTabs } from "~/store/zustand/tabs";
import {
  consumeAutoStopEndedNotificationKey,
  parseAutoStopEndedNotificationKey,
} from "~/stt/auto-stop-notification";

async function createNotificationSession(
  triggerAppIds: string[] | null,
): Promise<string> {
  const sessionId = await createSession();

  if (triggerAppIds && triggerAppIds.length > 0) {
    listenerStore.getState().setTriggerAppIds(triggerAppIds);
  }

  return sessionId;
}

function handleAutoStopEndedNotification(
  type: "notification_confirm" | "notification_accept" | "notification_timeout",
  key: string,
): boolean {
  const parsedSessionId = parseAutoStopEndedNotificationKey(key);
  if (!parsedSessionId) {
    return false;
  }

  if (type === "notification_confirm") {
    return true;
  }

  const sessionId = consumeAutoStopEndedNotificationKey(key);
  if (!sessionId) {
    return true;
  }

  const listenerState = listenerStore.getState();
  if (
    listenerState.live.status === "active" &&
    listenerState.live.sessionId === sessionId
  ) {
    listenerState.stop();
  }

  return true;
}

type OpenNewFn = ReturnType<typeof useTabs.getState>["openNew"];
type OpenNewRef = { current: OpenNewFn };

type ConfirmAcceptTimeoutEvent = Extract<
  NotificationEvent,
  {
    type:
      | "notification_confirm"
      | "notification_accept"
      | "notification_timeout";
  }
>;
type FooterActionEvent = Extract<
  NotificationEvent,
  { type: "notification_footer_action" }
>;

function getSessionIdFromSource(
  source: NotificationSource | null,
): string | null {
  if (source?.type === "session") {
    return source.session_id;
  }
  return null;
}

function getTriggerAppIdsFromSource(
  source: NotificationSource | null,
): string[] | null {
  if (source?.type === "mic_detected") {
    return source.app_ids ?? null;
  }
  return null;
}

// « Êtes-vous en réunion ? » → oui, alors qu'une note est en Préparer au
// premier plan : l'utilisateur prépare justement cette réunion. L'écoute
// démarre dans cette note (même choix que Ctrl ⇧ N) au lieu d'en créer une
// nouvelle. Sans note en préparation, rien ne change.
function startDetectedMeetingInPreparedNote(
  triggerAppIds: string[] | null,
): boolean {
  if (!hasPreparedNoteStart()) {
    return false;
  }

  listenerStore
    .getState()
    .setTriggerAppIds(
      triggerAppIds && triggerAppIds.length > 0 ? triggerAppIds : null,
    );
  return startPreparedNoteFromShortcut();
}

function handleConfirmAcceptTimeoutEvent(
  payload: ConfirmAcceptTimeoutEvent,
  openNewRef: OpenNewRef,
) {
  if (handleAutoStopEndedNotification(payload.type, payload.key)) {
    return;
  }

  if (payload.type === "notification_timeout") {
    return;
  }

  if (payload.key?.startsWith("team-invitation:")) {
    openNewRef.current({ type: "settings", state: { tab: "team" } });
    return;
  }

  const source = payload.source;
  const sourceSessionId = getSessionIdFromSource(source);
  const triggerAppIds = getTriggerAppIdsFromSource(source);

  if (sourceSessionId) {
    openNewRef.current({
      type: "sessions",
      id: sourceSessionId,
      state: {
        view: null,
        autoStart: null,
      },
    });
    return;
  }

  if (source?.type !== "mic_detected") {
    return;
  }

  if (startDetectedMeetingInPreparedNote(triggerAppIds)) {
    return;
  }

  void createNotificationSession(triggerAppIds)
    .then((sessionId) => {
      openNewRef.current({
        type: "sessions",
        id: sessionId,
        state: {
          view: null,
          autoStart: true,
        },
      });
    })
    .catch((error) => {
      console.error(
        "[notification] failed to open notification session",
        error,
      );
    });
}

function handleFooterActionEvent(
  payload: FooterActionEvent,
  ignoredPlatforms: string[],
) {
  if (payload.source?.type !== "mic_detected") {
    return;
  }

  const appIds = payload.source.app_ids ?? [];
  if (appIds.length === 0) {
    return;
  }

  const nextIgnoredPlatforms = [...new Set([...ignoredPlatforms, ...appIds])];

  if (nextIgnoredPlatforms.length === ignoredPlatforms.length) {
    return;
  }

  void setSettingValue(
    "ignored_platforms",
    JSON.stringify(nextIgnoredPlatforms),
  ).catch((error) => {
    console.error("[notification] failed to ignore platforms", error);
  });
}

export function useNotificationEvents() {
  const ignoredPlatforms = useConfigValue("ignored_platforms");
  const openNew = useTabs((state) => state.openNew);
  const ignoredPlatformsRef = useLatestRef(ignoredPlatforms);
  const openNewRef = useLatestRef(openNew);

  useMountEffect(() => {
    if (getCurrentWebviewWindowLabel() !== "main") {
      return;
    }

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    void notificationEvents.notificationEvent
      .listen(({ payload }) => {
        switch (payload.type) {
          case "notification_confirm":
          case "notification_accept":
          case "notification_timeout":
            handleConfirmAcceptTimeoutEvent(payload, openNewRef);
            break;
          case "notification_footer_action":
            handleFooterActionEvent(payload, ignoredPlatformsRef.current);
            break;
        }
      })
      .then((f) => {
        if (cancelled) {
          f();
        } else {
          unlisten = f;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  });
}
