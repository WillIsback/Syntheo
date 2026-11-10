import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BatchResponseProcessingError } from "./batch-response-processing-error";
import { completeCaptureTranscript } from "./capture-completion";
import { NoSpeechDetectedError } from "./no-speech-error";
import {
  canRunBatchTranscription,
  EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE,
  getBatchProvider,
  getSessionSpeakerCount,
  isTerminalTranscriptionError,
} from "./useRunBatch";
import { useRunBatch } from "./useRunBatch";

import { acknowledgeCompletedBatch } from "~/store/zustand/listener/general-batch";

vi.mock("./capture-completion", () => ({
  completeCaptureTranscript: vi.fn().mockResolvedValue(undefined),
}));

const m = vi.hoisted(() => ({
  startTranscription: vi.fn(),
  stopTranscription: vi.fn(),
  useListener: vi.fn(),
  useSession: vi.fn(),
  useSessionParticipants: vi.fn(),
  useSTTConnection: vi.fn(),
  useConfigValue: vi.fn(),
  isSupportedLanguagesBatch: vi.fn(),
  isSupportedLanguagesLive: vi.fn(),
  toastWarning: vi.fn(),
  deleteProcessedAudioForRetention: vi.fn(),
  saveBatchTranscript: vi.fn(),
  reconcileRefinedSpeakerClusters: vi.fn(),
  notifyBatchCompleted: vi.fn(),
  id: vi.fn(),
  arch: vi.fn(),
  platform: vi.fn(),
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    saveBatchTranscript: m.saveBatchTranscript,
    reconcileRefinedSpeakerClusters: m.reconcileRefinedSpeakerClusters,
  },
}));
vi.mock("@tauri-apps/plugin-os", () => ({
  arch: m.arch,
  platform: m.platform,
}));
vi.mock("./contexts", () => ({ useListener: m.useListener }));
vi.mock("./useKeywords", () => ({
  getSessionKeywords: vi.fn(async () => []),
  useKeywords: vi.fn(() => []),
}));
vi.mock("./useSTTConnection", () => ({
  useSTTConnection: m.useSTTConnection,
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { warning: m.toastWarning },
}));
vi.mock("~/services/audio-retention", () => ({
  deleteProcessedAudioForRetention: m.deleteProcessedAudioForRetention,
  normalizeAudioRetention: (value: unknown) =>
    typeof value === "string" ? value : "forever",
}));
vi.mock("~/session/queries", () => ({
  useSession: m.useSession,
  useSessionParticipants: m.useSessionParticipants,
}));
vi.mock("~/shared/config", () => ({ useConfigValue: m.useConfigValue }));
vi.mock("~/shared/utils", () => ({ id: m.id }));
vi.mock("~/stt/capabilities", () => {
  const baseLanguageCode = (language: string) =>
    language.split(/[-_]/)[0]?.toLowerCase() ?? "";

  return {
    getTranscriptionLanguages: (
      mainLanguage: string | null | undefined,
      spokenLanguages: readonly string[] | null | undefined,
    ) => {
      const seen = new Set<string>();
      const languages: string[] = [];
      for (const language of [mainLanguage, ...(spokenLanguages ?? [])]) {
        if (!language) continue;
        const baseCode = baseLanguageCode(language);
        if (!baseCode || seen.has(baseCode)) continue;
        seen.add(baseCode);
        languages.push(language);
      }
      return languages;
    },
    isSupportedLanguagesBatch: m.isSupportedLanguagesBatch,
    isSupportedLanguagesLive: m.isSupportedLanguagesLive,
    getSttModelTranscriptionMode: (provider?: string | null) =>
      provider === "nvidia" ? "live" : undefined,
  };
});
vi.mock("~/store/zustand/listener/general-batch", () => ({
  acknowledgeCompletedBatch: vi.fn(async () => {}),
  notifyBatchCompleted: m.notifyBatchCompleted,
}));

const LOCAL_URL = "http://192.168.1.87:8000/v1";

function setConnection(overrides: Record<string, unknown> = {}) {
  m.useSTTConnection.mockReturnValue({
    conn: {
      provider: "openai",
      model: "whisper-large-v3",
      baseUrl: LOCAL_URL,
      apiKey: "test-key",
      ...overrides,
    },
  });
}

// Configuration : langue « en », toute autre clé vaut [] sauf surcharge.
function setConfig(values: Record<string, unknown>) {
  m.useConfigValue.mockImplementation((key: string) =>
    key in values ? values[key] : key === "ai_language" ? "en" : [],
  );
}

const batchWord = (text: string, startMs = 0, endMs = 100, channel = 0) => ({
  text,
  start_ms: startMs,
  end_ms: endMs,
  channel,
});

// Le fournisseur émet ces mots puis termine.
function emits(words: unknown[], hints: unknown[] = [], options?: unknown) {
  m.startTranscription.mockImplementation(async (_params, callbacks) => {
    callbacks.handlePersist(words, hints, ...(options ? [options] : []));
  });
}

// Le fournisseur reste en cours jusqu'à l'appel de la fonction renvoyée.
function pendingStart() {
  const control: { finish: () => void; fail: (reason: Error) => void } = {
    finish: () => {},
    fail: () => {},
  };
  m.startTranscription.mockImplementationOnce(
    () =>
      new Promise<void>((resolve, reject) => {
        control.finish = resolve;
        control.fail = reject;
      }),
  );
  return control;
}

const renderBatch = (sessionId = "session-1") =>
  renderHook(() => useRunBatch(sessionId)).result;

async function runBatch(
  options?: Record<string, unknown>,
  path = "/tmp/session.wav",
) {
  const result = renderBatch();
  await act(async () => {
    await result.current(path, options);
  });
}

async function runBatchError(options?: Record<string, unknown>) {
  const result = renderBatch();
  let error: unknown;
  await act(async () => {
    try {
      await result.current("/tmp/session.wav", options);
    } catch (caught) {
      error = caught;
    }
  });
  return error;
}

const currentCapture = (
  audioOffsetMs = 60_000,
  replaceTranscriptId = "transcript-current-live",
) => ({
  scope: "current_capture" as const,
  audioOffsetMs,
  replaceTranscriptId,
  startedAt: 123_000,
});

const savedCurrentCapture = (
  audioOffsetMs = 60_000,
  replaceTranscriptId = "transcript-current-live",
) => ({
  scope: "current_capture",
  audio_offset_ms: audioOffsetMs,
  replace_transcript_id: replaceTranscriptId,
  started_at: 123_000,
});

const savedWith = (expected: Record<string, unknown>) =>
  expect(m.saveBatchTranscript).toHaveBeenCalledWith(
    expect.objectContaining(expected),
  );

describe("getBatchProvider", () => {
  test.each([
    ["openai", "gpt-4o-transcribe", "openai"],
    ["openai", "mistralai/Voxtral-Mini-3B-2507", "openai"],
    ["nvidia", "nemotron-asr-streaming", null],
    ["deepgram", "nova-3", null],
  ] as const)("maps %s/%s to %s", (provider, model, expected) => {
    expect(getBatchProvider(provider, model)).toBe(expected);
  });
});

describe("canRunBatchTranscription", () => {
  test("allows post-capture batch so useRunBatch can choose a fallback", () => {
    expect(canRunBatchTranscription(null)).toBe(true);
    expect(
      canRunBatchTranscription({ provider: "custom", model: "realtime-only" }),
    ).toBe(true);
  });
});

describe("isTerminalTranscriptionError", () => {
  test("stops retries after a provider response cannot be processed", () => {
    expect(
      isTerminalTranscriptionError(
        new BatchResponseProcessingError(new Error("database is locked")),
      ),
    ).toBe(true);
  });

  test.each([
    "Bad Request: failed to process audio: corrupt or unsupported data",
    "No speech detected",
    "Authentication failed: 401 Unauthorized",
    EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE,
  ])("classifies permanent failures: %s", (message) => {
    expect(isTerminalTranscriptionError(new Error(message))).toBe(true);
  });

  test.each([
    "request timed out",
    "429 Too Many Requests",
    "503 Service Unavailable",
    "database is locked",
    "nova-3 can't transcribe a recording afterwards",
    "The transcription service is not available",
  ])("leaves transient failures retryable: %s", (message) => {
    expect(isTerminalTranscriptionError(new Error(message))).toBe(false);
  });
});

describe("useRunBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.saveBatchTranscript.mockImplementation(async (request) => ({
      status: "ok",
      data: { status: "saved", transcript_id: request.transcript_id },
    }));
    m.stopTranscription.mockResolvedValue(undefined);
    m.arch.mockReturnValue("aarch64");
    m.platform.mockReturnValue("macos");

    let nextId = 0;
    m.id.mockImplementation(() => `generated-${++nextId}`);
    m.notifyBatchCompleted.mockResolvedValue(undefined);
    m.deleteProcessedAudioForRetention.mockResolvedValue(undefined);
    m.isSupportedLanguagesBatch.mockResolvedValue(true);
    m.useListener.mockImplementation((selector) =>
      selector({
        startTranscription: m.startTranscription,
        stopTranscription: m.stopTranscription,
      }),
    );
    m.useSession.mockReturnValue({
      id: "session-1",
      user_id: "user-1",
      raw_md: "Existing memo",
    });
    m.useSessionParticipants.mockReturnValue([]);
    setConnection();
    setConfig({});
  });

  describe("annulation", () => {
    test("does not start a dictation transcription after a pre-aborted signal", async () => {
      const abort = new AbortController();
      abort.abort();
      const result = renderBatch("dictation");
      await expect(
        result.current("/tmp/voice.wav", { signal: abort.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(m.startTranscription).not.toHaveBeenCalled();
    });

    test("cancels the active provider and never retries authentication after abort", async () => {
      const abort = new AbortController();
      setConnection({ apiKey: "local-key" });
      const provider = pendingStart();
      const result = renderBatch("dictation");
      const run = result.current("/tmp/voice.wav", { signal: abort.signal });
      const rejected = expect(run).rejects.toMatchObject({
        name: "AbortError",
      });
      await waitFor(() => expect(m.startTranscription).toHaveBeenCalledOnce());
      abort.abort();
      const persist = m.startTranscription.mock.calls[0]?.[1]?.handlePersist;
      expect(() => persist?.([batchWord("cancelled")], [])).not.toThrow();
      provider.fail(
        new Error(
          "Authentication failed. Please check your API key in settings.",
        ),
      );
      await rejected;
      expect(m.stopTranscription).toHaveBeenCalledWith("dictation");
      expect(m.startTranscription).toHaveBeenCalledOnce();
      expect(m.saveBatchTranscript).not.toHaveBeenCalled();
    });

    test("retries cancellation after native startup finishes", async () => {
      const abort = new AbortController();
      const provider = pendingStart();
      const result = renderBatch("dictation");
      const run = result.current("/tmp/voice.wav", { signal: abort.signal });
      const rejected = expect(run).rejects.toMatchObject({
        name: "AbortError",
      });
      await waitFor(() => expect(m.startTranscription).toHaveBeenCalledOnce());
      abort.abort();
      expect(m.stopTranscription).not.toHaveBeenCalled();
      provider.finish();
      await rejected;
      expect(m.stopTranscription).toHaveBeenCalledTimes(1);
    });

    test("cancels only the background repair when its capture ends", async () => {
      const abort = new AbortController();
      const provider = pendingStart();
      const persist = vi.fn();
      const result = renderBatch();
      const run = result.current("/tmp/chunk.mp3", {
        signal: abort.signal,
        recovery: { persist },
      });
      const rejected = expect(run).rejects.toMatchObject({
        name: "AbortError",
      });
      await waitFor(() => expect(m.startTranscription).toHaveBeenCalledOnce());
      abort.abort();
      provider.finish();
      await rejected;
      expect(m.stopTranscription).toHaveBeenCalledWith("session-1:recovery");
      expect(m.stopTranscription).not.toHaveBeenCalledWith("session-1");
      expect(persist).not.toHaveBeenCalled();
    });
  });

  describe("fournisseur", () => {
    test("run_batch_uses_local_provider_without_cloud_session", async () => {
      // Aucune session cloud : le batch part sur l'endpoint on-premise configuré.
      setConnection({ model: "voxtral", apiKey: "local-key" });
      m.startTranscription.mockResolvedValueOnce(undefined);
      const result = renderBatch("dictation");
      await result.current("/tmp/voice.wav").catch(() => undefined);
      expect(m.startTranscription).toHaveBeenCalledOnce();
      expect(m.startTranscription.mock.calls[0]?.[0]).toMatchObject({
        provider: "openai",
        model: "voxtral",
        base_url: LOCAL_URL,
        api_key: "local-key",
      });
    });

    test("passes selected transcription languages to batch transcription", async () => {
      setConnection({ apiKey: "" });
      m.useConfigValue.mockImplementation((key) =>
        key === "ai_language" ? "de" : ["en"],
      );
      m.startTranscription.mockResolvedValue(undefined);

      await runBatch();

      expect(m.startTranscription).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          model: "whisper-large-v3",
          languages: ["de", "en"],
        }),
        expect.any(Object),
      );
    });

    test.each(["windows", "linux"] as const)(
      "reports a language mismatch instead of a platform gap when an on-prem model is configured on %s",
      async (currentPlatform) => {
        m.platform.mockReturnValue(currentPlatform);
        m.isSupportedLanguagesBatch.mockResolvedValue(false);
        setConnection({ model: "voxtral-mini-2602", apiKey: "" });

        expect(await runBatchError()).toMatchObject({
          message: expect.stringContaining(
            "voxtral-mini-2602 can't transcribe the selected languages",
          ),
        });
        expect(m.startTranscription).not.toHaveBeenCalled();
        expect(m.toastWarning).not.toHaveBeenCalled();
      },
    );

    test.each(["windows", "linux", "macos"] as const)(
      "uses on-prem OpenAI-compatible batch endpoints on %s",
      async (currentPlatform) => {
        m.platform.mockReturnValue(currentPlatform);
        setConnection({
          model: "realtime-only",
          baseUrl: "https://custom.test",
          apiKey: "custom-key",
        });

        await runBatch();

        expect(m.startTranscription).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: "openai",
            model: "realtime-only",
            base_url: "https://custom.test",
            api_key: "custom-key",
          }),
          expect.any(Object),
        );
        expect(m.toastWarning).not.toHaveBeenCalled();
      },
    );
  });

  describe("enregistrement", () => {
    test("imported_audio_is_deleted_after_transcription", async () => {
      setConfig({ audio_retention: "forever" });
      emits([batchWord("hello")]);
      await runBatch(undefined, "/tmp/imported.mp3");
      expect(m.deleteProcessedAudioForRetention).toHaveBeenCalledWith(
        "none",
        "session-1",
      );
    });

    test("promotes the complete streamed transcript before retention", async () => {
      const provider = pendingStart();
      const result = renderBatch();
      const run = result.current("/tmp/session.wav", {
        promotion: { scope: "whole_session" },
      });

      await waitFor(() => {
        expect(m.startTranscription).toHaveBeenCalledTimes(1);
      });
      const persist = m.startTranscription.mock.calls[0]?.[1]?.handlePersist;
      persist?.([batchWord("hello")], []);
      persist?.([batchWord("world", 100, 200)], []);

      expect(m.saveBatchTranscript).not.toHaveBeenCalled();
      expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
      expect(m.notifyBatchCompleted).not.toHaveBeenCalled();

      provider.finish();
      await act(async () => await run);

      savedWith({
        session_id: "session-1",
        transcript_id: expect.any(String),
        owner_user_id: "user-1",
        created_at: expect.any(String),
        started_at: expect.any(Number),
        memo: "Existing memo",
        provider: "openai",
        model: "whisper-large-v3",
        promotion: { scope: "whole_session" },
        mark_audio_complete: true,
        words: [
          expect.objectContaining({ text: "hello" }),
          expect.objectContaining({ text: "world" }),
        ],
        hints: [],
      });
      expect(m.deleteProcessedAudioForRetention).toHaveBeenCalledTimes(1);
      expect(m.startTranscription.mock.calls[0]?.[1]?.notifyOnCompletion).toBe(
        false,
      );
      expect(m.notifyBatchCompleted).toHaveBeenCalledOnce();
      const saveOrder = m.saveBatchTranscript.mock.invocationCallOrder[0]!;
      expect(saveOrder).toBeLessThan(
        m.notifyBatchCompleted.mock.invocationCallOrder[0]!,
      );
      expect(saveOrder).toBeLessThan(
        m.deleteProcessedAudioForRetention.mock.invocationCallOrder[0]!,
      );
    });

    test("capture repair saves its original interval while deferring audio finalization", async () => {
      emits([batchWord("recovered")]);
      await runBatch({
        deferAudioFinalization: true,
        captureInterval: { startedAtMs: 1000, stoppedAtMs: 2000 },
        promotion: { scope: "whole_session" },
      });

      savedWith({ mark_audio_complete: false, started_at: 1000 });
      expect(completeCaptureTranscript).toHaveBeenCalledWith(
        "session-1",
        m.saveBatchTranscript.mock.calls[0][0].transcript_id,
        2000,
      );
      expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
    });

    test("repairs a chunk separately from live capture and waits for its database commit", async () => {
      emits([batchWord("recovered")]);
      let commit!: () => void;
      const persist = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            commit = resolve;
          }),
      );
      const result = renderBatch();
      let completed = false;
      const run = result
        .current("/tmp/chunk.mp3", { recovery: { persist } })
        .then(() => {
          completed = true;
        });
      await waitFor(() => expect(persist).toHaveBeenCalledOnce());
      expect(m.startTranscription.mock.calls[0]?.[0]).toMatchObject({
        session_id: "session-1:recovery",
      });
      expect(m.startTranscription.mock.calls[0]?.[1]).toMatchObject({
        recovery: true,
      });
      expect(completed).toBe(false);
      expect(m.saveBatchTranscript).not.toHaveBeenCalled();
      expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
      commit();
      await act(async () => await run);
      expect(completed).toBe(true);
    });

    test("does not save for custom batch persist handlers", async () => {
      const handlePersist = vi.fn();
      emits([batchWord("custom")]);
      await runBatch({ handlePersist });
      expect(handlePersist).toHaveBeenCalledTimes(1);
      expect(m.saveBatchTranscript).not.toHaveBeenCalled();
    });

    test("promotes post-stop batch by replacing the live current capture", async () => {
      setConfig({ remember_speakers: true });
      m.saveBatchTranscript.mockResolvedValueOnce({
        status: "ok",
        data: { status: "saved", transcript_id: "saved-transcript-id" },
      });
      emits(
        [batchWord("old", 10_000, 10_500), batchWord("new", 60_100, 60_500)],
        [0, 1].map((index) => ({
          wordIndex: index,
          data: { type: "provider_speaker_index", speaker_index: index },
        })),
        { mode: "replace" },
      );

      await runBatch({ promotion: currentCapture() });

      savedWith({
        session_id: "session-1",
        transcript_id: expect.any(String),
        promotion: savedCurrentCapture(),
        mark_audio_complete: true,
        words: expect.arrayContaining([
          expect.objectContaining({ text: "old", start_ms: 10_000 }),
          expect.objectContaining({ text: "new", start_ms: 60_100 }),
        ]),
        hints: expect.arrayContaining([
          expect.objectContaining({ type: "provider_speaker_index" }),
        ]),
      });
    });

    test("passes staged speaker hints to the atomic save command", async () => {
      emits(
        [batchWord("answer", 60_100, 60_500, 1)],
        [
          {
            wordIndex: 0,
            data: {
              type: "provider_speaker_index",
              channel: 1,
              speaker_index: 3,
            },
          },
        ],
        { mode: "replace" },
      );

      await runBatch({ promotion: currentCapture() });

      savedWith({
        promotion: savedCurrentCapture(),
        words: [expect.objectContaining({ text: "answer", channel: 1 })],
        hints: [
          expect.objectContaining({
            type: "provider_speaker_index",
            value: '{"provider":"openai","channel":1,"speaker_index":3}',
          }),
        ],
      });
    });
  });

  describe("échecs d'enregistrement", () => {
    // Issue 559 : un import sans parole est un échec définitif. Sans accusé de
    // réception, la session native reprenait au lancement suivant (second toast).
    test("acknowledges a no-speech batch so it never resumes on next launch", async () => {
      m.startTranscription.mockRejectedValueOnce(new NoSpeechDetectedError());

      const error = await runBatchError({
        promotion: { scope: "whole_session" },
      });

      expect(error).toBeInstanceOf(NoSpeechDetectedError);
      expect(acknowledgeCompletedBatch).toHaveBeenCalledWith("session-1");
      expect(m.saveBatchTranscript).not.toHaveBeenCalled();
    });

    test("keeps other provider failures resumable", async () => {
      m.startTranscription.mockRejectedValueOnce(new Error("network down"));

      const error = await runBatchError({
        promotion: { scope: "whole_session" },
      });

      expect(error).toMatchObject({ message: "network down" });
      expect(acknowledgeCompletedBatch).not.toHaveBeenCalled();
    });

    test("does not make completed provider work retryable when persistence fails", async () => {
      emits([batchWord("recovered")]);
      m.saveBatchTranscript.mockRejectedValueOnce(
        new Error("disk write failed"),
      );

      const error = await runBatchError({
        deferAudioFinalization: true,
        promotion: { scope: "whole_session" },
      });

      expect(error).toBeInstanceOf(BatchResponseProcessingError);
      expect(isTerminalTranscriptionError(error)).toBe(true);
      expect(m.startTranscription).toHaveBeenCalledOnce();
      expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
    });

    test.each(["current_capture", "whole_session"] as const)(
      "keeps saved data when Rust reports truncation for %s refinement",
      async (scope) => {
        m.saveBatchTranscript.mockResolvedValueOnce({
          status: "ok",
          data: { status: "truncated" },
        });
        emits([batchWord("replacement", 60_100, 61_000)], [], {
          mode: "replace",
        });
        const isCurrent = scope === "current_capture";

        const error = await runBatchError({
          promotion: isCurrent ? currentCapture() : { scope },
        });

        expect(error).toMatchObject({
          message:
            "The new transcription returned much less text. Your saved transcript and recording were kept. Try transcribing again.",
        });
        expect(isTerminalTranscriptionError(error)).toBe(true);
        savedWith({
          promotion: isCurrent ? savedCurrentCapture() : { scope },
        });
        expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
        expect(m.notifyBatchCompleted).not.toHaveBeenCalled();
      },
    );

    test.each([
      { scope: "current_capture" as const },
      { scope: "whole_session" as const },
      { scope: undefined },
    ])(
      "keeps existing data when Rust cannot save the transcript ($scope)",
      async ({ scope }) => {
        m.saveBatchTranscript.mockResolvedValueOnce({
          status: "error",
          error: "database is unavailable",
        });
        emits([batchWord("replacement")]);

        const error = await runBatchError(
          scope === undefined
            ? undefined
            : {
                promotion:
                  scope === "current_capture"
                    ? currentCapture(0, "live-current")
                    : { scope },
              },
        );

        expect(error).toBeInstanceOf(BatchResponseProcessingError);
        expect(m.saveBatchTranscript).toHaveBeenCalledOnce();
        if (scope === undefined) {
          savedWith({
            promotion: { scope: "preserve_existing" },
            mark_audio_complete: true,
          });
        }
        expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
        expect(m.notifyBatchCompleted).not.toHaveBeenCalled();
      },
    );

    test.each([
      {
        name: "has no current-capture words",
        words: [batchWord("old", 10_000, 10_500)],
      },
      { name: "emits no words", words: [] },
    ])("retains recovery audio when the batch $name", async ({ words }) => {
      m.saveBatchTranscript.mockResolvedValueOnce({
        status: "ok",
        data: { status: "empty_current_capture" },
      });
      if (words.length > 0) {
        emits(words, [], { mode: "replace" });
      } else {
        m.startTranscription.mockResolvedValue(undefined);
      }

      const error = await runBatchError({ promotion: currentCapture() });

      expect(error).toMatchObject({
        message: expect.stringContaining(
          EMPTY_CURRENT_CAPTURE_TRANSCRIPT_ERROR_MESSAGE,
        ),
      });
      savedWith({
        promotion: savedCurrentCapture(),
        words: words.map((stored) =>
          expect.objectContaining({
            text: stored.text,
            start_ms: stored.start_ms,
          }),
        ),
      });
      expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
    });

    test("does not replace the live transcript when batch transcription fails", async () => {
      m.startTranscription.mockImplementation(async (_params, callbacks) => {
        callbacks.handlePersist([batchWord("partial")], []);
        throw new Error("provider failed");
      });

      expect(await runBatchError()).toMatchObject({
        message: expect.stringContaining("provider failed"),
      });
      expect(m.saveBatchTranscript).not.toHaveBeenCalled();
      expect(m.deleteProcessedAudioForRetention).not.toHaveBeenCalled();
    });
  });

  test("no_local_fallback_when_endpoint_has_no_batch", async () => {
    setConnection({
      provider: "nvidia",
      model: "nemotron-asr-streaming",
      baseUrl: "http://192.168.1.87:9000?provider=nvidia",
      apiKey: "",
    });
    m.startTranscription.mockResolvedValue(undefined);

    expect(await runBatchError()).toBeInstanceOf(Error);
    expect(m.startTranscription).not.toHaveBeenCalled();
  });

  describe("file import through the real-time stream", () => {
    const nvidia = {
      provider: "nvidia",
      model: "cache-aware-parakeet-rnnt-multi-asr-streaming-sortformer",
      baseUrl: "http://192.168.1.87:9000/?provider=nvidia",
      apiKey: "",
    };

    beforeEach(() => {
      m.useSTTConnection.mockReturnValue({ conn: nvidia });
      m.isSupportedLanguagesLive.mockResolvedValue(true);
      emits(
        [batchWord(" Bonjour", 1_000, 1_400, 2)],
        [
          {
            wordIndex: 0,
            data: { type: "provider_speaker_index", speaker_index: 1 },
          },
        ],
      );
    });

    test("streams the file when the caller allows it and saves the real provider", async () => {
      await runBatch(
        { allowRealtimeStream: true, promotion: { scope: "whole_session" } },
        "/home/will/archive.mp4",
      );

      expect(m.isSupportedLanguagesLive).toHaveBeenCalledWith(
        "nvidia",
        nvidia.model,
        ["en"],
      );
      expect(m.isSupportedLanguagesBatch).not.toHaveBeenCalled();
      expect(m.startTranscription.mock.calls[0]?.[0]).toMatchObject({
        provider: "realtime",
        file_path: "/home/will/archive.mp4",
        model: nvidia.model,
        base_url: nvidia.baseUrl,
      });
      const saved = m.saveBatchTranscript.mock.calls[0]?.[0];
      expect(saved).toMatchObject({ provider: "nvidia", model: nvidia.model });
      expect(JSON.parse(saved.hints[0].value)).toMatchObject({
        provider: "nvidia",
        speaker_index: 1,
      });
    });

    // Issue 518 : un modèle qui ne gère qu'une langue à la fois rejoue le
    // fichier dans la langue principale, comme l'écoute en direct.
    test("streams in the primary language when the model handles one language at a time", async () => {
      setConfig({ ai_language: "fr", spoken_languages: ["fr", "en"] });
      m.isSupportedLanguagesLive.mockImplementation(
        async (_provider: string, _model: string, languages: string[]) =>
          languages.length === 1,
      );

      await runBatch(
        { allowRealtimeStream: true, promotion: { scope: "whole_session" } },
        "/home/will/archive.mp4",
      );

      expect(m.startTranscription.mock.calls[0]?.[0]).toMatchObject({
        provider: "realtime",
        languages: ["fr"],
      });
    });

    test("keeps other batch features off with a live-only model", async () => {
      const result = renderBatch("chat-dictation");
      await expect(
        result.current("", {
          audio: { data_base64: "AAAA", file_name: "a.wav" },
        }),
      ).rejects.toThrow(/can't transcribe a recording afterwards/);
      expect(m.startTranscription).not.toHaveBeenCalled();
    });
  });
});

describe("getSessionSpeakerCount", () => {
  test("counts distinct session participants plus the current user", () => {
    expect(
      getSessionSpeakerCount(["human-a", "human-a", "human-b"], "self"),
    ).toBe(3);
  });

  test("returns undefined until at least two speakers are known", () => {
    expect(getSessionSpeakerCount(["human-a"], null)).toBe(undefined);
  });
});
