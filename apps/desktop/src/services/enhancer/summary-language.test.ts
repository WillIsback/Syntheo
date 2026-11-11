import { beforeEach, describe, expect, test, vi } from "vitest";

const dominantLanguage = vi.hoisted(() => vi.fn());
vi.mock("@syntheo/plugin-template", () => ({
  commands: { dominantLanguage },
}));

import { resolveSummaryLanguage } from "./summary-language";

describe("resolveSummaryLanguage", () => {
  beforeEach(() => {
    dominantLanguage.mockReset();
  });

  // Issue 570 : en détection automatique, la synthèse sortait en anglais.
  test("automatic detection follows the dominant language of the transcript", async () => {
    dominantLanguage.mockResolvedValue({ status: "ok", data: "fr" });

    await expect(
      resolveSummaryLanguage(
        { ai_language: "auto", spoken_languages: '["en"]' } as never,
        ["Bonjour à tous"],
        "en",
      ),
    ).resolves.toBe("fr");

    const { texts, candidates } = dominantLanguage.mock.calls[0]![0] as {
      texts: string[];
      candidates: string[];
    };
    expect(texts).toEqual(["Bonjour à tous"]);
    // Langue de l'interface en tête, puis toutes celles de l'app, sans doublon.
    expect(candidates[0]).toBe("en");
    expect(candidates).toContain("fr");
    expect(candidates).toContain("de");
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  test("an empty transcript falls back on the interface language", async () => {
    dominantLanguage.mockResolvedValue({ status: "ok", data: null });

    await expect(
      resolveSummaryLanguage({ ai_language: "auto" } as never, [], "fr"),
    ).resolves.toBe("fr");
  });

  test("a failed detection falls back on the interface language, not English", async () => {
    dominantLanguage.mockResolvedValue({ status: "error", error: "boom" });
    await expect(
      resolveSummaryLanguage({ ai_language: "auto" } as never, ["…"], "fr"),
    ).resolves.toBe("fr");

    dominantLanguage.mockRejectedValue(new Error("ipc"));
    await expect(
      resolveSummaryLanguage({ ai_language: "" } as never, ["…"], "fr"),
    ).resolves.toBe("fr");
  });

  test("a fixed main language without other languages is used as is", async () => {
    await expect(
      resolveSummaryLanguage(
        { ai_language: "fr", spoken_languages: "[]" } as never,
        ["Hello"],
        "en",
      ),
    ).resolves.toBe("fr");
    expect(dominantLanguage).not.toHaveBeenCalled();
  });
});
