import { create as mutate } from "mutative";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Pause de l'écoute (issue 353) : en pause, aucune capture n'est ouverte, le
// minuteur s'arrête et rien de la fin de réunion (synthèse, automatisations)
// ne se déclenche.

const {
  acknowledgeStoppedCaptureMock,
  dispatchEventMock,
  getCaptureSnapshotMock,
  listenCaptureDataMock,
  listenCaptureLifecycleMock,
  listenCaptureStatusMock,
  runEventHooksMock,
  setRecordingIndicatorMock,
  startCaptureMock,
  stopCaptureMock,
} = vi.hoisted(() => ({
  acknowledgeStoppedCaptureMock: vi.fn(),
  dispatchEventMock: vi.fn(),
  getCaptureSnapshotMock: vi.fn(),
  listenCaptureDataMock: vi.fn(),
  listenCaptureLifecycleMock: vi.fn(),
  listenCaptureStatusMock: vi.fn(),
  runEventHooksMock: vi.fn(),
  setRecordingIndicatorMock: vi.fn(),
  startCaptureMock: vi.fn(),
  stopCaptureMock: vi.fn(),
}));

vi.mock("~/stt/speaker-context-capture", () => ({
  startSpeakerContextCapture: vi.fn(),
  observeSpeakerMicrophone: vi.fn(),
  stopSpeakerContextCapture: vi.fn(async () => {}),
}));

vi.mock("~/automations/engine", () => ({
  runMeetingCompletedAutomations: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: vi.fn(async () => "com.syntheo.stable"),
}));

vi.mock("@syntheo/plugin-detect", () => ({
  commands: {
    listMicUsingApplications: vi.fn(async () => ({ status: "ok", data: [] })),
  },
}));

vi.mock("@syntheo/plugin-hooks", () => ({
  commands: { runEventHooks: runEventHooksMock },
}));

vi.mock("@syntheo/plugin-icon", () => ({
  commands: { setRecordingIndicator: setRecordingIndicatorMock },
}));

vi.mock("@syntheo/plugin-local-api", () => ({
  commands: { dispatchEvent: dispatchEventMock },
}));

vi.mock("@syntheo/plugin-settings", () => ({
  commands: {
    vaultBase: vi.fn(async () => ({ status: "ok", data: "/tmp/syntheo" })),
  },
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    acknowledgeStoppedCapture: acknowledgeStoppedCaptureMock,
    getCaptureSnapshot: getCaptureSnapshotMock,
    setMicMuted: vi.fn(),
    startCapture: startCaptureMock,
    startTranscription: vi.fn(),
    stopCapture: stopCaptureMock,
    stopTranscription: vi.fn(),
    updateCaptureConfig: vi.fn(),
  },
  events: {
    captureDataEvent: { listen: listenCaptureDataMock },
    captureLifecycleEvent: { listen: listenCaptureLifecycleMock },
    captureStatusEvent: { listen: listenCaptureStatusMock },
  },
}));

vi.mock("~/cloud-api/client", () => ({
  syncCloudApiSnapshotBestEffort: vi.fn(),
}));

import { createListenerStore } from ".";
import {
  getListeningElapsedSeconds,
  isListeningPaused,
  markLiveActive,
} from "./general-shared";
import type { OnStoppedCallback } from "./transcript";

type LifecycleHandler = (event: { payload: Record<string, unknown> }) => void;

let store: ReturnType<typeof createListenerStore>;
let lifecycleHandlers: LifecycleHandler[];

const stoppedPayload = (sessionId: string, stoppedAtMs: number) => ({
  type: "stopped",
  session_id: sessionId,
  stopped_at_ms: stoppedAtMs,
  audio_path: null,
  requested_live_transcription: true,
  live_transcription_active: true,
  error: null,
});

// Une capture native active rattachée au store, comme après « Commencer ».
async function listenTo(sessionId: string, seconds: number) {
  const intervalId = setInterval(() => {}, 1000);
  getCaptureSnapshotMock.mockResolvedValueOnce({
    status: "ok",
    data: {
      activeSessionId: sessionId,
      finalizingSessionIds: [],
      liveTranscriptionActive: true,
      requestedLiveTranscription: true,
      state: "active",
    },
  });
  store.setState((state) =>
    mutate(state, (draft) => {
      markLiveActive(draft.live, sessionId, intervalId, true, true, null);
    }),
  );
  await store.getState().attachLiveSession(sessionId);
  store.setState((state) =>
    mutate(state, (draft) => {
      draft.live.seconds = seconds;
    }),
  );
  return lifecycleHandlers[lifecycleHandlers.length - 1]!;
}

describe("pause de l'écoute", () => {
  beforeEach(() => {
    store = createListenerStore();
    lifecycleHandlers = [];
    vi.clearAllMocks();
    getCaptureSnapshotMock.mockResolvedValue({
      status: "ok",
      data: {
        activeSessionId: null,
        finalizingSessionIds: [],
        liveTranscriptionActive: null,
        requestedLiveTranscription: null,
        state: "inactive",
      },
    });
    acknowledgeStoppedCaptureMock.mockResolvedValue({
      status: "ok",
      data: null,
    });
    listenCaptureLifecycleMock.mockImplementation(async (handler) => {
      lifecycleHandlers.push(handler);
      return () => {};
    });
    listenCaptureDataMock.mockResolvedValue(() => {});
    listenCaptureStatusMock.mockResolvedValue(() => {});
    runEventHooksMock.mockResolvedValue({ status: "ok", data: null });
    setRecordingIndicatorMock.mockResolvedValue({ status: "ok", data: null });
    startCaptureMock.mockResolvedValue({ status: "ok", data: null });
    stopCaptureMock.mockResolvedValue({ status: "ok", data: null });
    dispatchEventMock.mockResolvedValue({ status: "ok", data: 1 });
  });

  test("ferme la capture native et n'ouvre aucun flux audio pendant la pause", async () => {
    const onStopped = vi.fn(async () => {});
    store.getState().setOnStopped("session-1", onStopped);
    const lifecycle = await listenTo("session-1", 42);

    store.getState().pause();

    expect(store.getState().live.pause).toEqual({
      sessionId: "session-1",
      elapsedSeconds: 42,
      phase: "pausing",
    });
    await vi.waitFor(() => expect(stopCaptureMock).toHaveBeenCalledOnce());

    lifecycle({ payload: stoppedPayload("session-1", 1_234) });

    expect(onStopped).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ paused: true }),
    );
    await vi.waitFor(() =>
      expect(store.getState().live.pause?.phase).toBe("paused"),
    );
    const live = store.getState().live;
    // Plus aucune capture : ni session native active, ni minuteur.
    expect(live.status).toBe("inactive");
    expect(live.sessionId).toBeNull();
    expect(live.intervalId).toBeUndefined();
    expect(setRecordingIndicatorMock).toHaveBeenLastCalledWith(false);
    expect(startCaptureMock).not.toHaveBeenCalled();
    expect(isListeningPaused(live)).toBe(true);
    expect(isListeningPaused(live, "session-1")).toBe(true);
    expect(isListeningPaused(live, "session-2")).toBe(false);
    // La capture arrêtée est bien soldée côté natif.
    await vi.waitFor(() =>
      expect(acknowledgeStoppedCaptureMock).toHaveBeenCalledWith(
        "session-1",
        1_234,
      ),
    );
    // La réunion n'est pas terminée : ni événement ni automatisations.
    expect(dispatchEventMock).not.toHaveBeenCalled();
  });

  test("le minuteur s'arrête en pause et reprend sans compter la pause", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      store.getState().setOnStopped("session-1", async () => {});
      const lifecycle = await listenTo("session-1", 42);
      store.getState().pause();
      lifecycle({ payload: stoppedPayload("session-1", 1) });
      await vi.waitFor(() =>
        expect(store.getState().live.pause?.phase).toBe("paused"),
      );

      vi.advanceTimersByTime(600_000);
      expect(
        getListeningElapsedSeconds(store.getState().live, "session-1"),
      ).toBe(42);

      // Reprise : une nouvelle capture native de la même session.
      store.setState((state) =>
        mutate(state, (draft) => {
          markLiveActive(
            draft.live,
            "session-1",
            setInterval(() => {}, 1000),
            true,
            true,
            null,
          );
          draft.live.seconds = 8;
        }),
      );

      const live = store.getState().live;
      expect(live.pause).toBeNull();
      expect(getListeningElapsedSeconds(live, "session-1")).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });

  test("deux pauses et deux reprises gardent la même session et un minuteur continu", async () => {
    const onStopped = vi.fn<OnStoppedCallback>(async () => {});
    for (const [index, seconds] of [30, 20, 10].entries()) {
      store.getState().setOnStopped("session-1", onStopped);
      const lifecycle = await listenTo("session-1", seconds);
      if (index === 2) {
        // Dernière capture : « Terminer » finit la réunion normalement.
        expect(
          getListeningElapsedSeconds(store.getState().live, "session-1"),
        ).toBe(60);
        store.getState().stop();
        lifecycle({ payload: stoppedPayload("session-1", 3) });
        break;
      }
      store.getState().pause();
      lifecycle({ payload: stoppedPayload("session-1", index + 1) });
      await vi.waitFor(() =>
        expect(store.getState().live.pause?.phase).toBe("paused"),
      );
      expect(dispatchEventMock).not.toHaveBeenCalled();
    }

    expect(onStopped.mock.calls.map(([, details]) => details.paused)).toEqual([
      true,
      true,
      false,
    ]);
    await vi.waitFor(() =>
      expect(dispatchEventMock).toHaveBeenCalledWith(
        "meeting.completed",
        "session-1",
      ),
    );
    expect(dispatchEventMock).toHaveBeenCalledOnce();
    expect(store.getState().live.pause).toBeNull();
  });

  test("si l'arrêt de la capture échoue, l'écoute continue sans pause", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    stopCaptureMock.mockResolvedValueOnce({ status: "error", error: "boom" });
    await listenTo("session-1", 12);

    store.getState().pause();

    await vi.waitFor(() => expect(store.getState().live.status).toBe("active"));
    expect(store.getState().live.pause).toBeNull();
    consoleError.mockRestore();
  });

  test("ne met en pause qu'une écoute active", () => {
    store.getState().pause();

    expect(store.getState().live.pause).toBeNull();
    expect(stopCaptureMock).not.toHaveBeenCalled();
  });

  test("takePausedSession ne libère que la session réellement en pause", async () => {
    store.getState().setOnStopped("session-1", async () => {});
    const lifecycle = await listenTo("session-1", 5);
    store.getState().pause();
    // Encore en cours de mise en pause : le transcript n'est pas enregistré.
    expect(store.getState().takePausedSession("session-1")).toBe(false);
    lifecycle({ payload: stoppedPayload("session-1", 1) });
    await vi.waitFor(() =>
      expect(store.getState().live.pause?.phase).toBe("paused"),
    );

    expect(store.getState().takePausedSession("session-2")).toBe(false);
    expect(store.getState().takePausedSession("session-1")).toBe(true);
    expect(store.getState().live.pause).toBeNull();
    expect(store.getState().takePausedSession("session-1")).toBe(false);
  });
});
