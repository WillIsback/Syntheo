import { describe, expect, it, vi } from "vitest";

import {
  describeAudioImportError,
  describeAudioImportUnavailable,
  getAudioImportAvailability,
} from "./audio-import-feedback";
import { AudioUploadTooLargeError } from "./audio-upload-stream";

vi.mock("./useSTTConnection", () => ({
  useSTTConnection: () => ({ conn: null }),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: vi.fn() }) },
}));

describe("getAudioImportAvailability", () => {
  it("accepts a batch-capable OpenAI-protocol model", () => {
    expect(
      getAudioImportAvailability({ provider: "openai", model: "whisper-1" }),
    ).toEqual({ status: "ready" });
  });

  it("refuses a live-only NVIDIA streaming model", () => {
    const availability = getAudioImportAvailability({
      provider: "nvidia",
      model: "cache-aware-parakeet-rnnt-multi-asr-streaming-sortformer",
    });

    expect(availability).toEqual({ status: "live_only" });
    expect(describeAudioImportUnavailable(availability)).toBe(
      "This model only transcribes live: importing a file requires a batch transcription model.",
    );
  });

  it("refuses when no transcription service is set up", () => {
    expect(getAudioImportAvailability(null)).toEqual({
      status: "no_provider",
    });
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
