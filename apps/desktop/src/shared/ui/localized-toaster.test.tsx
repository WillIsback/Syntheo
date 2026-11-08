/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppToaster,
  dismissAppToasts,
  showAppToast,
} from "@syntheo/ui/components/ui/app-toast";

import { LocalizedToaster } from "./localized-toaster";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

// Décompte et bouton du pied, séparés par une espace.
function footerText(): string {
  const footer = screen.getByRole("button", {
    name: /fermeture automatique|auto-dismiss/,
  });
  return Array.from(footer.children, (child) => child.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

afterEach(() => {
  dismissAppToasts();
  cleanup();
  vi.useRealTimers();
});

describe("toast traduit en français", () => {
  beforeEach(() => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
  });

  afterEach(() => {
    i18n.activate("en");
  });

  function renderFrench() {
    render(
      <I18nProvider i18n={i18n}>
        <LocalizedToaster theme="light" />
      </I18nProvider>,
    );
  }

  it("affiche les contrôles et le décompte au pluriel", () => {
    vi.useFakeTimers();
    renderFrench();
    act(() => {
      showAppToast({
        message: "Rappelez aux participants que la réunion est transcrite.",
        durationMs: 3_000,
      });
    });

    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
    expect(footerText()).toBe("Fermeture dans 3 secondes Mettre en pause");
    expect(
      screen.getByRole("button", { name: "Réduire la notification" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mettre en pause la fermeture automatique",
      }),
    );
    expect(footerText()).toBe("Minuteur en pause 3 secondes Reprendre");
    expect(
      screen.getByRole("button", {
        name: "Reprendre la fermeture automatique",
      }),
    ).toBeTruthy();
  });

  it("accorde « seconde » au singulier", async () => {
    vi.useFakeTimers();
    renderFrench();
    act(() => {
      showAppToast({ message: "Note enregistrée", durationMs: 1_000 });
    });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(footerText()).toBe("Fermeture dans 1 seconde Mettre en pause");
  });
});

describe("toast sans libellés fournis", () => {
  it("garde les valeurs anglaises par défaut", () => {
    vi.useFakeTimers();
    render(<AppToaster theme="light" />);
    act(() => {
      showAppToast({ message: "Sync complete", durationMs: 2_000 });
    });

    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    expect(footerText()).toBe("Closing in 2 seconds Pause");

    fireEvent.click(screen.getByRole("button", { name: "Pause auto-dismiss" }));
    expect(footerText()).toBe("Timer paused 2 seconds Resume");
  });

  it("complète des libellés partiels avec l'anglais", () => {
    vi.useFakeTimers();
    render(<AppToaster theme="light" labels={{ dismiss: "Fermer" }} />);
    act(() => {
      showAppToast({ message: "Sync complete", durationMs: 1_000 });
    });

    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
    expect(footerText()).toBe("Closing in 1 second Pause");
  });
});
