import { describe, expect, it } from "vitest";

import {
  getDefaultSttModel,
  normalizeStoredSttSelection,
} from "./model-selection";

describe("normalizeStoredSttSelection", () => {
  it.each(["deepgram", "custom", "soniox", "assemblyai"])(
    "clears_removed_cloud_stt_provider %s",
    (provider) => {
      expect(normalizeStoredSttSelection(provider, "nova-3")).toEqual({
        provider: "",
        model: "",
      });
    },
  );

  it("clears_the_hosted_syntheo_model", () => {
    expect(normalizeStoredSttSelection("syntheo", "cloud")).toEqual({
      provider: "",
      model: "",
    });
  });

  it.each([
    ["soniqo", "soniqo-parakeet-streaming"],
    ["apple_speech", "apple-speech"],
    ["local_file", "local-file"],
    ["syntheo", "soniqo-parakeet-batch"],
    ["syntheo", "am-parakeet-v3"],
  ])("clears_local_stt_selection %s/%s", (provider, model) => {
    expect(normalizeStoredSttSelection(provider, model)).toEqual({
      provider: "",
      model: "",
    });
  });

  it("keeps_on_prem_selection", () => {
    expect(normalizeStoredSttSelection("openai", "whisper-large-v3")).toEqual({
      provider: "openai",
      model: "whisper-large-v3",
    });
  });

  it.each([
    "nemotron-asr-streaming",
    "parakeet-tdt-0.6b-v3",
    "parakeet-tdt-0.6b-v2",
    "cache-aware-parakeet-rnnt-multi-asr-streaming-sortformer",
  ])("migrates_retired_nim_model %s to nemo_speech", (model) => {
    expect(normalizeStoredSttSelection("nvidia", model)).toEqual({
      provider: "nvidia",
      model: "nemotron-3.5-asr-streaming-0.6b",
    });
  });

  it("keeps_a_model_announced_by_nemo_speech", () => {
    expect(
      normalizeStoredSttSelection(
        "nvidia",
        "nemotron-3.5-asr-streaming-0.6b.q8_0",
      ),
    ).toEqual({
      provider: "nvidia",
      model: "nemotron-3.5-asr-streaming-0.6b.q8_0",
    });
  });

  it("defaults_nvidia_to_the_streaming_nemotron_model", () => {
    expect(getDefaultSttModel("nvidia")).toBe(
      "nemotron-3.5-asr-streaming-0.6b",
    );
  });
});
