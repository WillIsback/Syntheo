import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type CapsuleImportProgress, ImportProgress } from "./import-progress";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

// Vraie Lingui (la configuration de test la simule) : catalogue français et
// locale active pour la virgule décimale.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

function renderProgress(progress: CapsuleImportProgress) {
  return render(
    <I18nProvider i18n={i18n}>
      <ImportProgress progress={progress} />
    </I18nProvider>,
  );
}

// Issue 526 : état « Import » de la capsule, en français.
describe("ImportProgress", () => {
  beforeEach(() => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
  });

  afterEach(() => {
    cleanup();
    i18n.activate("en");
  });

  it("shows the bar, the percentage, the remaining time and the speed", () => {
    renderProgress({
      fraction: 0.22,
      estimate: { remainingSeconds: 540, speedFactor: 2.1 },
      onStop: vi.fn(),
    });

    expect(screen.getByRole("status").textContent).toBe("Import");
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("22");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(screen.getByText(/^22\s%$/)).toBeTruthy();
    expect(
      screen.getByText("reste ~9 min · ×2,1", { normalizer: (s) => s }),
    ).toBeTruthy();
  });

  it("says less than a minute and leaves out an unknown speed", () => {
    renderProgress({
      fraction: 0.9,
      estimate: { remainingSeconds: 40, speedFactor: null },
      onStop: vi.fn(),
    });

    expect(screen.getByText("reste < 1 min")).toBeTruthy();
  });

  it("waits for a reliable estimate", () => {
    renderProgress({ fraction: 0.01, estimate: null, onStop: vi.fn() });

    expect(screen.getByText("Estimation…")).toBeTruthy();
  });

  it("stops the transcription with Arrêter", () => {
    const onStop = vi.fn();
    renderProgress({ fraction: 0.5, estimate: null, onStop });

    fireEvent.click(screen.getByRole("button", { name: "Arrêter" }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("disables Arrêter while the file is being copied", () => {
    renderProgress({ fraction: 0.5, estimate: null });

    expect(
      (screen.getByRole("button", { name: "Arrêter" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
