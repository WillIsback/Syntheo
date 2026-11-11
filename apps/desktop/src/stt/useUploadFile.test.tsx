import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { isAudioUploadFile, useUploadFile } from "./useUploadFile";

const {
  audioSourceMetadataMock,
  audioImportMock,
  audioImportListenMock,
  downloadDirMock,
  homeDirMock,
  selectFileMock,
  parseSubtitleMock,
  createTranscriptMock,
  enhanceMock,
  queueAutoEnhanceIfSummaryEmptyMock,
  handleBatchFailedMock,
  handleBatchStartedMock,
  updateBatchProgressMock,
  clearBatchSessionMock,
  handleImportStartedMock,
  handleImportEndedMock,
  runBatchMock,
  useSessionMock,
  updateSessionMock,
  useTabsMock,
  updateSessionTabStateMock,
  beginAudioUploadMock,
  appendAudioUploadMock,
  discardAudioUploadMock,
  toastWarningMock,
  toastErrorMock,
  sttConnection,
} = vi.hoisted(() => ({
  audioSourceMetadataMock: vi.fn(),
  audioImportMock: vi.fn(),
  audioImportListenMock: vi.fn(),
  downloadDirMock: vi.fn(),
  homeDirMock: vi.fn(),
  selectFileMock: vi.fn(),
  parseSubtitleMock: vi.fn(),
  createTranscriptMock: vi.fn(),
  enhanceMock: vi.fn(),
  queueAutoEnhanceIfSummaryEmptyMock: vi.fn(),
  handleBatchFailedMock: vi.fn(),
  handleBatchStartedMock: vi.fn(),
  updateBatchProgressMock: vi.fn(),
  clearBatchSessionMock: vi.fn(),
  handleImportStartedMock: vi.fn(),
  handleImportEndedMock: vi.fn(),
  runBatchMock: vi.fn(),
  useSessionMock: vi.fn(),
  updateSessionMock: vi.fn(),
  useTabsMock: vi.fn(),
  updateSessionTabStateMock: vi.fn(),
  beginAudioUploadMock: vi.fn(),
  appendAudioUploadMock: vi.fn(),
  discardAudioUploadMock: vi.fn(),
  toastWarningMock: vi.fn(),
  toastErrorMock: vi.fn(),
  sttConnection: {
    value: { provider: "openai", model: "whisper-1" } as {
      provider: string;
      model: string;
    } | null,
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  downloadDir: downloadDirMock,
  homeDir: homeDirMock,
  resolveResource: vi.fn((path: string) =>
    Promise.resolve(`/resources/${path}`),
  ),
  sep: vi.fn().mockReturnValue("/"),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: selectFileMock,
}));

vi.mock("@syntheo/plugin-fs-sync", () => ({
  commands: {
    audioImport: audioImportMock,
    audioSourceMetadata: audioSourceMetadataMock,
  },
  events: {
    audioImportEvent: {
      listen: audioImportListenMock,
    },
  },
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    parseSubtitle: parseSubtitleMock,
    beginAudioUpload: beginAudioUploadMock,
    appendAudioUpload: appendAudioUploadMock,
    discardAudioUpload: discardAudioUploadMock,
  },
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { warning: toastWarningMock, error: toastErrorMock },
}));

vi.mock("./useSTTConnection", () => ({
  useSTTConnection: () => ({ conn: sttConnection.value }),
}));

vi.mock("./contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({
      handleBatchStarted: handleBatchStartedMock,
      handleBatchFailed: handleBatchFailedMock,
      updateBatchProgress: updateBatchProgressMock,
      clearBatchSession: clearBatchSessionMock,
      handleImportStarted: handleImportStartedMock,
      handleImportEnded: handleImportEndedMock,
    }),
}));

vi.mock("./useRunBatch", () => ({
  isStoppedTranscriptionError: vi.fn(() => false),
  useRunBatch: vi.fn(() => runBatchMock),
}));

vi.mock("~/services/enhancer", () => ({
  getEnhancerService: vi.fn(() => ({
    enhance: enhanceMock,
    queueAutoEnhanceIfSummaryEmpty: queueAutoEnhanceIfSummaryEmptyMock,
  })),
}));

vi.mock("~/session/queries", () => ({
  useSession: useSessionMock,
  useUpdateSession: () => updateSessionMock,
}));

const failureMocks = vi.hoisted(() => ({
  recordTranscriptionFailure: vi.fn(async () => {}),
  clearTranscriptionFailure: vi.fn(async () => {}),
}));

vi.mock("~/session/transcription-failure", () => failureMocks);

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: useTabsMock,
}));

vi.mock("~/stt/queries", () => ({
  createTranscript: createTranscriptMock,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useUploadFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sttConnection.value = { provider: "openai", model: "whisper-1" };
    beginAudioUploadMock.mockResolvedValue({ status: "ok", data: "upload-1" });
    appendAudioUploadMock.mockResolvedValue({ status: "ok", data: null });
    discardAudioUploadMock.mockResolvedValue({ status: "ok", data: null });

    audioImportMock.mockResolvedValue({
      status: "ok",
      data: "/vault/sessions/session-1/audio.wav",
    });
    audioImportListenMock.mockResolvedValue(vi.fn());
    audioSourceMetadataMock.mockResolvedValue({
      status: "ok",
      data: {
        createdAt: "2026-03-26T12:00:00.000Z",
        modifiedAt: null,
        durationMs: 30_000,
      },
    });
    downloadDirMock.mockResolvedValue("/downloads");
    homeDirMock.mockResolvedValue("/home/user");
    selectFileMock.mockResolvedValue("/tmp/replacement.wav");
    runBatchMock.mockResolvedValue(undefined);
    createTranscriptMock.mockResolvedValue(undefined);
    enhanceMock.mockResolvedValue({ type: "started", noteId: "note-1" });
    queueAutoEnhanceIfSummaryEmptyMock.mockResolvedValue({ type: "queued" });
    useSessionMock.mockReturnValue({
      id: "session-1",
      user_id: "user-1",
      raw_md: "",
    });
    updateSessionMock.mockResolvedValue(undefined);
    useTabsMock.mockImplementation((selector) =>
      selector({
        tabs: [],
        updateSessionTabState: updateSessionTabStateMock,
      }),
    );
    Object.assign(useTabsMock, {
      getState: () => ({
        tabs: [],
        updateSessionTabState: updateSessionTabStateMock,
      }),
    });
  });

  test("infers the session date for an ordinary audio upload", async () => {
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.uploadAudio();
    });

    await waitFor(() => {
      expect(updateSessionMock).toHaveBeenCalledWith({
        created_at: "2026-03-26T11:59:30.000Z",
      });
    });
    expect(audioSourceMetadataMock).toHaveBeenCalledWith(
      "/tmp/replacement.wav",
    );
    // Issue 526 : la capsule suit l'import avec la durée de l'audio.
    expect(handleImportStartedMock).toHaveBeenCalledWith("session-1", 30);
    await waitFor(() =>
      expect(handleImportEndedMock).toHaveBeenCalledWith("session-1"),
    );
  });

  test("imports pathless dropped audio from memory without touching the disk", async () => {
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });
    const file = new File([new Uint8Array([1, 2, 3])], "drop.wav", {
      type: "audio/wav",
      lastModified: 1_700_000_000_000,
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    });

    act(() => {
      result.current.processAudioFile(file);
    });

    await waitFor(() => expect(runBatchMock).toHaveBeenCalled());
    expect(audioImportMock).not.toHaveBeenCalled();
    expect(runBatchMock).toHaveBeenCalledWith("", {
      allowRealtimeStream: true,
      promotion: { scope: "whole_session" },
      audio: { data_base64: "AQID", file_name: "drop.wav" },
    });
    expect(handleBatchFailedMock).not.toHaveBeenCalled();
  });

  test("streams a large pathless dropped file into memory by chunks", async () => {
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });
    const size = 4 * 1024 * 1024 + 3;
    const arrayBuffer = vi.fn();
    const file = {
      name: "archive.mp4",
      type: "video/mp4",
      size,
      lastModified: 1_700_000_000_000,
      arrayBuffer,
      slice: (start: number, end: number) => ({
        arrayBuffer: () =>
          Promise.resolve(new ArrayBuffer(Math.min(end, size) - start)),
      }),
    } as unknown as File;

    act(() => result.current.processAudioFile(file));

    await waitFor(() => expect(runBatchMock).toHaveBeenCalled());
    expect(beginAudioUploadMock).toHaveBeenCalledWith("archive.mp4", size);
    expect(appendAudioUploadMock).toHaveBeenCalledTimes(2);
    expect(appendAudioUploadMock.mock.calls[1]).toEqual(["upload-1", "AAAA"]);
    // Jamais le fichier entier en mémoire de la webview, jamais de chemin.
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(audioImportMock).not.toHaveBeenCalled();
    expect(runBatchMock).toHaveBeenCalledWith("", {
      allowRealtimeStream: true,
      promotion: { scope: "whole_session" },
      audioUploadId: "upload-1",
    });
    expect(updateBatchProgressMock).toHaveBeenLastCalledWith("session-1", 1);
    expect(handleBatchFailedMock).not.toHaveBeenCalled();
  });

  test("discards the in-memory upload and says so when streaming fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    appendAudioUploadMock.mockResolvedValueOnce({
      status: "error",
      error: "audio_upload_size_mismatch",
    });
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });
    const size = 4 * 1024 * 1024 + 3;
    const file = {
      name: "archive.mp4",
      type: "video/mp4",
      size,
      slice: (start: number, end: number) => ({
        arrayBuffer: () =>
          Promise.resolve(new ArrayBuffer(Math.min(end, size) - start)),
      }),
    } as unknown as File;

    act(() => result.current.processAudioFile(file));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(discardAudioUploadMock).toHaveBeenCalledWith("upload-1");
    expect(runBatchMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Audio import failed",
      expect.objectContaining({
        description: "Syntheo couldn't read this file.",
      }),
    );
    consoleError.mockRestore();
  });

  test("lets a live-only model choose a file to stream in real time", async () => {
    sttConnection.value = {
      provider: "nvidia",
      model: "nemotron-3.5-asr-streaming-0.6b",
    };
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });

    act(() => result.current.uploadAudio());

    await waitFor(() => expect(selectFileMock).toHaveBeenCalled());
    expect(toastWarningMock).not.toHaveBeenCalled();
  });

  test("opens the picker in the home folder without a Downloads folder", async () => {
    downloadDirMock.mockRejectedValue(new Error("unknown path"));
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });

    act(() => result.current.uploadAudio());

    await waitFor(() =>
      expect(selectFileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Upload audio",
          defaultPath: "/home/user",
        }),
      ),
    );
  });

  test("explains a picker that fails to open", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    selectFileMock.mockRejectedValue(new Error("portal unavailable"));
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });

    act(() => result.current.uploadAudio());

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Audio import failed",
        expect.objectContaining({ description: "portal unavailable" }),
      ),
    );
    consoleError.mockRestore();
  });

  test("refuses a model that can't transcribe a file before choosing one", () => {
    sttConnection.value = { provider: "unknown", model: "unknown-model" };
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });

    act(() => result.current.uploadAudio());

    expect(selectFileMock).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalledWith(
      "Can't import this audio",
      expect.objectContaining({
        description:
          "This model can't transcribe a file. Choose another transcription model.",
        action: expect.objectContaining({ label: "Transcription settings" }),
      }),
    );
  });

  test("imports a dropped file through the real-time stream with a live-only model", async () => {
    sttConnection.value = {
      provider: "nvidia",
      model: "nemotron-3.5-asr-streaming-0.6b",
    };
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });
    const file = new File([new Uint8Array([1, 2, 3])], "drop.wav", {
      type: "audio/wav",
      lastModified: 1_700_000_000_000,
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    });

    act(() => result.current.processAudioFile(file));

    await waitFor(() => expect(runBatchMock).toHaveBeenCalled());
    expect(toastWarningMock).not.toHaveBeenCalled();
    expect(runBatchMock).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ allowRealtimeStream: true }),
    );
    expect(result.current.audioImportAvailability).toEqual({
      status: "ready",
      route: "realtime",
    });
    await waitFor(() =>
      expect(queueAutoEnhanceIfSummaryEmptyMock).toHaveBeenCalledWith(
        "session-1",
      ),
    );
  });

  test("refuses a dropped file when the model can transcribe neither by batch nor live", async () => {
    sttConnection.value = {
      provider: "unknown",
      model: "unknown-model",
    };
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });
    const file = new File([new Uint8Array([1, 2, 3])], "drop.wav", {
      type: "audio/wav",
      lastModified: 1_700_000_000_000,
    });

    act(() => result.current.processAudioFile(file));
    await act(async () => {});

    expect(toastWarningMock).toHaveBeenCalledTimes(1);
    expect(updateSessionMock).not.toHaveBeenCalled();
    expect(handleBatchStartedMock).not.toHaveBeenCalled();
    expect(audioImportMock).not.toHaveBeenCalled();
    expect(runBatchMock).not.toHaveBeenCalled();
    expect(result.current.audioImportAvailability).toEqual({
      status: "unsupported",
    });
  });

  test("shows an import error instead of failing silently", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    runBatchMock.mockRejectedValueOnce(
      new Error("whisper-1 is not available for batch transcription."),
    );
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });

    act(() => result.current.uploadAudio());

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Audio import failed",
      expect.objectContaining({
        description: "whisper-1 is not available for batch transcription.",
      }),
    );
    expect(handleBatchFailedMock).toHaveBeenCalledWith(
      "session-1",
      "whisper-1 is not available for batch transcription.",
    );
    // Issue 559 : l'échec est gardé dans la note, et le nouvel import avait
    // d'abord effacé l'avis précédent.
    expect(failureMocks.clearTranscriptionFailure).toHaveBeenCalledWith(
      "session-1",
    );
    expect(failureMocks.recordTranscriptionFailure).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        message: "whisper-1 is not available for batch transcription.",
      }),
    );
    expect(
      failureMocks.clearTranscriptionFailure.mock.invocationCallOrder[0],
    ).toBeLessThan(
      failureMocks.recordTranscriptionFailure.mock.invocationCallOrder[0]!,
    );
    consoleError.mockRestore();
  });

  test("validates actual audio bytes before expanding them for IPC", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });
    const file = {
      name: "drop.wav",
      type: "audio/wav",
      size: 0,
      arrayBuffer: vi
        .fn()
        .mockResolvedValue(new ArrayBuffer(4 * 1024 * 1024 + 1)),
    } as unknown as File;

    act(() => result.current.processAudioFile(file));

    await waitFor(() => {
      expect(handleBatchFailedMock).toHaveBeenCalledWith(
        "session-1",
        "Audio files without a native path must be smaller than 4 MB",
      );
    });
    expect(runBatchMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test.each([
    { filename: "drop.webm", mime: "" },
    { filename: "drop.aac", mime: "" },
    { filename: "Brian Shin.qta", mime: "audio/quicktime" },
  ])(
    "imports pathless or pasted audio $filename from memory",
    async ({ filename, mime }) => {
      const { result } = renderHook(() => useUploadFile("session-1"), {
        wrapper: createWrapper(),
      });
      const file = new File([new Uint8Array([1, 2, 3])], filename, {
        type: mime,
        lastModified: 1_700_000_000_000,
      });
      Object.defineProperty(file, "arrayBuffer", {
        value: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      });

      expect(isAudioUploadFile(file)).toBe(true);

      act(() => {
        result.current.processAudioFile(file);
      });

      await waitFor(() => {
        expect(runBatchMock).toHaveBeenCalled();
      });
      expect(runBatchMock).toHaveBeenCalledWith("", {
        allowRealtimeStream: true,
        promotion: { scope: "whole_session" },
        audio: { data_base64: "AQID", file_name: filename },
      });
    },
  );

  test("persists imported subtitles before enhancing", async () => {
    let resolveWrite: (() => void) | undefined;
    createTranscriptMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    parseSubtitleMock.mockResolvedValue({
      status: "ok",
      data: {
        tokens: [{ text: "Hello", start_time: 0, end_time: 500 }],
      },
    });
    const { result } = renderHook(() => useUploadFile("session-1"), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.processFile("/tmp/session.vtt", "transcript");
    });

    await waitFor(() => {
      expect(createTranscriptMock).toHaveBeenCalledTimes(1);
    });
    expect(enhanceMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveWrite?.();
    });
    await waitFor(() => {
      expect(enhanceMock).toHaveBeenCalledWith("session-1");
    });
    expect(createTranscriptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        ownerUserId: "user-1",
        source: "subtitle_import",
        words: [
          expect.objectContaining({
            text: "Hello",
            start_ms: 0,
            end_ms: 500,
          }),
        ],
      }),
    );
    expect(createTranscriptMock.mock.invocationCallOrder[0]).toBeLessThan(
      enhanceMock.mock.invocationCallOrder[0],
    );
  });
});
