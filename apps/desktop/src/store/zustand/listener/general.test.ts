import { create as mutate } from "mutative";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { BatchWord, StreamWord } from "@syntheo/plugin-transcription";
import { toast } from "@syntheo/ui/components/ui/toast";

const {
  acknowledgeStoppedCaptureMock,
  dispatchEventMock,
  getIdentifierMock,
  getCaptureSnapshotMock,
  listenCaptureDataMock,
  listenCaptureLifecycleMock,
  listenCaptureStatusMock,
  listMicrophoneDevicesMock,
  listMicUsingApplicationsMock,
  runEventHooksMock,
  setRecordingIndicatorMock,
  startCaptureMock,
  stopCaptureMock,
  stopTranscriptionMock,
  vaultBaseMock,
} = vi.hoisted(() => ({
  acknowledgeStoppedCaptureMock: vi.fn(),
  dispatchEventMock: vi.fn(),
  getIdentifierMock: vi.fn(),
  getCaptureSnapshotMock: vi.fn(),
  listenCaptureDataMock: vi.fn(),
  listenCaptureLifecycleMock: vi.fn(),
  listenCaptureStatusMock: vi.fn(),
  listMicrophoneDevicesMock: vi.fn(),
  listMicUsingApplicationsMock: vi.fn(),
  runEventHooksMock: vi.fn(),
  setRecordingIndicatorMock: vi.fn(),
  startCaptureMock: vi.fn(),
  stopCaptureMock: vi.fn(),
  stopTranscriptionMock: vi.fn(),
  vaultBaseMock: vi.fn(),
}));

vi.mock("~/stt/speaker-context-capture", () => ({
  startSpeakerContextCapture: vi.fn(),
  observeSpeakerMicrophone: vi.fn(),
  stopSpeakerContextCapture: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: getIdentifierMock,
}));

vi.mock("@syntheo/plugin-detect", () => ({
  commands: {
    listMicUsingApplications: listMicUsingApplicationsMock,
  },
}));

vi.mock("@syntheo/plugin-hooks", () => ({
  commands: {
    runEventHooks: runEventHooksMock,
  },
}));

vi.mock("@syntheo/plugin-icon", () => ({
  commands: {
    setRecordingIndicator: setRecordingIndicatorMock,
  },
}));

vi.mock("@syntheo/plugin-local-api", () => ({
  commands: {
    dispatchEvent: dispatchEventMock,
  },
}));

vi.mock("@syntheo/plugin-settings", () => ({
  commands: {
    vaultBase: vaultBaseMock,
  },
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    acknowledgeStoppedCapture: acknowledgeStoppedCaptureMock,
    getCaptureSnapshot: getCaptureSnapshotMock,
    listMicrophoneDevices: listMicrophoneDevicesMock,
    setMicMuted: vi.fn(),
    startCapture: startCaptureMock,
    startTranscription: vi.fn(),
    stopCapture: stopCaptureMock,
    stopTranscription: stopTranscriptionMock,
    updateCaptureConfig: vi.fn(),
  },
  events: {
    captureDataEvent: {
      listen: listenCaptureDataMock,
    },
    captureLifecycleEvent: {
      listen: listenCaptureLifecycleMock,
    },
    captureStatusEvent: {
      listen: listenCaptureStatusMock,
    },
  },
}));

vi.mock("~/cloud-api/client", () => ({
  syncCloudApiSnapshotBestEffort: vi.fn(),
}));

import { createListenerStore } from ".";
import {
  getLiveCaptureUiMode,
  isLiveTranscriptInterrupted,
  markLiveActive,
  markLiveInactive,
  markLiveStartRequested,
  updateLiveProgress,
} from "./general-shared";
import { flushLiveTranscriptBatches } from "./live-transcript-batch";

import { enqueueSessionAudioOperation } from "~/session/audio-operations";

let store: ReturnType<typeof createListenerStore>;

type NativeEvent = { payload: Record<string, unknown> };
type NativeHandler = (event: NativeEvent) => void;

// Instantané natif renvoyé par `getCaptureSnapshot`.
const snapshot = (data: Record<string, unknown> = {}) => ({
  status: "ok",
  data: {
    activeSessionId: "session-a",
    finalizingSessionIds: [],
    liveTranscriptionActive: true,
    requestedLiveTranscription: true,
    state: "active",
    ...data,
  },
});
const INACTIVE_SNAPSHOT = snapshot({
  activeSessionId: null,
  liveTranscriptionActive: null,
  requestedLiveTranscription: null,
  state: "inactive",
});

const started = (
  sessionId = "session-a",
  liveTranscriptionActive = true,
  degraded: { type: "connection_timeout" } | null = null,
) => ({
  type: "started",
  session_id: sessionId,
  requested_live_transcription: true,
  live_transcription_active: liveTranscriptionActive,
  degraded,
});
const finalizing = (sessionId = "session-a") => ({
  type: "finalizing",
  session_id: sessionId,
});
const stopped = (
  sessionId = "session-a",
  stoppedAtMs = 1000,
  audioPath = "/tmp/session.wav",
) => ({
  type: "stopped",
  session_id: sessionId,
  stopped_at_ms: stoppedAtMs,
  audio_path: audioPath,
  requested_live_transcription: true,
  live_transcription_active: true,
  error: null,
});

const liveWord = (id: string, text = id, startMs = 0, endMs = 500) => ({
  id,
  text,
  start_ms: startMs,
  end_ms: endMs,
  channel: 0,
});
const wordsDelta = (
  sessionId: string,
  words: { new_words?: unknown[]; partials?: unknown[] },
) => ({
  session_id: sessionId,
  type: "transcript_delta",
  delta: { new_words: [], replaced_ids: [], partials: [], ...words },
});
const segment = (id: string, text: string, startMs = 0, endMs = 1000) => ({
  end_ms: endMs,
  id,
  key: { channel: "DirectMic" },
  start_ms: startMs,
  text,
  words: [],
});
const segmentDelta = (delta: {
  upserts?: unknown[];
  removed_ids?: string[];
}) => ({
  delta: { removed_ids: [], upserts: [], ...delta },
  session_id: "session-a",
  type: "transcript_segment_delta",
});
const snapshotSegment = (id: string, text: string) => ({
  id,
  key: { channel: "DirectMic", speaker_index: null, speaker_human_id: null },
  start_ms: 100,
  end_ms: 200,
  text,
  words: [],
});

// Remplace l'abonnement natif pour récupérer son gestionnaire.
const captureListener = (
  listenMock: ReturnType<typeof vi.fn>,
  { persistent = false } = {},
) => {
  let handler: NativeHandler | undefined;
  const implementation = (cb: NativeHandler) => {
    handler = cb;
    return Promise.resolve(() => {});
  };
  if (persistent) listenMock.mockImplementation(implementation);
  else listenMock.mockImplementationOnce(implementation);
  return {
    get attached() {
      return handler !== undefined;
    },
    emit: (...payloads: unknown[]) => {
      for (const payload of payloads) {
        handler?.({ payload: payload as Record<string, unknown> });
      }
    },
  };
};

const startParams = (sessionId = "session-a") => ({
  session_id: sessionId,
  languages: [],
  onboarding: false,
  model: "test-model",
  base_url: "http://localhost",
  api_key: "test-key",
  keywords: [],
});

const deferredStart = <T>() => {
  let resolve: ((value: T) => void) | undefined;
  startCaptureMock.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  return (value: T) => resolve?.(value);
};

const lastStatusHandler = (): NativeHandler | undefined =>
  listenCaptureStatusMock.mock.calls[
    listenCaptureStatusMock.mock.calls.length - 1
  ]?.[0];

const silenceConsoleError = () =>
  vi.spyOn(console, "error").mockImplementation(() => {});

const generation = (sessionId = "session-a") =>
  store.getState().live.captureGenerationBySession[sessionId];

const setLive = (sessionId: string, intervalId = setInterval(() => {}, 1000)) =>
  store.setState((state) =>
    mutate(state, (draft) => {
      markLiveActive(draft.live, sessionId, intervalId, true, true, null);
    }),
  );

// Réponse de lot reçue segment par segment.
const streamedSegment = ({
  transcript,
  words = [],
  start = 0,
  duration = 5,
  isFinal = false,
  channelIndex = 0,
}: {
  transcript: string;
  words?: StreamWord[];
  start?: number;
  duration?: number;
  isFinal?: boolean;
  channelIndex?: number;
}) => ({
  type: "segment" as const,
  percentage: 0.5,
  response: {
    type: "Results" as const,
    start,
    duration,
    is_final: isFinal,
    speech_final: isFinal,
    from_finalize: false,
    channel: {
      alternatives: [{ transcript, languages: [], words, confidence: 0.9 }],
    },
    metadata: {
      request_id: "test-request",
      model_info: { name: "test-model", version: "1.0", arch: "test-arch" },
      model_uuid: "test-uuid",
    },
    channel_index: [channelIndex],
  },
});
const streamedWord = (word: string, speaker: number | null) => ({
  word,
  punctuated_word: word,
  start: 0,
  end: 0.5,
  confidence: 0.9,
  speaker,
  language: null,
});

const batchWord = (
  word: string,
  start: number,
  channel: number,
  { end = start + 0.4, speaker = null as number | null } = {},
) => ({
  word,
  punctuated_word: word,
  start,
  end,
  confidence: 1,
  channel,
  speaker,
});
const batchChannel = (transcript: string, words: BatchWord[]) => ({
  alternatives: [{ transcript, confidence: 1, words }],
});

const timedWord = (
  text: string,
  startMs: number,
  endMs: number,
  source: string,
  channel = 0,
) => ({
  text: ` ${text}`,
  start_ms: startMs,
  end_ms: endMs,
  channel,
  metadata: { timing: { source } },
});

// Démarre une session de lot et renvoie la fonction de persistance espionnée.
const startBatchWithPersist = (sessionId: string) => {
  const persist = vi.fn();
  store.getState().handleBatchStarted(sessionId);
  store.getState().setBatchPersist(sessionId, persist);
  return persist;
};

describe("General Listener Slice", () => {
  beforeEach(() => {
    store = createListenerStore();
    vi.clearAllMocks();
    getIdentifierMock.mockResolvedValue("com.syntheo.stable");
    getCaptureSnapshotMock.mockResolvedValue(INACTIVE_SNAPSHOT);
    acknowledgeStoppedCaptureMock.mockResolvedValue({
      status: "ok",
      data: null,
    });
    listenCaptureDataMock.mockResolvedValue(() => {});
    listenCaptureLifecycleMock.mockResolvedValue(() => {});
    listenCaptureStatusMock.mockResolvedValue(() => {});
    listMicUsingApplicationsMock.mockResolvedValue({ status: "ok", data: [] });
    listMicrophoneDevicesMock.mockResolvedValue({
      status: "ok",
      data: ["Built-in Microphone"],
    });
    runEventHooksMock.mockResolvedValue({ status: "ok", data: null });
    setRecordingIndicatorMock.mockResolvedValue({ status: "ok", data: null });
    startCaptureMock.mockResolvedValue({ status: "ok", data: null });
    stopCaptureMock.mockResolvedValue({ status: "ok", data: null });
    stopTranscriptionMock.mockResolvedValue({ status: "ok", data: null });
    dispatchEventMock.mockResolvedValue({ status: "ok", data: 1 });
    vaultBaseMock.mockResolvedValue({ status: "ok", data: "/tmp/syntheo" });
  });

  test("keeps the next live transcript after the previous meeting finishes batch and summary work", async () => {
    const previousPersist = vi.fn();
    const nextPersist = vi.fn();
    const batchPersist = vi.fn();
    let finishSummary!: () => void;
    const summaryDone = new Promise<void>((resolve) => {
      finishSummary = resolve;
    });
    const onStopped = vi.fn(() => summaryDone);
    getCaptureSnapshotMock.mockResolvedValueOnce(
      snapshot({ activeSessionId: "previous" }),
    );
    await store.getState().attachLiveSession("previous", {
      handlePersist: previousPersist,
      onStopped,
    });
    const previousLifecycle = listenCaptureLifecycleMock.mock.calls[0][0];
    const previousData = listenCaptureDataMock.mock.calls[0][0];
    previousLifecycle({ payload: finalizing("previous") });
    getCaptureSnapshotMock.mockResolvedValueOnce(
      snapshot({ activeSessionId: "next", finalizingSessionIds: ["previous"] }),
    );
    await store
      .getState()
      .attachLiveSession("next", { handlePersist: nextPersist });
    const nextData = listenCaptureDataMock.mock.calls[1][0];
    const deliver = (handler: typeof nextData, sessionId: string, id: string) =>
      handler({
        payload: wordsDelta(sessionId, { new_words: [liveWord(id)] }),
      });
    try {
      deliver(nextData, "next", "before");
      deliver(previousData, "previous", "previous-final");
      previousLifecycle({
        payload: stopped("previous", 1000, "/tmp/previous.wav"),
      });
      expect(onStopped).toHaveBeenCalledOnce();
      expect(store.getState().live.postStopProcessingBySession.previous).toBe(
        true,
      );
      expect(store.getState().liveCaptionText).toBe("before");
      store.getState().handleBatchStarted("previous");
      store.getState().setBatchPersist("previous", batchPersist);
      expect(
        store.getState().handleBatchResponse("previous", {
          metadata: null,
          results: {
            channels: [
              batchChannel("previous batch", [
                {
                  word: "previous batch",
                  start: 0,
                  end: 1,
                  confidence: 1,
                  speaker: null,
                  punctuated_word: null,
                },
              ]),
            ],
          },
        }),
      ).toBe(true);
      store.getState().clearBatchPersist("previous");
      deliver(nextData, "next", "during");
      finishSummary();
      await vi.waitFor(() =>
        expect(
          store.getState().live.postStopProcessingBySession.previous,
        ).toBeUndefined(),
      );
      deliver(nextData, "next", "after");
      expect(store.getState().live.sessionId).toBe("next");
      expect(store.getState().live.status).toBe("active");
      expect(store.getState().live.liveTranscriptionActive).toBe(true);
      expect(store.getState().handlePersistBySession.next).toBe(nextPersist);
      expect(nextPersist).toHaveBeenCalledTimes(3);
      expect(previousPersist).toHaveBeenCalledOnce();
      expect(batchPersist).toHaveBeenCalledOnce();
      // L'aperçu est regroupé par fenêtre de 100 ms (issue 444).
      flushLiveTranscriptBatches();
      expect(store.getState().liveCaptionText).toBe("beforeduringafter");
      expect(stopCaptureMock).not.toHaveBeenCalled();
    } finally {
      finishSummary();
      clearInterval(store.getState().live.intervalId);
    }
  });

  test("initializes with correct default values", () => {
    const state = store.getState();
    expect(state.live).toMatchObject({
      status: "inactive",
      loading: false,
      amplitude: { mic: 0, speaker: 0 },
      seconds: 0,
      needsBatchRepair: false,
    });
    expect(state.live.eventUnlistenersBySession).toEqual({});
    expect(state.live.postStopProcessingBySession).toEqual({});
    expect(state.live.intervalId).toBeUndefined();
    expect(state.batch).toEqual({});
  });

  describe("Session Mode Helpers", () => {
    test("getSessionMode defaults to inactive, then reports running_batch", () => {
      const { handleBatchResponseStreamed, getSessionMode } = store.getState();
      expect(getSessionMode("session-456")).toBe("inactive");

      handleBatchResponseStreamed("session-456", {
        type: "progress",
        percentage: 0.5,
        partial_text: "test",
      });
      expect(getSessionMode("session-456")).toBe("running_batch");
    });

    test("getSessionMode returns finalizing for non-active finalizing sessions", () => {
      store.setState((state) =>
        mutate(state, (draft) => {
          draft.live.finalizingBySession["session-a"] = {
            startedAtMs: 123,
            seconds: 0,
            needsBatchRepair: false,
          };
        }),
      );

      expect(store.getState().getSessionMode("session-a")).toBe("finalizing");
    });

    test.each([
      { requested: false, expected: "record_only" },
      { requested: true, expected: "fallback_record_only" },
    ])(
      "getLiveCaptureUiMode returns $expected without live transcription (requested: $requested)",
      ({ requested, expected }) => {
        expect(
          getLiveCaptureUiMode({
            requestedLiveTranscription: requested,
            liveTranscriptionActive: false,
          }),
        ).toBe(expected);
      },
    );

    test("markLiveActive preserves startup progress errors", () => {
      const intervalId = setInterval(() => {}, 1000);

      store.setState((state) =>
        mutate(state, (draft) => {
          updateLiveProgress(draft.live, {
            type: "connection_error",
            session_id: "session-1",
            error: "socket closed",
          });
          markLiveActive(
            draft.live,
            "session-1",
            intervalId,
            true,
            false,
            null,
          );
        }),
      );

      clearInterval(intervalId);

      expect(store.getState().live.status).toBe("active");
      expect(store.getState().live.lastError).toBe("socket closed");
      expect(store.getState().live.lastErrorSessionId).toBe("session-1");
    });

    test("connected clears a connection error but keeps an audio error", () => {
      const connected = {
        type: "connected" as const,
        session_id: "session-1",
        adapter: "deepgram",
        gap_replayed: false,
      };
      store.setState((state) =>
        mutate(state, (draft) => {
          updateLiveProgress(draft.live, {
            type: "connection_error",
            session_id: "session-1",
            error: "socket closed",
          });
          updateLiveProgress(draft.live, connected);
        }),
      );
      expect(store.getState().live.lastError).toBeNull();
      expect(store.getState().live.lastErrorSessionId).toBeNull();

      store.setState((state) =>
        mutate(state, (draft) => {
          updateLiveProgress(draft.live, {
            type: "audio_error",
            session_id: "session-1",
            error: "microphone unavailable",
            device: null,
            is_fatal: false,
          });
          updateLiveProgress(draft.live, connected);
        }),
      );
      expect(store.getState().live.lastError).toBe("microphone unavailable");
      expect(store.getState().live.lastErrorIsAudioRelated).toBe(true);
    });

    test("markLiveActive preserves the need for batch repair after recovery", () => {
      const intervalId = setInterval(() => {}, 1000);

      store.setState((state) =>
        mutate(state, (draft) => {
          markLiveActive(draft.live, "session-1", intervalId, true, false, {
            type: "connection_timeout",
          });
          markLiveActive(draft.live, "session-1", intervalId, true, true, null);
        }),
      );

      clearInterval(intervalId);
      expect(store.getState().live.needsBatchRepair).toBe(true);
    });

    test.each([
      {
        stop: "a terminal stop error",
        stopError: "capture restart limit exceeded",
        expected: {
          lastError: "microphone unavailable",
          lastErrorSessionId: "session-a",
          lastErrorIsAudioRelated: true,
        },
      },
      {
        stop: "a normal stop",
        stopError: null,
        expected: {
          lastError: null,
          lastErrorSessionId: null,
          lastErrorIsAudioRelated: false,
        },
      },
    ])(
      "scopes same-session audio recovery after $stop",
      ({ stopError, expected }) => {
        store.setState((state) =>
          mutate(state, (draft) => {
            markLiveStartRequested(draft.live, "session-a");
            updateLiveProgress(draft.live, {
              type: "audio_error",
              session_id: "session-a",
              error: "microphone unavailable",
              device: null,
              is_fatal: true,
            });
            markLiveInactive(draft.live, "session-a", stopError);
          }),
        );

        expect(store.getState().live).toMatchObject(expected);
      },
    );

    test("canStartLiveSession allows new sessions while another session is finalizing", () => {
      store.setState((state) =>
        mutate(state, (draft) => {
          draft.live.status = "finalizing";
          draft.live.loading = true;
          draft.live.sessionId = "session-a";
          draft.live.finalizingBySession["session-a"] = {
            startedAtMs: 123,
            seconds: 0,
            needsBatchRepair: false,
          };
        }),
      );

      expect(store.getState().canStartLiveSession("session-b")).toBe(true);
      expect(store.getState().canStartLiveSession("session-a")).toBe(false);
    });

    test("canStartLiveSession blocks new sessions while another session is active", () => {
      store.setState((state) =>
        mutate(state, (draft) => {
          draft.live.status = "active";
          draft.live.sessionId = "session-a";
        }),
      );

      expect(store.getState().canStartLiveSession("session-b")).toBe(false);
    });
  });

  describe("Batch State", () => {
    test("handleBatchResponseStreamed tracks progress per session", () => {
      const sessionId = "session-progress";
      const { handleBatchResponseStreamed, clearBatchSession } =
        store.getState();

      handleBatchResponseStreamed(
        sessionId,
        streamedSegment({
          transcript: "test",
          words: [streamedWord("test", null)],
        }),
      );
      expect(store.getState().batch[sessionId]).toEqual({
        percentage: 0.5,
        isComplete: false,
        phase: "transcribing",
        terminalReason: undefined,
        error: undefined,
        errorCode: undefined,
      });
      expect(
        store.getState().batchPreview[sessionId]?.wordsByChannel[0],
      ).toEqual([timedWord("test", 0, 500, "provider_word")]);

      clearBatchSession(sessionId);
      expect(store.getState().batch[sessionId]).toBeUndefined();
      expect(store.getState().batchPreview[sessionId]).toBeUndefined();
    });

    test("handleBatchResponseStreamed persists streamed transcript snapshots", () => {
      const sessionId = "session-streamed-persist";
      const persist = vi.fn();
      store.getState().setBatchPersist(sessionId, persist);

      store.getState().handleBatchResponseStreamed(
        sessionId,
        streamedSegment({
          transcript: "hello",
          words: [streamedWord("hello", 1)],
        }),
      );

      expect(persist).toHaveBeenCalledWith(
        [timedWord("hello", 0, 500, "provider_word")],
        [
          {
            wordIndex: 0,
            data: { type: "provider_speaker_index", speaker_index: 1 },
          },
        ],
        { mode: "replace" },
      );
    });

    test("handleBatchResponseStreamed persists transcript-only segment responses", () => {
      const sessionId = "session-transcript-only-stream";
      const persist = vi.fn();
      store.getState().setBatchPersist(sessionId, persist);

      store.getState().handleBatchResponseStreamed(
        sessionId,
        streamedSegment({
          transcript: "hello world",
          start: 4,
          duration: 2,
          isFinal: true,
          channelIndex: 1,
        }),
      );

      const source = "provider_segment_interpolated";
      expect(persist).toHaveBeenCalledWith(
        [
          timedWord("hello", 4000, 5000, source, 1),
          timedWord("world", 5000, 6000, source, 1),
        ],
        [],
        { mode: "replace" },
      );
    });

    test("handleBatchResponseStreamed replaces preview with transcript-only result", () => {
      const sessionId = "session-transcript-only-result";
      const persist = vi.fn();
      const { handleBatchResponseStreamed, setBatchPersist } = store.getState();
      setBatchPersist(sessionId, persist);

      handleBatchResponseStreamed(
        sessionId,
        streamedSegment({
          transcript: "partial",
          duration: 120,
          isFinal: true,
        }),
      );
      handleBatchResponseStreamed(sessionId, {
        type: "result",
        response: {
          metadata: { duration: 120, timing_source: "synthetic_text" },
          results: {
            channels: [
              {
                alternatives: [
                  {
                    transcript: "final transcript survived",
                    confidence: 0.9,
                    words: [],
                  },
                ],
              },
            ],
          },
        },
      });

      const finalWords = [
        timedWord("final", 0, 400, "synthetic_text"),
        timedWord("transcript", 400, 800, "synthetic_text"),
        timedWord("survived", 800, 1200, "synthetic_text"),
      ];
      expect(persist).toHaveBeenLastCalledWith(finalWords, [], {
        mode: "replace",
      });
      expect(
        store.getState().batchPreview[sessionId]?.wordsByChannel[0],
      ).toEqual(finalWords);
      expect(store.getState().batch[sessionId]?.isComplete).toBe(true);
    });

    test("handleBatchResponse persists transcript-only batch responses", () => {
      const sessionId = "session-transcript-only-batch";
      const persist = startBatchWithPersist(sessionId);

      expect(
        store.getState().handleBatchResponse(sessionId, {
          metadata: { duration: 120, timing_source: "provider_word" },
          results: {
            channels: [
              {
                alternatives: [
                  { transcript: "hello world", confidence: 0.9, words: [] },
                ],
              },
            ],
          },
        }),
      ).toBe(true);

      expect(persist).toHaveBeenCalledWith(
        [
          timedWord("hello", 0, 400, "synthetic_text"),
          timedWord("world", 400, 800, "synthetic_text"),
        ],
        [],
        { mode: "replace" },
      );
      expect(store.getState().batch[sessionId]).toBeUndefined();
    });

    test("handleBatchResponse keeps synthetic chunk provenance on individual words", () => {
      const sessionId = "session-synthetic-channel-chunks";
      const persist = startBatchWithPersist(sessionId);
      const channel = (transcript: string, channelIndex: number) =>
        batchChannel(
          transcript,
          transcript.split(" ").map((word, index) =>
            batchWord(word, index * 0.4, channelIndex, {
              end: (index + 1) * 0.4,
            }),
          ),
        );

      store.getState().handleBatchResponse(sessionId, {
        metadata: {
          duration: 29.5,
          timing_source: "synthetic_text",
          timing_sources_by_channel: ["synthetic_text", "synthetic_text"],
          synthetic_chunks: [
            { channel: 0, start_seconds: 0, end_seconds: 29.5 },
            { channel: 1, start_seconds: 0, end_seconds: 29.5 },
          ],
        },
        results: {
          channels: [channel("mic words", 0), channel("remote words", 1)],
        },
      });

      const words = persist.mock.calls[0]?.[0];
      expect(words.map((word: { text: string }) => word.text.trim())).toEqual([
        "mic",
        "words",
        "remote",
        "words",
      ]);
      expect(
        words.map(
          (word: { metadata: { timing: unknown } }) => word.metadata.timing,
        ),
      ).toEqual(Array(4).fill({ source: "synthetic_text", chunk_start_ms: 0 }));
    });

    test("handleBatchResponse finds chunk boundaries with unordered chunks and words", () => {
      const sessionId = "session-unordered-synthetic-chunks";
      const persist = startBatchWithPersist(sessionId);
      store.getState().handleBatchResponse(sessionId, {
        metadata: {
          timing_source: "synthetic_text",
          synthetic_chunks: [
            { channel: 0, start_seconds: 10, end_seconds: 20 },
            { channel: 0, start_seconds: 0, end_seconds: 10 },
            { channel: 0, start_seconds: 30, end_seconds: 40 },
          ],
        },
        results: {
          channels: [
            batchChannel(
              "later first boundary gap end",
              [15, 0, 10, 25, 40].map((start, index) =>
                batchWord(String(index), start, 0),
              ),
            ),
          ],
        },
      });
      const words = persist.mock.calls[0]?.[0] as Array<{
        start_ms: number;
        metadata: { timing: { chunk_start_ms?: number } };
      }>;
      expect(
        words.map((word) => [
          word.start_ms,
          word.metadata.timing.chunk_start_ms,
        ]),
      ).toEqual([
        [15_000, 10_000],
        [0, 0],
        [10_000, 10_000],
        [25_000, undefined],
        [40_000, undefined],
      ]);
    });

    test("handleBatchResponse retains real segment timing without speaker labels", () => {
      const sessionId = "session-provider-segments-no-speakers";
      const persist = startBatchWithPersist(sessionId);
      store.getState().handleBatchResponse(sessionId, {
        metadata: { timing_source: "provider_segment_interpolated" },
        results: {
          channels: [
            batchChannel("timed words", [
              batchWord("timed", 1, 0),
              batchWord("words", 2, 0),
            ]),
          ],
        },
      });
      const words = persist.mock.calls[0]?.[0] as Array<{
        start_ms: number;
        metadata: { timing: { source: string } };
      }>;
      expect(words.map((word) => word.start_ms)).toEqual([1_000, 2_000]);
      expect(words.map((word) => word.metadata.timing.source)).toEqual([
        "provider_segment_interpolated",
        "provider_segment_interpolated",
      ]);
    });

    test("handleBatchResponse keeps mixed channel timing sources separate", () => {
      const sessionId = "session-mixed-channel-timing";
      const persist = startBatchWithPersist(sessionId);
      store.getState().handleBatchResponse(sessionId, {
        metadata: {
          timing_source: "diarized_speech",
          timing_sources_by_channel: [
            "synthetic_text",
            "provider_segment_interpolated",
          ],
          synthetic_chunks: [
            { channel: 0, start_seconds: 0, end_seconds: 29.5 },
            { channel: 1, start_seconds: 0, end_seconds: 29.5 },
          ],
        },
        results: {
          channels: [
            batchChannel("mic", [batchWord("mic", 0, 0)]),
            batchChannel("remote fallback", [
              batchWord("remote", 1, 1, { end: 2, speaker: 0 }),
              batchWord("fallback", 2, 1),
            ]),
          ],
        },
      });

      const [words, hints] = persist.mock.calls[0] ?? [];
      expect(
        words?.map(
          (word: { metadata: { timing: unknown } }) => word.metadata.timing,
        ),
      ).toEqual([
        { source: "synthetic_text", chunk_start_ms: 0 },
        { source: "provider_segment_interpolated" },
        { source: "synthetic_text", chunk_start_ms: 0 },
      ]);
      expect(hints).toEqual([
        {
          wordIndex: 1,
          data: { type: "provider_speaker_index", speaker_index: 0 },
        },
      ]);
    });

    test("handleBatchFailed preserves batch error for UI surfaces", () => {
      const sessionId = "session-batch-error";
      store
        .getState()
        .handleBatchFailed(
          sessionId,
          "batch start failed: connection refused",
          "failed",
        );

      expect(store.getState().batch[sessionId]).toEqual({
        percentage: 0,
        error: "batch start failed: connection refused",
        isComplete: false,
        terminalReason: "failed",
        errorCode: undefined,
      });
      expect(store.getState().getSessionMode(sessionId)).toBe("inactive");
    });

    test("handleBatchStopped preserves stopped reason, even after late progress", () => {
      const sessionId = "session-batch-stopped";
      const stoppedBatch = {
        percentage: 0,
        error: "Transcription stopped.",
        isComplete: false,
        terminalReason: "stopped",
        errorCode: undefined,
      };

      store.getState().handleBatchStopped(sessionId);
      expect(store.getState().batch[sessionId]).toEqual(stoppedBatch);
      expect(store.getState().getSessionMode(sessionId)).toBe("inactive");

      store.getState().handleBatchResponseStreamed(sessionId, {
        type: "progress",
        percentage: 0.5,
        partial_text: "late progress",
      });
      expect(store.getState().batch[sessionId]).toEqual(stoppedBatch);
      expect(store.getState().getSessionMode(sessionId)).toBe("inactive");
    });
  });

  describe("Stop Action", () => {
    test("marks batch transcription stopped as soon as native cancellation succeeds", async () => {
      store.getState().handleBatchStarted("session-1");

      await store.getState().stopTranscription("session-1");

      expect(stopTranscriptionMock).toHaveBeenCalledWith("session-1");
      expect(store.getState().getSessionMode("session-1")).toBe("inactive");
      expect(store.getState().batch["session-1"]?.terminalReason).toBe(
        "stopped",
      );
    });

    test("marks the live session finalizing immediately when stop is requested", () => {
      const intervalId = setInterval(() => {}, 1000);
      setLive("session-1", intervalId);
      store.setState((state) =>
        mutate(state, (draft) => {
          draft.live.seconds = 42;
        }),
      );

      store.getState().stop();

      expect(store.getState().live.status).toBe("finalizing");
      expect(store.getState().live.loading).toBe(true);
      expect(store.getState().live.intervalId).toBeUndefined();
      expect(store.getState().live.finalizingBySession["session-1"]).toEqual({
        startedAtMs: expect.any(Number),
        seconds: 42,
        needsBatchRepair: false,
      });
    });

    test("dispatches completion after post-stop processing settles", async () => {
      let finishPostStopProcessing: (() => void) | undefined;
      const lifecycle = captureListener(listenCaptureLifecycleMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(snapshot());
      setLive("session-a");
      store.getState().setOnStopped(
        "session-a",
        () =>
          new Promise<void>((resolve) => {
            finishPostStopProcessing = resolve;
          }),
      );

      await store.getState().attachLiveSession("session-a");
      store.getState().stop();
      await vi.waitFor(() => expect(stopCaptureMock).toHaveBeenCalledOnce());
      expect(dispatchEventMock).not.toHaveBeenCalled();

      lifecycle.emit(stopped("session-a", 1234));
      expect(dispatchEventMock).not.toHaveBeenCalled();
      expect(acknowledgeStoppedCaptureMock).not.toHaveBeenCalled();

      finishPostStopProcessing?.();
      await vi.waitFor(() =>
        expect(acknowledgeStoppedCaptureMock).toHaveBeenCalledWith(
          "session-a",
          1234,
        ),
      );
      await vi.waitFor(() =>
        expect(dispatchEventMock).toHaveBeenCalledWith(
          "meeting.completed",
          "session-a",
        ),
      );
    });

    test("keeps the capture generation when stop command delivery fails", async () => {
      const consoleError = silenceConsoleError();
      setLive("session-a");
      stopCaptureMock.mockResolvedValueOnce({
        status: "error",
        error: "stop unavailable",
      });

      store.getState().stop();

      await vi.waitFor(() =>
        expect(store.getState().live.status).toBe("active"),
      );
      expect(generation()).toBe(1);
      clearInterval(store.getState().live.intervalId);
      consoleError.mockRestore();
    });
  });

  describe("Attach Action", () => {
    test("restores timer, mute and degraded state from the native snapshot", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:20:00Z"));
      getCaptureSnapshotMock.mockResolvedValueOnce(
        snapshot({
          startedAtMs: new Date("2026-01-01T00:00:00Z").getTime(),
          micMuted: true,
          degraded: { type: "connection_timeout" },
        }),
      );

      try {
        await store.getState().attachLiveSession("session-a");

        expect(store.getState().live).toMatchObject({
          status: "active",
          seconds: 20 * 60,
          muted: true,
          degraded: { type: "connection_timeout" },
        });
      } finally {
        clearInterval(store.getState().live.intervalId);
        vi.useRealTimers();
      }
    });

    test("hydrates the active native capture for the same session", async () => {
      getCaptureSnapshotMock.mockResolvedValueOnce(
        snapshot({
          liveSegmentsSessionId: "session-a",
          liveSegments: [snapshotSegment("snapshot-segment", "restored")],
        }),
      );

      await store.getState().attachLiveSession("session-a");

      expect(store.getState().getSessionMode("session-a")).toBe("active");
      expect(store.getState().live.sessionId).toBe("session-a");
      expect(store.getState().live.liveTranscriptionActive).toBe(true);
      expect(generation()).toBe(1);
      expect(store.getState().liveSegments).toEqual([
        expect.objectContaining({ id: "snapshot-segment", text: "restored" }),
      ]);
      expect(listenCaptureLifecycleMock).toHaveBeenCalledTimes(1);
      expect(listenCaptureStatusMock).toHaveBeenCalledTimes(1);
      expect(listenCaptureDataMock).toHaveBeenCalledTimes(1);
    });

    test("attached windows advance once for each observed native capture", async () => {
      const lifecycle = captureListener(listenCaptureLifecycleMock, {
        persistent: true,
      });

      await store.getState().attachLiveSession("session-a");
      expect(generation()).toBeUndefined();

      lifecycle.emit(started());
      expect(generation()).toBe(1);
      lifecycle.emit(started());
      expect(generation()).toBe(1);
      lifecycle.emit(finalizing());
      expect(generation()).toBe(1);
      lifecycle.emit(stopped());
      expect(generation()).toBeUndefined();

      await store.getState().attachLiveSession("session-a");
      lifecycle.emit(started());
      expect(generation()).toBe(2);
      lifecycle.emit(stopped());
    });

    test("restores transcript and stop callbacks for an active native capture", async () => {
      const handlePersist = vi.fn();
      const onStopped = vi.fn();
      const data = captureListener(listenCaptureDataMock);
      const lifecycle = captureListener(listenCaptureLifecycleMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(snapshot());

      await store.getState().attachLiveSession("session-a", {
        handlePersist,
        onStopped,
      });
      data.emit(
        wordsDelta("session-a", {
          new_words: [
            liveWord("word-after-reload", " preserved", 1_000, 1_500),
          ],
        }),
      );
      lifecycle.emit(stopped());

      expect(handlePersist).toHaveBeenCalledWith(
        expect.objectContaining({
          new_words: [expect.objectContaining({ id: "word-after-reload" })],
        }),
      );
      expect(onStopped).toHaveBeenCalledWith(
        "session-a",
        expect.objectContaining({
          audioPath: "/tmp/session.wav",
          liveTranscriptionActive: true,
        }),
      );
    });

    test("clears the stall warning only after finalized transcript words resume", async () => {
      const dismiss = vi.spyOn(toast, "dismiss");
      getCaptureSnapshotMock.mockResolvedValueOnce(snapshot());
      await store.getState().attachLiveSession("session-a");
      store.setState((state) => ({
        live: {
          ...state.live,
          transcriptionStalled: true,
          needsBatchRepair: true,
        },
      }));
      const dataHandler = listenCaptureDataMock.mock.calls[0][0];
      const word = liveWord("recovered", "hello");

      try {
        dataHandler({ payload: wordsDelta("session-a", { partials: [word] }) });
        expect(dismiss).not.toHaveBeenCalledWith("live-transcription-stalled");
        expect(store.getState().live.transcriptionStalled).toBe(true);

        dataHandler({
          payload: wordsDelta("session-a", { new_words: [word] }),
        });
        expect(dismiss).toHaveBeenCalledWith("live-transcription-stalled");
        expect(store.getState().live).toMatchObject({
          transcriptionStalled: false,
          needsBatchRepair: true,
          status: "active",
        });
      } finally {
        clearInterval(store.getState().live.intervalId);
        dismiss.mockRestore();
      }
    });

    test("reprend la transcription en direct sans action quand le listener se reconnecte", async () => {
      // Le supervisor Rust reconnecte seul le flux STT après une coupure : la
      // marge doit alors quitter l'état « en pause » et le chien de garde
      // repartir de zéro pour le nouveau flux.
      const dismiss = vi.spyOn(toast, "dismiss");
      const lifecycle = captureListener(listenCaptureLifecycleMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(snapshot());

      try {
        await store.getState().attachLiveSession("session-a");
        lifecycle.emit(
          started("session-a", false, { type: "connection_timeout" }),
        );
        store.setState((state) => ({
          live: {
            ...state.live,
            transcriptionStalled: true,
            stallAudibleSeconds: 44,
            finalStallAudibleSeconds: 89,
          },
        }));
        expect(isLiveTranscriptInterrupted(store.getState().live)).toBe(true);

        lifecycle.emit(started());

        const live = store.getState().live;
        expect(live).toMatchObject({
          degraded: null,
          transcriptionStalled: false,
          stallAudibleSeconds: 0,
          finalStallAudibleSeconds: 0,
        });
        expect(isLiveTranscriptInterrupted(live)).toBe(false);
        expect(dismiss).toHaveBeenCalledWith("live-transcription-stalled");
      } finally {
        clearInterval(store.getState().live.intervalId);
        dismiss.mockRestore();
      }
    });

    test("keeps recovery callbacks installed when the native snapshot is unavailable", async () => {
      const handlePersist = vi.fn();
      const onStopped = vi.fn();
      getCaptureSnapshotMock.mockResolvedValueOnce({
        status: "error",
        error: "capture snapshot unavailable",
      });

      await expect(
        store.getState().attachLiveSession("session-a", {
          handlePersist,
          onStopped,
        }),
      ).resolves.toBe("error");

      expect(store.getState().handlePersistBySession["session-a"]).toBe(
        handlePersist,
      );
      expect(store.getState().onStoppedBySession["session-a"]).toBe(onStopped);
      // Trois événements natifs et le vidage du lot de transcription en direct.
      expect(
        store.getState().live.eventUnlistenersBySession["session-a"],
      ).toHaveLength(4);
      expect(store.getState().canStartLiveSession("session-a")).toBe(false);
      expect(store.getState().canStartLiveSession("session-b")).toBe(false);
      await expect(
        store.getState().start(startParams("session-b")),
      ).resolves.toBe(false);
      expect(startCaptureMock).not.toHaveBeenCalled();

      getCaptureSnapshotMock.mockResolvedValueOnce(INACTIVE_SNAPSHOT);

      await expect(
        store.getState().attachLiveSession("session-a", {
          handlePersist: vi.fn(),
          onStopped: vi.fn(),
        }),
      ).resolves.toBe("inactive");
      expect(
        store.getState().handlePersistBySession["session-a"],
      ).toBeUndefined();
      expect(store.getState().onStoppedBySession["session-a"]).toBeUndefined();
      expect(
        store.getState().beginCaptureRecoveryFinalization("session-a"),
      ).toBe(true);
      expect(store.getState().canStartLiveSession("session-a")).toBe(false);
      expect(store.getState().canStartLiveSession("session-b")).toBe(true);
      store.getState().finishCaptureRecoveryFinalization("session-a");
      expect(store.getState().canStartLiveSession("session-a")).toBe(true);
    });

    test("finalizing sessions keep the batch repair flag when another session starts", async () => {
      const onStopped = vi.fn();
      const lifecycle = captureListener(listenCaptureLifecycleMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(snapshot());
      store.getState().setOnStopped("session-a", onStopped);

      await store.getState().attachLiveSession("session-a");
      lifecycle.emit(
        started("session-a", false, { type: "connection_timeout" }),
        started(),
        finalizing(),
      );
      store.setState((state) =>
        mutate(state, (draft) => {
          markLiveStartRequested(draft.live, "session-b");
        }),
      );
      lifecycle.emit(finalizing(), stopped());

      expect(onStopped).toHaveBeenCalledWith(
        "session-a",
        expect.objectContaining({ needsBatchRepair: true }),
      );
    });

    test("repairs a live transcript when stop leaves unfinalized words", async () => {
      const onStopped = vi.fn();
      const lifecycle = captureListener(listenCaptureLifecycleMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(snapshot());
      store.getState().setOnStopped("session-a", onStopped);

      await store.getState().attachLiveSession("session-a");
      store.setState((state) =>
        mutate(state, (draft) => {
          draft.partialWordsByChannel[0] = [
            {
              text: " trailing words",
              start_ms: 1_000,
              end_ms: 2_000,
              channel: 0,
            },
          ];
        }),
      );
      lifecycle.emit(finalizing(), stopped());

      expect(onStopped).toHaveBeenCalledWith(
        "session-a",
        expect.objectContaining({ needsBatchRepair: true }),
      );
    });

    test("observes asynchronous post-stop failures", async () => {
      const error = new Error("summary scheduling failed");
      const consoleError = silenceConsoleError();
      const lifecycle = captureListener(listenCaptureLifecycleMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(snapshot());
      store
        .getState()
        .setOnStopped("session-a", vi.fn().mockRejectedValue(error));

      await store.getState().attachLiveSession("session-a");
      lifecycle.emit(stopped());
      await Promise.resolve();

      expect(consoleError).toHaveBeenCalledWith(
        "[listener] post-stop processing failed",
        error,
      );
      expect(acknowledgeStoppedCaptureMock).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(dispatchEventMock).toHaveBeenCalledWith(
          "meeting.completed",
          "session-a",
        ),
      );
      await vi.waitFor(() =>
        expect(store.getState().canStartLiveSession("session-a")).toBe(true),
      );
      consoleError.mockRestore();
    });

    test("blocks an immediate same-session restart until post-stop repair settles", async () => {
      let finishRepair: (() => void) | undefined;
      const repairCompleted = vi.fn();
      const onStopped = vi.fn(
        (
          _sessionId: string,
          details: { needsBatchRepair: boolean },
        ): Promise<void> => {
          expect(details.needsBatchRepair).toBe(true);
          return new Promise<void>((resolve) => {
            finishRepair = () => {
              repairCompleted();
              resolve();
            };
          });
        },
      );
      const lifecycle = captureListener(listenCaptureLifecycleMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(snapshot());
      store.getState().setOnStopped("session-a", onStopped);

      await store.getState().attachLiveSession("session-a");
      store.setState((state) =>
        mutate(state, (draft) => {
          draft.live.needsBatchRepair = true;
        }),
      );
      lifecycle.emit(stopped());

      expect(onStopped).toHaveBeenCalledOnce();
      expect(store.getState().canStartLiveSession("session-a")).toBe(false);
      expect(store.getState().canStartLiveSession("session-b")).toBe(true);
      await expect(store.getState().start(startParams())).resolves.toBe(false);
      expect(startCaptureMock).not.toHaveBeenCalled();
      expect(repairCompleted).not.toHaveBeenCalled();

      finishRepair?.();
      await vi.waitFor(() =>
        expect(store.getState().canStartLiveSession("session-a")).toBe(true),
      );
      expect(repairCompleted).toHaveBeenCalledOnce();
      await expect(store.getState().start(startParams())).resolves.toBe(true);
      expect(startCaptureMock).toHaveBeenCalledOnce();
    });

    test("ignores overlapping attaches for the same session", async () => {
      await Promise.all([
        store.getState().attachLiveSession("session-a"),
        store.getState().attachLiveSession("session-a"),
      ]);

      expect(listenCaptureLifecycleMock).toHaveBeenCalledTimes(1);
      expect(listenCaptureStatusMock).toHaveBeenCalledTimes(1);
      expect(listenCaptureDataMock).toHaveBeenCalledTimes(1);
      expect(getCaptureSnapshotMock).toHaveBeenCalledTimes(1);
    });

    test("clears the previous session interval before applying an active snapshot", async () => {
      const intervalId = setInterval(() => {}, 1000);
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      getCaptureSnapshotMock.mockResolvedValueOnce(
        snapshot({ activeSessionId: "session-b" }),
      );
      setLive("session-a", intervalId);

      await store.getState().attachLiveSession("session-b");

      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
      expect(store.getState().live.sessionId).toBe("session-b");

      clearInterval(store.getState().live.intervalId);
      clearIntervalSpy.mockRestore();
    });

    test("does not mark a different active native capture as current", async () => {
      getCaptureSnapshotMock.mockResolvedValueOnce(
        snapshot({ activeSessionId: "session-b" }),
      );

      await store.getState().attachLiveSession("session-a");

      expect(store.getState().getSessionMode("session-a")).toBe("inactive");
      expect(store.getState().live.sessionId).toBeNull();
    });

    test("keeps a finalizing target attached while another capture is active, without its segments", async () => {
      const handlePersist = vi.fn();
      const onStopped = vi.fn();
      getCaptureSnapshotMock.mockResolvedValueOnce(
        snapshot({
          activeSessionId: "session-b",
          finalizingSessionIds: ["session-a"],
          liveSegmentsSessionId: "session-b",
          liveSegments: [
            snapshotSegment("session-b-segment", "belongs to session b"),
          ],
        }),
      );

      await expect(
        store.getState().attachLiveSession("session-a", {
          handlePersist,
          onStopped,
        }),
      ).resolves.toBe("attached");

      expect(store.getState().getSessionMode("session-a")).toBe("finalizing");
      expect(generation()).toBe(1);
      expect(store.getState().handlePersistBySession["session-a"]).toBe(
        handlePersist,
      );
      expect(store.getState().onStoppedBySession["session-a"]).toBe(onStopped);
      expect(store.getState().liveSegments).toEqual([]);
    });

    test("hydrates finalizing native capture for the same session", async () => {
      const data = captureListener(listenCaptureDataMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(
        snapshot({
          activeSessionId: null,
          finalizingSessionIds: ["session-a"],
          liveTranscriptionActive: null,
          requestedLiveTranscription: null,
          state: "finalizing",
        }),
      );

      await store.getState().attachLiveSession("session-a");

      expect(store.getState().live.sessionId).toBe("session-a");
      expect(store.getState().getSessionMode("session-a")).toBe("finalizing");
      expect(generation()).toBe(1);

      data.emit(segmentDelta({ upserts: [segment("segment-1", "hello")] }));
      flushLiveTranscriptBatches();

      expect(store.getState().liveSegments).toMatchObject([
        { id: "segment-1", text: "hello" },
      ]);
    });

    test("replays segment events after snapshot hydration", async () => {
      let resolveSnapshot: ((value: unknown) => void) | undefined;
      const data = captureListener(listenCaptureDataMock);
      getCaptureSnapshotMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
      );

      const attachPromise = store.getState().attachLiveSession("session-a");
      await vi.waitFor(() => expect(data.attached).toBe(true));

      data.emit(
        segmentDelta({
          upserts: [segment("segment-before-snapshot", "early")],
        }),
      );
      expect(store.getState().liveSegments).toEqual([]);

      resolveSnapshot?.(snapshot({ liveSegments: [] }));
      await expect(attachPromise).resolves.toBe("attached");
      expect(store.getState().liveSegments).toMatchObject([
        { id: "segment-before-snapshot", text: "early" },
      ]);
    });

    test("bounds and releases buffered segments when snapshot hydration times out", async () => {
      vi.useFakeTimers();
      try {
        const data = captureListener(listenCaptureDataMock);
        getCaptureSnapshotMock.mockReturnValueOnce(new Promise(() => {}));
        const handleTranscriptSegmentDelta = vi.fn(
          store.getState().handleTranscriptSegmentDelta,
        );
        store.setState({ handleTranscriptSegmentDelta });

        const emitSegmentDelta = (delta: Parameters<typeof segmentDelta>[0]) =>
          data.emit(segmentDelta(delta));
        const attachPromise = store.getState().attachLiveSession("session-a");
        await vi.waitFor(() => expect(data.attached).toBe(true));

        for (let index = 0; index < 1_000; index += 1) {
          emitSegmentDelta({
            upserts: [
              segment(`segment-${index}`, `segment ${index}`, index, index + 1),
            ],
          });
          emitSegmentDelta({ removed_ids: [`removed-${index}`] });
        }
        emitSegmentDelta({
          removed_ids: ["segment-999"],
          upserts: [segment("segment-998", "latest segment 998", 998, 999)],
        });

        expect(handleTranscriptSegmentDelta).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(5_000);
        await expect(attachPromise).resolves.toBe("error");

        expect(handleTranscriptSegmentDelta).toHaveBeenCalledOnce();
        const replayedDelta = handleTranscriptSegmentDelta.mock.calls[0]?.[0];
        expect(replayedDelta?.upserts).toHaveLength(199);
        expect(replayedDelta?.removed_ids).toHaveLength(200);
        expect(replayedDelta?.removed_ids).toContain("segment-999");
        expect(replayedDelta?.upserts).toContainEqual(
          expect.objectContaining({
            id: "segment-998",
            text: "latest segment 998",
          }),
        );

        emitSegmentDelta({
          upserts: [
            segment("segment-after-timeout", "still live", 2_000, 2_001),
          ],
        });
        // Après l'instantané, les deltas passent par le lot de 100 ms.
        expect(store.getState().liveSegments).not.toContainEqual(
          expect.objectContaining({ id: "segment-after-timeout" }),
        );
        await vi.advanceTimersByTimeAsync(100);
        expect(handleTranscriptSegmentDelta).toHaveBeenCalledOnce();
        expect(store.getState().liveSegments).toContainEqual(
          expect.objectContaining({ id: "segment-after-timeout" }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    test("an already-subscribed attach does not overwrite newer segment events with its snapshot", async () => {
      let resolveSnapshot: ((value: unknown) => void) | undefined;
      const data = captureListener(listenCaptureDataMock);
      getCaptureSnapshotMock.mockResolvedValueOnce(
        snapshot({ liveSegments: [] }),
      );
      await store.getState().attachLiveSession("session-a");

      getCaptureSnapshotMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
      );
      const reattachPromise = store.getState().attachLiveSession("session-a", {
        handlePersist: vi.fn(),
      });
      data.emit(
        segmentDelta({
          upserts: [segment("newer-segment", "newer", 0, 1_000)],
        }),
      );

      resolveSnapshot?.(snapshot({ liveSegments: [] }));
      await expect(reattachPromise).resolves.toBe("attached");
      flushLiveTranscriptBatches();
      expect(store.getState().liveSegments).toMatchObject([
        { id: "newer-segment", text: "newer" },
      ]);

      clearInterval(store.getState().live.intervalId);
    });
  });

  describe("Start Action", () => {
    test("start returns false while another session is active", async () => {
      store.setState((state) =>
        mutate(state, (draft) => {
          draft.live.status = "active";
          draft.live.loading = true;
          draft.live.sessionId = "session-a";
        }),
      );

      await expect(
        store.getState().start(startParams("session-b")),
      ).resolves.toBe(false);
      expect(store.getState().live.sessionId).toBe("session-a");
    });

    test("holds the session audio lock until capture startup finishes", async () => {
      const resolveStart = deferredStart<{ status: "ok"; data: null }>();
      const start = store.getState().start(startParams());

      await vi.waitFor(() => expect(startCaptureMock).toHaveBeenCalled());
      const nextOperation = vi.fn(async () => {});
      const queued = enqueueSessionAudioOperation("session-a", nextOperation);
      expect(nextOperation).not.toHaveBeenCalled();

      resolveStart({ status: "ok", data: null });
      await expect(start).resolves.toBe(true);
      await queued;
      expect(nextOperation).toHaveBeenCalledOnce();
    });

    test("releases a failed start generation before retrying", async () => {
      const consoleError = silenceConsoleError();
      startCaptureMock.mockResolvedValueOnce({
        status: "error",
        error: "capture unavailable",
      });

      await expect(store.getState().start(startParams())).resolves.toBe(false);
      expect(generation()).toBeUndefined();
      expect(store.getState().live).toMatchObject({
        captureGenerationCounter: 1,
        lastError: "capture unavailable",
        lastErrorSessionId: "session-a",
        lastErrorIsAudioRelated: false,
      });

      await expect(store.getState().start(startParams())).resolves.toBe(true);
      expect(generation()).toBe(2);
      expect(store.getState().live.lastError).toBeNull();
      expect(store.getState().live.lastErrorSessionId).toBeNull();
      consoleError.mockRestore();
    });

    test.each([
      {
        failure: "a rejected capture startup",
        error: "audio backend unavailable",
        captureCalled: true,
        arrange: () =>
          startCaptureMock.mockRejectedValueOnce(
            new Error("audio backend unavailable"),
          ),
      },
      {
        failure: "a pre-capture startup failure",
        error: "storage unavailable",
        captureCalled: false,
        arrange: () =>
          vaultBaseMock.mockResolvedValueOnce({
            status: "error",
            error: "storage unavailable",
          }),
      },
    ])(
      "keeps $failure visible without classifying it as an audio error",
      async ({ error, captureCalled, arrange }) => {
        const consoleError = silenceConsoleError();
        arrange();

        await expect(store.getState().start(startParams())).resolves.toBe(
          false,
        );

        expect(startCaptureMock).toHaveBeenCalledTimes(captureCalled ? 1 : 0);
        expect(store.getState().live).toMatchObject({
          lastError: error,
          lastErrorSessionId: "session-a",
          lastErrorIsAudioRelated: false,
        });
        consoleError.mockRestore();
      },
    );

    test.each([
      {
        progress: {
          type: "audio_error",
          session_id: "session-a",
          error: "microphone unavailable",
          is_fatal: true,
        },
        lastError: "microphone unavailable",
        audioRelated: true,
      },
      {
        progress: {
          type: "connection_error",
          session_id: "session-a",
          error: "transcription connection closed",
        },
        lastError: "start session failed",
        audioRelated: false,
      },
    ])(
      "keeps only explicit audio errors when capture startup fails after $progress.type",
      async ({ progress, lastError, audioRelated }) => {
        const consoleError = silenceConsoleError();
        const resolveStart = deferredStart<{
          status: "error";
          error: string;
        }>();

        const start = store.getState().start(startParams());

        await vi.waitFor(() => expect(startCaptureMock).toHaveBeenCalled());
        lastStatusHandler()?.({ payload: progress });
        resolveStart({ status: "error", error: "start session failed" });

        await expect(start).resolves.toBe(false);
        expect(store.getState().live).toMatchObject({
          lastError,
          lastErrorSessionId: "session-a",
          lastErrorIsAudioRelated: audioRelated,
        });
        consoleError.mockRestore();
      },
    );

    test("deduplicates capture generation across native start event ordering", async () => {
      const lifecycle = captureListener(listenCaptureLifecycleMock, {
        persistent: true,
      });
      const resolveStart = deferredStart<{ status: "ok"; data: null }>();

      const firstStart = store.getState().start(startParams());
      await vi.waitFor(() => expect(startCaptureMock).toHaveBeenCalledOnce());
      lifecycle.emit(started());
      expect(generation()).toBe(1);
      resolveStart({ status: "ok", data: null });
      await expect(firstStart).resolves.toBe(true);
      expect(generation()).toBe(1);
      lifecycle.emit(stopped());

      await expect(store.getState().start(startParams())).resolves.toBe(true);
      expect(generation()).toBe(2);
      lifecycle.emit(started());
      expect(generation()).toBe(2);
      lifecycle.emit(stopped());
    });

    test("startTranscription rejects when the session is already running batch", async () => {
      const sessionId = "session-batch";
      store.getState().handleBatchStarted(sessionId);

      await expect(
        store.getState().startTranscription({
          session_id: sessionId,
          provider: "openai",
          file_path: "/tmp/session.wav",
          base_url: "",
          api_key: "",
        }),
      ).rejects.toThrow(
        `[listener] session ${sessionId} is already processing in batch mode`,
      );
    });
  });

  describe("Capture status warnings", () => {
    const audioError = (error: string, sessionId = "session-a") => ({
      type: "audio_error",
      session_id: sessionId,
      error,
      is_fatal: false,
      device: null,
    });
    const startAndGetStatusHandler = async () => {
      await store.getState().start(startParams());
      return lastStatusHandler();
    };

    test("notifies about preserved audio without marking capture as failed", async () => {
      const handler = await startAndGetStatusHandler();
      const warning = vi
        .spyOn(toast, "warning")
        .mockImplementation(() => "warning");
      handler?.({ payload: audioError("recording_recovered", "session-b") });
      expect(toast.warning).not.toHaveBeenCalled();
      handler?.({ payload: audioError("recording_recovered") });
      expect(toast.warning).toHaveBeenCalledWith(
        "The previous recording needs recovery",
        expect.objectContaining({
          id: "recording-recovered-session-a",
          duration: Infinity,
          description: expect.stringContaining("Your transcript is unchanged"),
        }),
      );
      expect(store.getState().live.lastError).toBeNull();
      expect(stopCaptureMock).not.toHaveBeenCalled();
      warning.mockRestore();
    });

    // Issue 419 : l'alerte « aucun audio capté » mène à la ligne Microphone.
    const raiseNoAudioWarning = async () => {
      const handler = await startAndGetStatusHandler();
      const warning = vi
        .spyOn(toast, "warning")
        .mockImplementation(() => "warning");
      handler?.({ payload: audioError("audio_capture_unavailable") });
      await vi.waitFor(() =>
        expect(listMicrophoneDevicesMock).toHaveBeenCalled(),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      return warning;
    };

    test("device settings opens the meetings page on the microphone row", async () => {
      const warning = await raiseNoAudioWarning();
      const options = warning.mock.calls[0]?.[1] as {
        secondaryAction: { label: string; onClick: () => void };
      };
      expect(warning.mock.calls[0]?.[0]).toBe("No audio is being captured");
      expect(options.secondaryAction.label).toBe("Device settings");

      const { useTabs } = await import("~/store/zustand/tabs");
      const { useSettingFocus } = await import("~/settings/setting-focus");
      const openNew = vi.fn();
      useTabs.setState({ openNew });
      options.secondaryAction.onClick();
      await vi.waitFor(() =>
        expect(openNew).toHaveBeenCalledWith({
          type: "settings",
          state: { tab: "meetings" },
        }),
      );
      expect(useSettingFocus.getState().pending).toBe("meetings-microphone");
      useSettingFocus.getState().clear();
      warning.mockRestore();
    });

    test("says no microphone is detected when the input list is empty", async () => {
      listMicrophoneDevicesMock.mockResolvedValue({ status: "ok", data: [] });
      const warning = await raiseNoAudioWarning();
      await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(2));
      const description = (warning.mock.calls[1][1] as { description: string })
        .description;
      expect(description).toContain("No microphone detected");
      expect(description).not.toContain("Choose a working audio device");
      warning.mockRestore();
    });

    test("keeps the device advice when microphones are listed", async () => {
      const warning = await raiseNoAudioWarning();
      expect(warning).toHaveBeenCalledTimes(1);
      expect(
        (warning.mock.calls[0][1] as { description: string }).description,
      ).toContain("Choose a working audio device");
      warning.mockRestore();
    });

    test("keeps storage failures in shared live state without stopping capture", async () => {
      const handler = await startAndGetStatusHandler();
      handler?.({ payload: audioError("audio_storage_backpressure") });
      expect(store.getState().live).toMatchObject({
        lastError: "audio_storage_backpressure",
        lastErrorIsAudioRelated: true,
        sessionId: "session-a",
      });
      expect(stopCaptureMock).not.toHaveBeenCalled();
    });

    test("keeps storage warnings out of shared live errors", async () => {
      const handler = await startAndGetStatusHandler();
      handler?.({ payload: audioError("audio_saving_delayed: low disk") });
      handler?.({ payload: audioError("audio_disk_low") });
      expect(store.getState().live.lastError).toBeNull();
      expect(stopCaptureMock).not.toHaveBeenCalled();
    });
  });
});
