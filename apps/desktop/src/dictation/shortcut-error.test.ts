import { describe, expect, it } from "vitest";

import { describeDictationError } from "./shortcut-error";

// Passe QA 0.8.1-1 : le refus du portail Global Shortcuts arrivait brut, en
// anglais technique, dans un toast.
describe("describeDictationError", () => {
  it("explains a desktop without the Global Shortcuts portal", () => {
    const shown = describeDictationError(
      "This Wayland desktop does not provide the Global Shortcuts portal: org.freedesktop.portal.Error",
    );
    expect(shown).toBe(
      "This desktop does not offer global shortcuts to apps (Global Shortcuts portal): dictation by shortcut is not available in this session.",
    );
    expect(shown).not.toContain("org.freedesktop");
  });

  it("keeps the key name of an unsupported Wayland key", () => {
    expect(
      describeDictationError(
        new Error(
          "The F13 key is not supported for Wayland dictation shortcuts. Choose another key.",
        ),
      ),
    ).toBe(
      "The F13 key cannot be used for dictation shortcuts on Wayland. Choose another key.",
    );
  });

  it("falls back to the service error description", () => {
    expect(describeDictationError(new Error("connection refused"))).toContain(
      "could not be reached",
    );
  });
});
