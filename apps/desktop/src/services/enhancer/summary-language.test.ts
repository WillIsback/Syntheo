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

  test("automatic detection lets the summary follow the transcript", async () => {
    await expect(
      resolveSummaryLanguage(
        { ai_language: "auto", spoken_languages: '["en"]' } as never,
        ["Bonjour à tous"],
      ),
    ).resolves.toBeNull();
    expect(dominantLanguage).not.toHaveBeenCalled();
  });

  test("a fixed main language without other languages is used as is", async () => {
    await expect(
      resolveSummaryLanguage(
        { ai_language: "fr", spoken_languages: "[]" } as never,
        ["Bonjour"],
      ),
    ).resolves.toBe("fr");
  });
});
