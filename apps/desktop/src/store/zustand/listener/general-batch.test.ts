import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  recoverRunningBatchSessions,
  runBatchSession,
  shouldUseSyntheticBatchProgress,
  syntheticBatchProgress,
} from "./general-batch";

import { BatchResponseProcessingError } from "~/stt/batch-response-processing-error";
import { NoSpeechDetectedError } from "~/stt/no-speech-error";

const {
  isFocusedMock,
  isVisibleMock,
  acknowledgeCompletedTranscriptionMock,
  getCompletedTranscriptionMock,
  listTranscriptionSessionsMock,
  listenMock,
  playCompletionSoundMock,
  requestAppAttentionMock,
  shouldShowNotificationMock,
  showNotificationMock,
  startTranscriptionMock,
  stopTranscriptionMock,
} = vi.hoisted(() => ({
  isFocusedMock: vi.fn(),
  isVisibleMock: vi.fn(),
  acknowledgeCompletedTranscriptionMock: vi.fn(),
  getCompletedTranscriptionMock: vi.fn(),
  listTranscriptionSessionsMock: vi.fn(),
  listenMock: vi.fn(),
  playCompletionSoundMock: vi.fn(),
  requestAppAttentionMock: vi.fn(),
  shouldShowNotificationMock: vi.fn(),
  showNotificationMock: vi.fn(),
  startTranscriptionMock: vi.fn(),
  stopTranscriptionMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  UserAttentionType: { Critical: 1, Informational: 2 },
  getCurrentWindow: () => ({
    isFocused: isFocusedMock,
    isVisible: isVisibleMock,
  }),
}));

vi.mock("~/shared/completion-sound", () => ({
  playCompletionSound: playCompletionSoundMock,
}));

vi.mock("~/shared/app-attention", () => ({
  requestAppAttention: requestAppAttentionMock,
}));

vi.mock("~/shared/notification-policy", () => ({
  shouldShowNotification: shouldShowNotificationMock,
}));

vi.mock("@syntheo/plugin-notification", () => ({
  commands: {
    showNotification: showNotificationMock,
  },
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  events: {
    transcriptionEvent: {
      listen: listenMock,
    },
  },
  commands: {
    acknowledgeCompletedTranscription: acknowledgeCompletedTranscriptionMock,
    getCompletedTranscription: getCompletedTranscriptionMock,
    listTranscriptionSessions: listTranscriptionSessionsMock,
    startTranscription: startTranscriptionMock,
    stopTranscription: stopTranscriptionMock,
  },
}));

const SESSION = "session-1";
const PARAMS = {
  session_id: SESSION,
  provider: "openai",
  file_path: "/tmp/session.wav",
  base_url: "",
  api_key: "",
} as const;
const EMPTY_RESPONSE = { metadata: null, results: { channels: [] } };
const completed = (mode: "direct" | "streamed" = "streamed") => ({
  type: "completed",
  session_id: SESSION,
  mode,
  response: EMPTY_RESPONSE,
});
const ALREADY_RUNNING = "batch error: session already running";

const makeStore = (overrides: Record<string, unknown> = {}) => ({
  batch: {} as Record<string, { percentage: number; recovered?: boolean }>,
  batchImport: {},
  batchPreview: {},
  batchPersist: {},
  handleBatchStarted: vi.fn(),
  handleBatchRecovered: vi.fn(),
  handleBatchResponse: vi.fn((): boolean => true),
  handleBatchCompleted: vi.fn(),
  clearBatchPersist: vi.fn(),
  clearBatchSession: vi.fn(),
  handleBatchResponseStreamed: vi.fn(),
  handleBatchFailed: vi.fn(),
  handleBatchStopped: vi.fn(),
  updateBatchProgress: vi.fn(),
  setBatchPersist: vi.fn(),
  handleImportStarted: vi.fn(),
  handleImportEnded: vi.fn(),
  ...overrides,
});

// Capture le gestionnaire d'événements de transcription natif.
const captureEvents = (unlisten = vi.fn()) => {
  let handler: ((event: { payload: unknown }) => void) | undefined;
  listenMock.mockImplementation(async (cb) => {
    handler = cb;
    return unlisten;
  });
  return {
    unlisten,
    emit: (...payloads: unknown[]) => {
      for (const payload of payloads) handler?.({ payload });
    },
  };
};

// Émet les événements dans une micro-tâche, avant ou après la réponse de
// `startTranscription`.
const startEmitting = (
  events: ReturnType<typeof captureEvents>,
  payloads: unknown[],
  order: "before-resolve" | "after-resolve",
) => {
  const ok = { status: "ok", data: null };
  startTranscriptionMock.mockImplementation(async () => {
    if (order === "after-resolve") {
      queueMicrotask(() => events.emit(...payloads));
      return ok;
    }
    return new Promise((resolve) => {
      queueMicrotask(() => {
        events.emit(...payloads);
        resolve(ok);
      });
    });
  });
};

const deferStart = () => {
  let resolveStart!: (value: unknown) => void;
  startTranscriptionMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
  );
  return (value: unknown) => resolveStart(value);
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("runBatchSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFocusedMock.mockResolvedValue(true);
    isVisibleMock.mockResolvedValue(true);
    showNotificationMock.mockResolvedValue({ status: "ok", data: null });
    playCompletionSoundMock.mockResolvedValue(undefined);
    requestAppAttentionMock.mockResolvedValue(undefined);
    shouldShowNotificationMock.mockResolvedValue(true);
  });

  test.each(["ok", "error"])(
    "handles an aborted %s startup as cancellation",
    async (status) => {
      const abort = new AbortController();
      const { unlisten } = captureEvents();
      const resolveStart = deferStart();
      stopTranscriptionMock.mockResolvedValue({ status: "ok", data: null });
      const store = makeStore();
      const run = runBatchSession(
        () => store,
        "dictation",
        { ...PARAMS, session_id: "dictation", file_path: "/tmp/dictation.wav" },
        { signal: abort.signal },
      );
      const rejected = expect(run).rejects.toThrow("Transcription stopped.");
      await flushMicrotasks();
      abort.abort();
      resolveStart(
        status === "ok"
          ? { status, data: null }
          : { status, error: "Startup failed" },
      );
      await rejected;
      if (status === "ok") {
        expect(stopTranscriptionMock).toHaveBeenCalledWith("dictation");
      } else expect(stopTranscriptionMock).not.toHaveBeenCalled();
      expect(store.handleBatchStopped).toHaveBeenCalledWith("dictation");
      expect(unlisten).toHaveBeenCalledOnce();
    },
  );

  test.each([
    {
      expected: true,
      params: {
        model: "mistralai/Voxtral-Mini-3B-2507",
        base_url: "http://192.168.1.87:8000/v1",
      },
    },
    { expected: false, params: { model: "gpt-4o-transcribe" } },
    // Le flux temps réel d'un fichier rapporte sa vraie progression.
    {
      expected: false,
      params: {
        provider: "realtime" as const,
        file_path: "/tmp/archive.mp4",
        model: "nemotron-3.5-asr-streaming-0.6b",
        base_url: "http://192.168.1.87:9000/?provider=nvidia",
      },
    },
  ])(
    "uses synthetic progress only for blocking batch providers ($params.model)",
    ({ expected, params }) => {
      expect(shouldUseSyntheticBatchProgress({ ...PARAMS, ...params })).toBe(
        expected,
      );
    },
  );

  test("caps synthetic progress before completion", () => {
    expect(syntheticBatchProgress(0)).toBe(0.06);
    expect(syntheticBatchProgress(60_000)).toBeLessThan(0.88);
    expect(syntheticBatchProgress(10_000_000)).toBe(0.88);
  });

  test.each([false, true])(
    "ticks synthetic progress for blocking batch providers (backend started: %s)",
    async (backendStarted) => {
      vi.useFakeTimers();
      try {
        const events = captureEvents();
        const resolveStart = deferStart();
        const store = makeStore();
        const runPromise = runBatchSession(() => store, SESSION, PARAMS);
        await flushMicrotasks();

        if (backendStarted) {
          events.emit({ type: "started", session_id: SESSION });
          expect(store.handleBatchStarted).toHaveBeenCalledTimes(1);
        }
        expect(store.updateBatchProgress).toHaveBeenCalledWith(SESSION, 0.06);

        vi.advanceTimersByTime(1_600);
        expect(
          store.updateBatchProgress.mock.calls.some(
            ([, percentage]) => percentage > 0.06 && percentage < 0.88,
          ),
        ).toBe(true);

        events.emit(completed("direct"));
        resolveStart({ status: "ok", data: null });
        await runPromise;

        const callCount = store.updateBatchProgress.mock.calls.length;
        vi.advanceTimersByTime(1_600);
        expect(store.updateBatchProgress).toHaveBeenCalledTimes(callCount);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  test("resolves from the completed event and persists the response", async () => {
    const events = captureEvents();
    startEmitting(events, [completed()], "before-resolve");
    const store = makeStore();

    await runBatchSession(() => store, SESSION, PARAMS);

    expect(store.handleBatchStarted).toHaveBeenCalledWith(SESSION);
    expect(store.handleBatchResponse).toHaveBeenCalledWith(
      SESSION,
      EMPTY_RESPONSE,
    );
    expect(store.clearBatchPersist).toHaveBeenCalledWith(SESSION);
    expect(store.clearBatchSession).toHaveBeenCalledWith(SESSION);
    expect(store.handleBatchFailed).not.toHaveBeenCalled();
    expect(store.handleBatchResponseStreamed).not.toHaveBeenCalled();
    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  test("marks response processing failures after completion as terminal", async () => {
    const processingError = new Error("database is locked");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const events = captureEvents();
    startEmitting(events, [completed("direct")], "after-resolve");
    const store = makeStore({
      handleBatchResponse: vi.fn(() => {
        throw processingError;
      }),
    });

    const run = runBatchSession(() => store, SESSION, {
      ...PARAMS,
      base_url: "http://192.168.1.87:8000/v1",
      api_key: "test-key",
    });

    await expect(run).rejects.toMatchObject({
      name: BatchResponseProcessingError.name,
      cause: processingError,
    });
    expect(startTranscriptionMock).toHaveBeenCalledOnce();
    expect(store.handleBatchFailed).toHaveBeenCalledWith(
      SESSION,
      "database is locked",
    );
    expect(store.clearBatchPersist).toHaveBeenCalledWith(SESSION);
    expect(store.clearBatchSession).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test.each([
    { notifyOnCompletion: undefined, expectedSounds: 1 },
    { notifyOnCompletion: false, expectedSounds: 0 },
  ])(
    "plays $expectedSounds completion sounds without a notification or Dock bounce when notifyOnCompletion is $notifyOnCompletion",
    async ({ notifyOnCompletion, expectedSounds }) => {
      isFocusedMock.mockResolvedValue(false);
      const events = captureEvents();
      startEmitting(events, [completed()], "before-resolve");

      await runBatchSession(() => makeStore(), SESSION, PARAMS, {
        notifyOnCompletion,
      });

      expect(showNotificationMock).not.toHaveBeenCalled();
      expect(requestAppAttentionMock).not.toHaveBeenCalled();
      expect(playCompletionSoundMock).toHaveBeenCalledTimes(expectedSounds);
    },
  );

  test("forwards streamed progress events before completion", async () => {
    const progressEvent = {
      type: "progress" as const,
      percentage: 0.42,
      partial_text: "hello there",
    };
    const events = captureEvents();
    startEmitting(
      events,
      [
        { type: "progress", session_id: SESSION, event: progressEvent },
        completed(),
      ],
      "before-resolve",
    );
    const store = makeStore();

    await runBatchSession(() => store, SESSION, PARAMS);

    expect(store.handleBatchResponseStreamed).toHaveBeenCalledWith(
      SESSION,
      progressEvent,
    );
    expect(store.handleBatchResponse).toHaveBeenCalledWith(
      SESSION,
      EMPTY_RESPONSE,
    );
    expect(store.handleBatchFailed).not.toHaveBeenCalled();
  });

  test.each([
    { recovery: false, empty: true },
    { recovery: true, empty: true },
    { recovery: false, empty: false },
    { recovery: true, empty: false },
  ])(
    "classifies persist failures (recovery=$recovery, empty=$empty)",
    async ({ recovery, empty }) => {
      const message = empty
        ? "No speech was detected in the audio."
        : "disk full";
      const events = captureEvents();
      startEmitting(events, [completed("direct")], "after-resolve");
      const store = makeStore({
        handleBatchResponse: vi.fn(() => {
          if (empty) return false;
          throw new Error(message);
        }),
      });

      await expect(
        runBatchSession(() => store, SESSION, PARAMS, { recovery }),
      ).rejects.toThrow(
        empty ? NoSpeechDetectedError : BatchResponseProcessingError,
      );

      expect(store.handleBatchFailed).toHaveBeenCalledWith(SESSION, message);
      expect(store.clearBatchPersist).toHaveBeenCalledWith(SESSION);
      expect(store.clearBatchSession).not.toHaveBeenCalled();
    },
  );

  test("rejects when the transcription is stopped", async () => {
    const events = captureEvents();
    startEmitting(
      events,
      [{ type: "stopped", session_id: SESSION }],
      "after-resolve",
    );
    const store = makeStore();

    await expect(runBatchSession(() => store, SESSION, PARAMS)).rejects.toThrow(
      "Transcription stopped.",
    );

    expect(store.handleBatchStopped).toHaveBeenCalledWith(SESSION);
    expect(store.handleBatchFailed).not.toHaveBeenCalled();
    expect(store.clearBatchSession).not.toHaveBeenCalled();
  });

  test.each(["timed_out", "direct_request_failed"] as const)(
    "reports recovery provider failure %s",
    async (code) => {
      const error =
        "Transcription timed out after 60 seconds without progress.";
      const events = captureEvents();
      startEmitting(
        events,
        [{ type: "failed", session_id: SESSION, code, error }],
        "after-resolve",
      );
      const store = makeStore();

      await expect(
        runBatchSession(() => store, SESSION, PARAMS, { recovery: true }),
      ).rejects.toBe(error);

      expect(store.handleBatchFailed).toHaveBeenCalledWith(
        SESSION,
        error,
        code === "timed_out" ? "timed_out" : "failed",
        code,
      );
      expect(store.handleBatchStopped).not.toHaveBeenCalled();
    },
  );
});

describe("batch recovery after reload", () => {
  const RECOVERY_RESPONSE = { metadata: {}, results: { channels: [] } };
  const nativeSession = (overrides: Record<string, unknown> = {}) => ({
    session_id: SESSION,
    file_path: "/tmp/session.wav",
    provider: "openai",
    model: null,
    started_at_ms: 0,
    ...overrides,
  });
  const recoveredStore = (
    overrides: Record<string, unknown> = {},
  ): ReturnType<typeof makeStore> => {
    const store = makeStore(overrides);
    store.handleBatchRecovered.mockImplementation((sessionId: string) => {
      store.batch[sessionId] = { percentage: 0, recovered: true };
    });
    return store;
  };
  const runQuietly = (store: ReturnType<typeof makeStore>) =>
    runBatchSession(() => store, SESSION, PARAMS, {
      notifyOnCompletion: false,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("adopts a Rust batch that is still running for the same file", async () => {
    const events = captureEvents();
    startTranscriptionMock.mockResolvedValue({
      status: "error",
      error: ALREADY_RUNNING,
    });
    listTranscriptionSessionsMock.mockImplementation(async () => {
      queueMicrotask(() =>
        events.emit({ ...completed("direct"), response: RECOVERY_RESPONSE }),
      );
      return {
        status: "ok",
        data: [nativeSession({ started_at_ms: Date.now() - 5_000 })],
      };
    });
    const store = makeStore();

    await runQuietly(store);

    expect(store.handleBatchResponse).toHaveBeenCalledOnce();
    expect(store.handleBatchFailed).not.toHaveBeenCalled();
  });

  test("replays a result Rust kept for a recovered batch without restarting it", async () => {
    listenMock.mockResolvedValue(vi.fn());
    listTranscriptionSessionsMock.mockResolvedValue({
      status: "ok",
      data: [nativeSession({ resume_context: null, completed: true })],
    });
    getCompletedTranscriptionMock.mockResolvedValue({
      status: "ok",
      data: { session_id: SESSION, response: RECOVERY_RESPONSE },
    });
    acknowledgeCompletedTranscriptionMock.mockResolvedValue({
      status: "ok",
      data: null,
    });
    const store = makeStore({
      batch: { [SESSION]: { percentage: 1, recovered: true } },
    });

    await runQuietly(store);

    expect(startTranscriptionMock).not.toHaveBeenCalled();
    expect(store.handleBatchResponse).toHaveBeenCalledWith(
      SESSION,
      RECOVERY_RESPONSE,
    );
    expect(acknowledgeCompletedTranscriptionMock).not.toHaveBeenCalled();
  });

  test("waits for a running recovered batch instead of restarting it", async () => {
    const events = captureEvents();
    listTranscriptionSessionsMock.mockImplementation(async () => {
      queueMicrotask(() =>
        events.emit({
          type: "completed",
          session_id: SESSION,
          response: RECOVERY_RESPONSE,
        }),
      );
      return {
        status: "ok",
        data: [nativeSession({ resume_context: null, completed: false })],
      };
    });
    const store = makeStore({
      batch: { [SESSION]: { percentage: 0.5, recovered: true } },
    });

    await runQuietly(store);

    expect(startTranscriptionMock).not.toHaveBeenCalled();
    expect(store.handleBatchResponse).toHaveBeenCalledWith(
      SESSION,
      RECOVERY_RESPONSE,
    );
  });

  test.each([
    { mismatch: "file", session: { file_path: "/tmp/other.wav" } },
    { mismatch: "provider", session: { model: "whisper-large-v3" } },
  ])(
    "does not adopt a running batch started with a different $mismatch",
    async ({ session }) => {
      listenMock.mockResolvedValue(vi.fn());
      startTranscriptionMock.mockResolvedValue({
        status: "error",
        error: ALREADY_RUNNING,
      });
      listTranscriptionSessionsMock.mockResolvedValue({
        status: "ok",
        data: [nativeSession(session)],
      });

      await expect(runQuietly(makeStore())).rejects.toBe(ALREADY_RUNNING);
    },
  );

  test("does not recover a batch that finished while sessions were listed", async () => {
    const events = captureEvents();
    listTranscriptionSessionsMock.mockImplementation(async () => {
      events.emit({ type: "stopped", session_id: "orphan" });
      return {
        status: "ok",
        data: [
          { session_id: "orphan", file_path: "/tmp/b.wav", started_at_ms: 0 },
        ],
      };
    });
    const store = makeStore();

    await recoverRunningBatchSessions(() => store);

    expect(store.handleBatchRecovered).not.toHaveBeenCalled();
    expect(events.unlisten).toHaveBeenCalledOnce();
  });

  test("still resumes a resumable batch that completed while sessions were listed", async () => {
    const events = captureEvents();
    const session = nativeSession({
      file_path: "/tmp/a.wav",
      model: "whisper",
      resume_context: '{"promotion":"whole_session"}',
      completed: false,
    });
    listTranscriptionSessionsMock.mockImplementation(async () => {
      events.emit({ type: "completed", session_id: SESSION });
      return { status: "ok", data: [session] };
    });
    const store = makeStore();
    const onResumable = vi.fn();

    await recoverRunningBatchSessions(() => store, onResumable);

    expect(store.handleBatchRecovered).toHaveBeenCalledWith(SESSION);
    expect(store.handleBatchCompleted).toHaveBeenCalledWith(SESSION);
    expect(onResumable).toHaveBeenCalledWith([session]);
  });

  test("marks running Rust batches as recovered and tracks their terminal state", async () => {
    const events = captureEvents();
    listTranscriptionSessionsMock.mockResolvedValue({
      status: "ok",
      data: [
        { session_id: "known", file_path: "/tmp/a.wav", started_at_ms: 0 },
        { session_id: "orphan", file_path: "/tmp/b.wav", started_at_ms: 0 },
      ],
    });
    const store = recoveredStore({ batch: { known: { percentage: 0.5 } } });

    await recoverRunningBatchSessions(() => store);

    expect(store.handleBatchRecovered).toHaveBeenCalledTimes(1);
    expect(store.handleBatchRecovered).toHaveBeenCalledWith("orphan");

    events.emit({
      type: "failed",
      session_id: "orphan",
      code: "timed_out",
      error: "timed out",
    });

    expect(store.handleBatchFailed).toHaveBeenCalledWith(
      "orphan",
      "timed out",
      "timed_out",
      "timed_out",
    );
    expect(events.unlisten).toHaveBeenCalledOnce();
  });

  test("keeps resumable batches recovered through completion", async () => {
    const events = captureEvents();
    const resumable = (session_id: string, file: string, done: boolean) => ({
      session_id,
      file_path: `/tmp/${file}.wav`,
      started_at_ms: 0,
      resume_context: '{"promotion":"whole_session"}',
      completed: done,
    });
    const running = resumable("running", "a", false);
    const done = resumable("done", "b", true);
    const unclaimed = {
      ...resumable("unclaimed", "c", true),
      resume_context: null,
    };
    listTranscriptionSessionsMock.mockResolvedValue({
      status: "ok",
      data: [done, running, unclaimed],
    });
    const store = recoveredStore();
    const onResumable = vi.fn();

    await recoverRunningBatchSessions(() => store, onResumable);

    expect(onResumable).toHaveBeenCalledWith([done, running]);
    expect(store.handleBatchRecovered).not.toHaveBeenCalledWith("unclaimed");
    expect(store.handleBatchCompleted).toHaveBeenCalledWith("done");

    events.emit({
      ...completed("direct"),
      session_id: "running",
      response: RECOVERY_RESPONSE,
    });

    expect(store.handleBatchCompleted).toHaveBeenCalledWith("running");
    expect(store.clearBatchSession).not.toHaveBeenCalled();
    expect(events.unlisten).toHaveBeenCalledOnce();
  });

  test("stops tracking once a recovered batch is adopted by a new run", async () => {
    const events = captureEvents();
    listTranscriptionSessionsMock.mockResolvedValue({
      status: "ok",
      data: [
        { session_id: "orphan", file_path: "/tmp/b.wav", started_at_ms: 0 },
      ],
    });
    const store = recoveredStore();

    await recoverRunningBatchSessions(() => store);
    store.batch.orphan = { percentage: 0 };
    events.emit({ type: "stopped", session_id: "orphan" });

    expect(store.handleBatchStopped).not.toHaveBeenCalled();
    expect(events.unlisten).toHaveBeenCalledOnce();
  });
});
