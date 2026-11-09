import { create as mutate } from "mutative";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Couper le micro ou le son système pendant l'écoute (issue 447) : la session
// continue, l'état suit le natif et survit à un rattachement.

const {
  dataHandlers,
  getCaptureSnapshotMock,
  setMicMutedMock,
  setSpeakerMutedMock,
  startCaptureMock,
  stopCaptureMock,
  warningMock,
  dismissMock,
} = vi.hoisted(() => ({
  dataHandlers: [] as Array<(event: { payload: unknown }) => void>,
  getCaptureSnapshotMock: vi.fn(),
  setMicMutedMock: vi.fn(async () => ({ status: "ok", data: null })),
  setSpeakerMutedMock: vi.fn(async () => ({ status: "ok", data: null })),
  startCaptureMock: vi.fn(),
  stopCaptureMock: vi.fn(),
  warningMock: vi.fn(),
  dismissMock: vi.fn(),
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: Object.assign(vi.fn(), {
    warning: warningMock,
    dismiss: dismissMock,
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
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
  commands: { runEventHooks: vi.fn(async () => ({ status: "ok" })) },
}));
vi.mock("@syntheo/plugin-icon", () => ({
  commands: { setRecordingIndicator: vi.fn(async () => ({ status: "ok" })) },
}));
vi.mock("@syntheo/plugin-local-api", () => ({
  commands: { dispatchEvent: vi.fn(async () => ({ status: "ok" })) },
}));
vi.mock("@syntheo/plugin-settings", () => ({
  commands: {
    vaultBase: vi.fn(async () => ({ status: "ok", data: "/tmp/syntheo" })),
  },
}));
vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    acknowledgeStoppedCapture: vi.fn(async () => ({ status: "ok" })),
    getCaptureSnapshot: getCaptureSnapshotMock,
    setMicMuted: setMicMutedMock,
    setSpeakerMuted: setSpeakerMutedMock,
    startCapture: startCaptureMock,
    startTranscription: vi.fn(),
    stopCapture: stopCaptureMock,
    stopTranscription: vi.fn(),
    updateCaptureConfig: vi.fn(),
  },
  events: {
    captureDataEvent: {
      listen: vi.fn(async (handler: (event: { payload: unknown }) => void) => {
        dataHandlers.push(handler);
        return () => {};
      }),
    },
    captureLifecycleEvent: { listen: vi.fn(async () => () => {}) },
    captureStatusEvent: { listen: vi.fn(async () => () => {}) },
  },
}));
vi.mock("~/cloud-api/client", () => ({
  syncCloudApiSnapshotBestEffort: vi.fn(),
}));

import { createListenerStore } from ".";
import { markLiveActive } from "./general-shared";

let store: ReturnType<typeof createListenerStore>;

function activeSnapshot(extra: Record<string, unknown> = {}) {
  return {
    status: "ok",
    data: {
      activeSessionId: "session-1",
      finalizingSessionIds: [],
      liveTranscriptionActive: true,
      requestedLiveTranscription: true,
      state: "active",
      ...extra,
    },
  };
}

async function listen(extra: Record<string, unknown> = {}) {
  const intervalId = setInterval(() => {}, 1000);
  getCaptureSnapshotMock.mockResolvedValueOnce(activeSnapshot(extra));
  store.setState((state) =>
    mutate(state, (draft) => {
      markLiveActive(draft.live, "session-1", intervalId, true, true, null);
    }),
  );
  await store.getState().attachLiveSession("session-1");
  return dataHandlers[dataHandlers.length - 1]!;
}

describe("canaux coupés pendant l'écoute", () => {
  beforeEach(() => {
    store = createListenerStore();
    dataHandlers.length = 0;
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
  });

  test("coupe chaque canal sans relancer ni arrêter la capture", async () => {
    await listen();

    store.getState().setSpeakerMuted(true);
    expect(store.getState().live.speakerMuted).toBe(true);
    expect(store.getState().live.muted).toBe(false);
    expect(setSpeakerMutedMock).toHaveBeenCalledWith(true);

    store.getState().setMuted(true);
    expect(setMicMutedMock).toHaveBeenCalledWith(true);
    expect(store.getState().live.status).toBe("active");
    expect(startCaptureMock).not.toHaveBeenCalled();
    expect(stopCaptureMock).not.toHaveBeenCalled();
    clearInterval(store.getState().live.intervalId);
  });

  test("les deux canaux coupés affichent le message, rétablir un canal le retire", async () => {
    await listen();

    store.getState().setMuted(true);
    expect(warningMock).not.toHaveBeenCalled();
    store.getState().setSpeakerMuted(true);
    expect(warningMock).toHaveBeenCalledOnce();
    expect(warningMock.mock.calls[0]![1]).toMatchObject({
      id: "muted-channels-session-1",
    });

    store.getState().setMuted(false);
    expect(dismissMock).toHaveBeenLastCalledWith("muted-channels-session-1");
    clearInterval(store.getState().live.intervalId);
  });

  test("suit les événements natifs de chaque canal", async () => {
    const data = await listen();

    data({
      payload: { type: "speaker_muted", session_id: "session-1", value: true },
    });
    expect(store.getState().live.speakerMuted).toBe(true);
    data({
      payload: { type: "mic_muted", session_id: "session-1", value: true },
    });
    expect(store.getState().live.muted).toBe(true);
    data({
      payload: { type: "speaker_muted", session_id: "other", value: false },
    });
    expect(store.getState().live.speakerMuted).toBe(true);
    clearInterval(store.getState().live.intervalId);
  });

  test("un rattachement (fenêtre rechargée) reprend l'état du natif", async () => {
    await listen({ micMuted: false, speakerMuted: true });

    expect(store.getState().live.speakerMuted).toBe(true);
    expect(store.getState().live.muted).toBe(false);
    clearInterval(store.getState().live.intervalId);
  });
});
