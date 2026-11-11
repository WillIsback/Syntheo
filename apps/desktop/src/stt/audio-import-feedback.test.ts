import { describe, expect, it, vi } from "vitest";

import {
  AUDIO_IMPORT_FAILED_TOAST_DURATION_MS,
  describeAudioImportError,
  describeAudioImportUnavailable,
  getAudioImportAvailability,
  getBatchAvailability,
  notifyAudioImportFailed,
} from "./audio-import-feedback";
import { AudioUploadTooLargeError } from "./audio-upload-stream";

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { error: toastErrorMock, warning: vi.fn() },
}));

vi.mock("./useSTTConnection", () => ({
  useSTTConnection: () => ({ conn: null }),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: vi.fn() }) },
}));

describe("getAudioImportAvailability", () => {
  it("imports by batch with a batch-capable OpenAI-protocol model", () => {
    expect(
      getAudioImportAvailability({ provider: "openai", model: "whisper-1" }),
    ).toEqual({ status: "ready", route: "batch" });
  });

  it("imports through the real-time stream with a live-only NVIDIA model", () => {
    const availability = getAudioImportAvailability({
      provider: "nvidia",
      model: "nemotron-3.5-asr-streaming-0.6b",
    });

    expect(availability).toEqual({ status: "ready", route: "realtime" });
    expect(describeAudioImportUnavailable(availability)).toBeNull();
  });

  it("refuses a model with neither batch nor real-time transcription", () => {
    const availability = getAudioImportAvailability({
      provider: "unknown",
      model: "unknown-model",
    });

    expect(availability).toEqual({ status: "unsupported" });
    expect(describeAudioImportUnavailable(availability)).toBe(
      "This model can't transcribe a file. Choose another transcription model.",
    );
  });

  it("refuses when no transcription service is set up", () => {
    expect(getAudioImportAvailability(null)).toEqual({
      status: "no_provider",
    });
  });
});

describe("getBatchAvailability", () => {
  it("keeps batch-only features off with a live-only model", () => {
    expect(
      getBatchAvailability({
        provider: "nvidia",
        model: "nemotron-3.5-asr-streaming-0.6b",
      }),
    ).toEqual({ status: "live_only" });
    expect(
      getBatchAvailability({ provider: "openai", model: "whisper-1" }),
    ).toEqual({ status: "ready" });
    expect(getBatchAvailability(null)).toEqual({ status: "no_provider" });
  });
});

describe("describeAudioImportError", () => {
  it("explains a file over the in-memory limit", () => {
    expect(describeAudioImportError(new AudioUploadTooLargeError())).toBe(
      "This file is too large to import (2 GB maximum).",
    );
  });

  it("hides internal upload codes", () => {
    expect(
      describeAudioImportError(new Error("audio_upload_size_mismatch")),
    ).toBe("Syntheo couldn't read this file.");
  });
});

describe("notifyAudioImportFailed", () => {
  it("closes on its own after about 12 seconds and keeps its actions", () => {
    toastErrorMock.mockClear();

    notifyAudioImportFailed(new Error("disk full"));

    expect(AUDIO_IMPORT_FAILED_TOAST_DURATION_MS).toBe(12_000);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Audio import failed",
      expect.objectContaining({
        id: "audio-import-failed",
        description: "disk full",
        duration: 12_000,
        keepDuration: true,
        action: expect.objectContaining({ label: "Transcription settings" }),
      }),
    );
    const options = toastErrorMock.mock.calls[0][1];
    expect(options.closeButton).not.toBe(false);
    expect(options.dismissible).not.toBe(false);
  });
});
