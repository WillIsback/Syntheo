import { describe, expect, test, vi } from "vitest";

import {
  canUseTranscriptionTarget,
  getFileTranscriptionRoute,
  selectTranscriptionProvider,
  storedTranscriptionProvider,
} from "./transcription-route";

const { isSupportedLanguagesBatchMock, isSupportedLanguagesLiveMock } =
  vi.hoisted(() => ({
    isSupportedLanguagesBatchMock: vi.fn(async () => true),
    isSupportedLanguagesLiveMock: vi.fn(async () => true),
  }));

vi.mock("./capabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capabilities")>()),
  isSupportedLanguagesBatch: isSupportedLanguagesBatchMock,
  isSupportedLanguagesLive: isSupportedLanguagesLiveMock,
}));

const NVIDIA_MODEL = "nemotron-3.5-asr-streaming-0.6b";

describe("getFileTranscriptionRoute", () => {
  test.each([
    [{ provider: "openai", model: "whisper-1" }, "batch"],
    [{ provider: "openai", model: "mistralai/Voxtral-Mini-3B-2507" }, "batch"],
    [{ provider: "nvidia", model: NVIDIA_MODEL }, "realtime"],
    [{ provider: "unknown", model: "unknown" }, null],
    [null, null],
  ] as const)("routes %o to %s", (conn, expected) => {
    expect(getFileTranscriptionRoute(conn)).toBe(expected);
  });
});

describe("selectTranscriptionProvider", () => {
  test("prefers batch, and streams only for callers that allow it", () => {
    expect(selectTranscriptionProvider("openai", "whisper-1", true)).toBe(
      "openai",
    );
    expect(selectTranscriptionProvider("nvidia", NVIDIA_MODEL, true)).toBe(
      "realtime",
    );
    expect(selectTranscriptionProvider("nvidia", NVIDIA_MODEL, false)).toBe(
      null,
    );
  });
});

describe("canUseTranscriptionTarget", () => {
  test("checks live language support for the real-time stream", async () => {
    await canUseTranscriptionTarget("realtime", "nvidia", NVIDIA_MODEL, ["fr"]);
    expect(isSupportedLanguagesLiveMock).toHaveBeenCalledWith(
      "nvidia",
      NVIDIA_MODEL,
      ["fr"],
    );

    await canUseTranscriptionTarget("openai", "openai", "whisper-1", ["fr"]);
    expect(isSupportedLanguagesBatchMock).toHaveBeenCalledWith(
      "openai",
      "whisper-1",
      ["fr"],
    );
  });
});

describe("storedTranscriptionProvider", () => {
  test("labels a streamed file with the real provider", () => {
    expect(storedTranscriptionProvider("realtime", "nvidia")).toBe("nvidia");
    expect(storedTranscriptionProvider("openai", "openai")).toBe("openai");
    expect(storedTranscriptionProvider("realtime", null)).toBe("realtime");
  });
});
