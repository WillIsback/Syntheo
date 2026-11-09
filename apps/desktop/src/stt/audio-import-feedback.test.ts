import { describe, expect, it, vi } from "vitest";

import {
  describeAudioImportError,
  describeAudioImportUnavailable,
  getAudioImportAvailability,
  getBatchAvailability,
} from "./audio-import-feedback";
import { AudioUploadTooLargeError } from "./audio-upload-stream";

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
      model: "cache-aware-parakeet-rnnt-multi-asr-streaming-sortformer",
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
        model: "cache-aware-parakeet-rnnt-multi-asr-streaming-sortformer",
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
