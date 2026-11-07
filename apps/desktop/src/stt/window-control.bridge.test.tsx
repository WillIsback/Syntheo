import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Issue 353 : la fenêtre principale exécute pause, reprise et « Terminer »,
// et diffuse l'état de pause aux autres fenêtres (notes détachées).

type Live = {
  sessionId: string | null;
  status: "inactive" | "active" | "finalizing";
  loading: boolean;
  pause: { sessionId: string; elapsedSeconds: number; phase: string } | null;
};

const hoisted = vi.hoisted(() => {
  const subscribers = new Set<(state: { live: Live }) => void>();
  const state = {
    live: {
      sessionId: null,
      status: "inactive",
      loading: false,
      pause: null,
    } as Live,
    pause: vi.fn(),
    stop: vi.fn(),
  };
  return {
    controlHandler: null as
      | ((event: { payload: Record<string, string> }) => void)
      | null,
    emit: vi.fn(async () => {}),
    emitTo: vi.fn(async () => {}),
    finishPausedListening: vi.fn(async () => true),
    startListening: vi.fn(async () => {}),
    state,
    store: {
      getState: () => state,
      subscribe: (listener: (state: { live: Live }) => void) => {
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      },
      publish: (live: Live) => {
        state.live = live;
        subscribers.forEach((listener) => listener(state));
      },
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  emit: hoisted.emit,
  emitTo: hoisted.emitTo,
  listen: vi.fn(async (_event: string, handler: never) => {
    hoisted.controlHandler = handler;
    return () => {};
  }),
}));
vi.mock("@syntheo/plugin-transcription", () => ({
  commands: { stopCaptureForSession: vi.fn() },
}));
vi.mock("@syntheo/plugin-windows", () => ({
  getCurrentWebviewWindowLabel: () => "main",
}));
vi.mock("./contexts", () => ({
  useListener: (selector: (state: typeof hoisted.state) => unknown) =>
    selector(hoisted.state),
}));
vi.mock("./useStartListeningWithBatchOverride", () => ({
  useStartListeningWithBatchOverride: () => hoisted.startListening,
}));
vi.mock("./pause-listening", () => ({
  finishPausedListening: hoisted.finishPausedListening,
}));
vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: hoisted.store,
}));

import { MainListenerControlBridge } from "./window-control";

async function send(action: string, sessionId = "session-1") {
  await act(async () => {
    hoisted.controlHandler?.({
      payload: { action, requestId: `${action}-${Math.random()}`, sessionId },
    });
  });
  await act(async () => {});
}

describe("MainListenerControlBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.controlHandler = null;
    hoisted.state.live = {
      sessionId: null,
      status: "inactive",
      loading: false,
      pause: null,
    };
  });

  test("met en pause l'écoute active demandée", async () => {
    hoisted.state.live = {
      sessionId: "session-1",
      status: "active",
      loading: false,
      pause: null,
    };
    render(<MainListenerControlBridge />);
    await act(async () => {});

    await send("pause");

    expect(hoisted.state.pause).toHaveBeenCalledOnce();
  });

  test("reprend seulement la session en pause", async () => {
    render(<MainListenerControlBridge />);
    await act(async () => {});

    await send("resume");
    expect(hoisted.startListening).not.toHaveBeenCalled();

    hoisted.state.live = {
      sessionId: null,
      status: "inactive",
      loading: false,
      pause: { sessionId: "session-1", elapsedSeconds: 12, phase: "paused" },
    };
    await send("resume");
    expect(hoisted.startListening).toHaveBeenCalledOnce();
  });

  test("« Terminer » pendant la pause finit la réunion sans nouvelle capture", async () => {
    hoisted.state.live = {
      sessionId: null,
      status: "inactive",
      loading: false,
      pause: { sessionId: "session-1", elapsedSeconds: 12, phase: "paused" },
    };
    render(<MainListenerControlBridge />);
    await act(async () => {});

    await send("finish");

    expect(hoisted.finishPausedListening).toHaveBeenCalledWith("session-1");
    expect(hoisted.state.stop).not.toHaveBeenCalled();
    expect(hoisted.startListening).not.toHaveBeenCalled();
  });

  test("diffuse l'état de pause aux autres fenêtres", async () => {
    render(<MainListenerControlBridge />);
    await act(async () => {});
    const pause = {
      sessionId: "session-1",
      elapsedSeconds: 12,
      phase: "paused",
    };

    act(() => {
      hoisted.store.publish({ ...hoisted.state.live, pause });
    });

    expect(hoisted.emit).toHaveBeenCalledWith(
      "syntheo:listener-pause-state",
      pause,
    );
  });
});
