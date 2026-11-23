import { describe, expect, it } from "vitest";

import { needsConfigBanner } from "./notifications";

// Issue 707 : synthèse coupée par l'administration (intelligence_disabled),
// le modèle de langage absent n'entre pas dans le compte du badge.
describe("needsConfigBanner", () => {
  const configured = {
    needsSttProvider: false,
    onDeviceNotReady: false,
    hasLLMConfigured: true,
    llmManagedOff: false,
  };

  it("counts a missing language model", () => {
    expect(needsConfigBanner({ ...configured, hasLLMConfigured: false })).toBe(
      true,
    );
  });

  it("ignores a missing language model when synthesis is managed off", () => {
    expect(
      needsConfigBanner({
        ...configured,
        hasLLMConfigured: false,
        llmManagedOff: true,
      }),
    ).toBe(false);
  });

  it("still counts a missing transcription provider", () => {
    expect(
      needsConfigBanner({
        ...configured,
        needsSttProvider: true,
        llmManagedOff: true,
      }),
    ).toBe(true);
  });
});
