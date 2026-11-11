import { beforeEach, describe, expect, test, vi } from "vitest";

const dominantLanguage = vi.hoisted(() => vi.fn());
vi.mock("@syntheo/plugin-template", () => ({
  commands: { dominantLanguage },
}));
vi.mock("~/session/content-queries", () => ({
  loadSessionContentSnapshot: vi.fn(),
}));

import { i18n } from "@lingui/core";

import { titleTransform } from "./title-transform";

// Issue 570 : le titre suit la même règle de langue que la synthèse.
describe("titleTransform language", () => {
  beforeEach(() => {
    dominantLanguage.mockReset();
    i18n.activate("fr");
  });

  test("automatic detection titles a French summary in French", async () => {
    dominantLanguage.mockResolvedValue({ status: "ok", data: "fr" });

    const args = await titleTransform.transformArgs(
      { sessionId: "s1", enhancedNote: "# Points clés\n- Budget validé" },
      { ai_language: "auto" } as never,
    );

    expect(args.language).toBe("fr");
    expect(dominantLanguage.mock.calls[0]![0]).toMatchObject({
      texts: ["# Points clés\n- Budget validé"],
    });
  });

  test("an undetectable summary falls back on the interface language", async () => {
    dominantLanguage.mockResolvedValue({ status: "ok", data: null });

    const args = await titleTransform.transformArgs(
      { sessionId: "s1", enhancedNote: "42" },
      { ai_language: "auto" } as never,
    );

    expect(args.language).toBe("fr");
  });
});
