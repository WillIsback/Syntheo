import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import { commands as listenerCommands } from "@syntheo/plugin-transcription";
import { getCurrentWebviewWindowLabel } from "@syntheo/plugin-windows";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { useListener } from "./contexts";
import { finishPausedListening } from "./pause-listening";
import { useStartListeningWithBatchOverride } from "./useStartListeningWithBatchOverride";

import { useLatestRef } from "~/shared/hooks/useLatestRef";
import type { LivePause } from "~/store/zustand/listener/general-shared";
import { listenerStore } from "~/store/zustand/listener/instance";

const LISTENER_CONTROL_EVENT = "syntheo:listener-control";
// Pause de l'écoute (issue 353) : la fenêtre principale tient l'état et le
// diffuse aux autres fenêtres, qui ne voient que la capture native.
const LISTENER_PAUSE_STATE_EVENT = "syntheo:listener-pause-state";
// The main webview may be dead or reloading; if it hasn't stopped the
// capture by then, stop it natively.
const MAIN_STOP_FALLBACK_DELAY_MS = 1_500;

type ListenerControlAction =
  | "start"
  | "stop"
  | "pause"
  | "resume"
  | "finish"
  | "sync"
  // Issue 447 : couper ou rétablir un canal sans relancer l'écoute.
  | "muteMic"
  | "unmuteMic"
  | "muteSpeaker"
  | "unmuteSpeaker";

export type MutedChannel = "mic" | "speaker";

const CHANNEL_MUTE_ACTIONS: Partial<
  Record<ListenerControlAction, [MutedChannel, boolean]>
> = {
  muteMic: ["mic", true],
  unmuteMic: ["mic", false],
  muteSpeaker: ["speaker", true],
  unmuteSpeaker: ["speaker", false],
};

type ListenerControlRequest = {
  action: ListenerControlAction;
  requestId: string;
  sessionId: string;
};

export function isMainWebviewWindow() {
  return getCurrentWebviewWindowLabel() === "main";
}

// Fenêtre principale : coupe ou rétablit un canal de l'écoute en cours de
// `sessionId` (sans effet sur une autre session ou hors écoute).
export function applyChannelMuted(
  sessionId: string,
  channel: MutedChannel,
  muted: boolean,
) {
  const state = listenerStore.getState();
  if (state.live.sessionId !== sessionId || state.live.status !== "active") {
    return;
  }

  if (channel === "mic") {
    state.setMuted(muted);
  } else {
    state.setSpeakerMuted(muted);
  }
}

// File d'attente de la fenêtre principale, pour ses propres demandes (palette,
// bandeau flottant) sans passer par un événement.
let enqueueLocalRequest: ((request: ListenerControlRequest) => void) | null =
  null;

export async function requestMainListenerControl(
  action: ListenerControlAction,
  sessionId: string,
) {
  const payload = {
    action,
    requestId: crypto.randomUUID(),
    sessionId,
  } satisfies ListenerControlRequest;
  if (enqueueLocalRequest && isMainWebviewWindow()) {
    enqueueLocalRequest(payload);
    return;
  }

  const request = emitTo("main", LISTENER_CONTROL_EVENT, payload);

  // Une pause promet que le micro est fermé : comme pour l'arrêt, la capture
  // est coupée nativement si la fenêtre principale ne l'a pas fait.
  if (action !== "stop" && action !== "pause") {
    await request;
    return;
  }

  await request.catch((error) => {
    console.error(`Failed to request ${action} from the main window:`, error);
  });
  await new Promise((resolve) =>
    setTimeout(resolve, MAIN_STOP_FALLBACK_DELAY_MS),
  );
  await stopCaptureForSession(sessionId);
}

async function stopCaptureForSession(sessionId: string) {
  const result = await listenerCommands.stopCaptureForSession(sessionId);
  if (result.status === "error") {
    console.error("Failed to stop capture:", result.error);
  }
}

function broadcastPauseState(pause: LivePause | null) {
  void emit(LISTENER_PAUSE_STATE_EVENT, pause).catch((error) => {
    console.error("Failed to broadcast the listening pause state:", error);
  });
}

/**
 * Fenêtres secondaires (note détachée) : suit l'état de pause tenu par la
 * fenêtre principale.
 */
export function useMainListenerPauseState() {
  const syncRef = useLatestRef(useListener((state) => state.syncPauseState));

  useMountEffect(() => {
    if (isMainWebviewWindow()) {
      return;
    }

    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<LivePause | null>(LISTENER_PAUSE_STATE_EVENT, (event) => {
      if (active) {
        syncRef.current(event.payload);
      }
    }).then((fn) => {
      if (active) {
        unlisten = fn;
        void requestMainListenerControl("sync", "");
      } else {
        fn();
      }
    });

    return () => {
      active = false;
      unlisten?.();
    };
  });
}

export function MainListenerControlBridge() {
  const [requests, setRequests] = useState<ListenerControlRequest[]>([]);

  useMountEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    let pause = listenerStore.getState().live.pause;
    const unsubscribe = listenerStore.subscribe((state) => {
      if (state.live.pause !== pause) {
        pause = state.live.pause;
        broadcastPauseState(pause);
      }
    });
    const enqueue = (request: ListenerControlRequest) => {
      setRequests((current) => [...current, request]);
    };
    enqueueLocalRequest = enqueue;

    void listen<ListenerControlRequest>(LISTENER_CONTROL_EVENT, (event) => {
      if (!active) {
        return;
      }

      enqueue(event.payload);
    }).then((fn) => {
      if (active) {
        unlisten = fn;
      } else {
        fn();
      }
    });

    return () => {
      active = false;
      unlisten?.();
      unsubscribe();
      if (enqueueLocalRequest === enqueue) {
        enqueueLocalRequest = null;
      }
    };
  });

  const handleRequestHandled = useCallback((requestId: string) => {
    setRequests((current) => {
      if (current[0]?.requestId === requestId) {
        return current.slice(1);
      }

      return current.filter((request) => request.requestId !== requestId);
    });
  }, []);

  const request = requests[0];
  if (!request) {
    return null;
  }

  return (
    <MainListenerControlRequestRunner
      request={request}
      onHandled={handleRequestHandled}
    />
  );
}

function MainListenerControlRequestRunner({
  onHandled,
  request,
}: {
  onHandled: (requestId: string) => void;
  request: ListenerControlRequest;
}) {
  const startListening = useStartListeningWithBatchOverride(request.sessionId);
  const stop = useListener((state) => state.stop);
  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Keyed on the request only: guard state is read imperatively at arrival
  // time, so the effect never re-runs (and never advances the queue) while
  // the requested start is still in flight.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const live = listenerStore.getState().live;
      const isStartingOrActive = live.loading || live.status === "active";
      const isTarget = live.sessionId === request.sessionId;
      const isPaused =
        live.pause?.sessionId === request.sessionId &&
        live.pause.phase === "paused";

      switch (request.action) {
        case "start":
        case "resume":
          // Non-main windows cannot see this window's state, so they can send
          // duplicate start requests for a session that is already starting.
          if (
            (request.action === "start" || isPaused) &&
            (!isTarget || !isStartingOrActive)
          ) {
            await startListeningRef.current();
          }
          break;
        case "pause":
          if (isTarget && live.status === "active") {
            listenerStore.getState().pause();
          }
          break;
        case "stop":
        case "finish":
          if (isTarget) {
            stopRef.current();
          } else if (isPaused) {
            await finishPausedListening(request.sessionId);
          }
          break;
        case "sync":
          broadcastPauseState(live.pause);
          break;
        default: {
          const mute = CHANNEL_MUTE_ACTIONS[request.action];
          if (mute) {
            applyChannelMuted(request.sessionId, ...mute);
          }
        }
      }

      if (!cancelled) {
        onHandled(request.requestId);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [onHandled, request.action, request.requestId, request.sessionId]);

  return null;
}
