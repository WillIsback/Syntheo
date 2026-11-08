import { create as mutate } from "mutative";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Regroupement des mises à jour de transcription en direct côté magasin
// (issue 444) : un seul `set` par fenêtre de 100 ms, persistance immédiate,
// et vidage du lot avant l'arrêt, la pause et la finalisation.

const {
  acknowledgeStoppedCaptureMock,
  getCaptureSnapshotMock,
  listenCaptureDataMock,
  listenCaptureLifecycleMock,
  listenCaptureStatusMock,
  stopCaptureMock,
} = vi.hoisted(() => ({
  acknowledgeStoppedCaptureMock: vi.fn(),
  getCaptureSnapshotMock: vi.fn(),
  listenCaptureDataMock: vi.fn(),
  listenCaptureLifecycleMock: vi.fn(),
  listenCaptureStatusMock: vi.fn(),
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
  commands: {
    runEventHooks: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

vi.mock("@syntheo/plugin-icon", () => ({
  commands: {
    setRecordingIndicator: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

vi.mock("@syntheo/plugin-local-api", () => ({
  commands: { dispatchEvent: vi.fn(async () => ({ status: "ok", data: 1 })) },
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
    startCapture: vi.fn(),
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
import { markLiveActive } from "./general-shared";
import { LIVE_TRANSCRIPT_BATCH_WINDOW_MS } from "./live-transcript-batch";

type Handler = (event: { payload: Record<string, unknown> }) => void;

const SESSION = "session-1";

let store: ReturnType<typeof createListenerStore>;
let dataHandler: Handler;
let lifecycleHandler: Handler;
let persist: ReturnType<typeof vi.fn>;

const segment = (id: string, text: string, startMs = 0) => ({
  id,
  key: { channel: "DirectMic" },
  start_ms: startMs,
  end_ms: startMs + 500,
  text,
  words: [],
});

const word = (id: string, text: string, startMs: number) => ({
  id,
  text,
  start_ms: startMs,
  end_ms: startMs + 200,
  channel: 0,
});

const sendSegments = (upserts: unknown[], removedIds: string[] = []) =>
  dataHandler({
    payload: {
      session_id: SESSION,
      type: "transcript_segment_delta",
      delta: { upserts, removed_ids: removedIds },
    },
  });

const sendTranscript = (delta: {
  new_words?: unknown[];
  replaced_ids?: string[];
  partials?: unknown[];
}) =>
  dataHandler({
    payload: {
      session_id: SESSION,
      type: "transcript_delta",
      delta: {
        new_words: delta.new_words ?? [],
        replaced_ids: delta.replaced_ids ?? [],
        partials: delta.partials ?? [],
      },
    },
  });

// Compte les `set` du magasin qui touchent la transcription en direct.
const countTranscriptSets = () => {
  let count = 0;
  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.liveSegments !== previous.liveSegments ||
      state.liveCaptionText !== previous.liveCaptionText ||
      state.partialWordsByChannel !== previous.partialWordsByChannel
    ) {
      count += 1;
    }
  });
  return { get: () => count, unsubscribe };
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  store = createListenerStore();
  persist = vi.fn();
  listenCaptureDataMock.mockImplementation(async (handler: Handler) => {
    dataHandler = handler;
    return () => {};
  });
  listenCaptureLifecycleMock.mockImplementation(async (handler: Handler) => {
    lifecycleHandler = handler;
    return () => {};
  });
  listenCaptureStatusMock.mockResolvedValue(() => {});
  stopCaptureMock.mockResolvedValue({ status: "ok", data: null });
  acknowledgeStoppedCaptureMock.mockResolvedValue({ status: "ok", data: null });
  getCaptureSnapshotMock.mockResolvedValue({
    status: "ok",
    data: {
      activeSessionId: SESSION,
      finalizingSessionIds: [],
      liveSegments: [],
      liveTranscriptionActive: true,
      requestedLiveTranscription: true,
      state: "active",
    },
  });
  store.setState((state) =>
    mutate(state, (draft) => {
      markLiveActive(
        draft.live,
        SESSION,
        setInterval(() => {}, 1_000),
        true,
        true,
        null,
      );
    }),
  );
  await store
    .getState()
    .attachLiveSession(SESSION, { handlePersist: persist as never });
});

afterEach(() => {
  clearInterval(store.getState().live.intervalId);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("transcription en direct regroupée", () => {
  test("un seul set du magasin par fenêtre, dans l'ordre", () => {
    const sets = countTranscriptSets();

    sendTranscript({ partials: [word("p", " bon", 0)] });
    sendSegments([segment("a", "bon")]);
    vi.advanceTimersByTime(40);
    sendTranscript({ partials: [word("p", " bonjour", 0)] });
    sendSegments([segment("a", "bonjour")]);
    sendSegments([segment("b", "tous", 600)]);
    sendSegments([], ["b"]);
    vi.advanceTimersByTime(40);
    sendTranscript({ new_words: [word("w1", " bonjour", 0)] });
    sendSegments([segment("c", "à", 700)]);

    expect(sets.get()).toBe(0);
    expect(store.getState().liveSegments).toEqual([]);

    vi.advanceTimersByTime(LIVE_TRANSCRIPT_BATCH_WINDOW_MS - 80);

    expect(sets.get()).toBe(1);
    expect(store.getState().liveSegments).toMatchObject([
      { id: "a", text: "bonjour" },
      { id: "c", text: "à" },
    ]);
    expect(store.getState().liveCaptionText).toBe("bonjour");
    expect(store.getState().partialWordsByChannel).toEqual({});
    sets.unsubscribe();
  });

  test("persiste les mots finaux dès leur réception", () => {
    sendTranscript({ new_words: [word("w1", " salut", 0)] });

    expect(persist).toHaveBeenCalledOnce();
    expect(store.getState().liveCaptionText).toBe("");
    vi.advanceTimersByTime(LIVE_TRANSCRIPT_BATCH_WINDOW_MS);
    expect(store.getState().liveCaptionText).toBe("salut");
  });

  test("vide le lot à l'arrêt demandé, avant la finalisation", () => {
    sendSegments([segment("a", "dernier mot")]);
    sendTranscript({ partials: [word("p", " encore", 0)] });

    store.getState().stop();

    expect(store.getState().live.status).toBe("finalizing");
    expect(store.getState().liveSegments).toMatchObject([
      { id: "a", text: "dernier mot" },
    ]);
    expect(store.getState().partialWordsByChannel[0]).toHaveLength(1);
  });

  test("vide le lot à la pause", () => {
    sendSegments([segment("a", "avant la pause")]);

    store.getState().pause();

    expect(store.getState().live.pause?.phase).toBe("pausing");
    expect(store.getState().liveSegments).toMatchObject([
      { id: "a", text: "avant la pause" },
    ]);
  });

  test("aucun mot en attente quand la session se finalise côté natif", () => {
    const seen: string[][] = [];
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.live.status !== previous.live.status) {
        seen.push(state.liveSegments.map((s) => s.text));
      }
    });
    sendSegments([segment("a", "fin de phrase")]);

    lifecycleHandler({ payload: { type: "finalizing", session_id: SESSION } });

    expect(seen).toEqual([["fin de phrase"]]);
    unsubscribe();
  });

  test("le partiel en attente compte dans la réparation à l'arrêt natif", () => {
    const onStopped = vi.fn();
    store.getState().setOnStopped(SESSION, onStopped);
    sendTranscript({ partials: [word("p", " inachevé", 0)] });

    lifecycleHandler({
      payload: {
        type: "stopped",
        session_id: SESSION,
        stopped_at_ms: 1_000,
        audio_path: null,
        requested_live_transcription: true,
        live_transcription_active: true,
        error: null,
      },
    });

    // Le lot est vidé avant l'arrêt : le partiel non finalisé est vu, puis
    // l'aperçu est remis à zéro.
    expect(onStopped).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ needsBatchRepair: true }),
    );
    expect(store.getState().liveSegments).toEqual([]);
    vi.advanceTimersByTime(LIVE_TRANSCRIPT_BATCH_WINDOW_MS);
    expect(store.getState().partialWordsByChannel).toEqual({});
  });
});
