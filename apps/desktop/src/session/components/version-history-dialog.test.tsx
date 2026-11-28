import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messages as englishMessages } from "~/i18n/locales/en/messages";
import { messages as frenchMessages } from "~/i18n/locales/fr/messages";

// Issue 802 : l'historique affichait « 7 minutes ago » dans une interface en
// français. Vrai Lingui, vrais catalogues.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

const NOW = new Date("2026-11-20T10:00:00.000Z");

// Frontière base de données : seules les lignes lues sont simulées, la mise
// en forme de la date reste celle du composant.
vi.mock("~/session/queries", () => ({
  previewFromBody: (body: string) => body,
  restoreSessionDocumentBody: vi.fn(),
  useSessionConflicts: () => [],
  useSessionDocumentVersions: () => [
    {
      id: "version-1",
      body: "Compte rendu de la réunion d'équipe",
      bodyFormat: "markdown",
      source: "local",
      createdAt: new Date(NOW.getTime() - 7 * 60_000).toISOString(),
    },
  ],
}));

import { VersionHistoryDialog } from "./version-history-dialog";

function renderDialog(locale: "en" | "fr") {
  i18n.load(locale, locale === "fr" ? frenchMessages : englishMessages);
  i18n.activate(locale);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <VersionHistoryDialog
          sessionId="session-1"
          open
          onOpenChange={vi.fn()}
        />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("VersionHistoryDialog relative time (issue 802)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    i18n.activate("en");
  });

  it("shows how long ago a version was saved in French", () => {
    renderDialog("fr");
    expect(screen.getByText("il y a 7 minutes")).toBeTruthy();
    expect(screen.queryByText(/ago/)).toBeNull();
  });

  it("shows how long ago a version was saved in English", () => {
    renderDialog("en");
    expect(screen.getByText("7 minutes ago")).toBeTruthy();
  });
});
