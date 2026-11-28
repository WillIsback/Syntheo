import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatGroupRecord } from "~/chat/store/queries";
import { messages as englishMessages } from "~/i18n/locales/en/messages";
import { messages as frenchMessages } from "~/i18n/locales/fr/messages";

// Issue 802 : l'historique des discussions affichait « about 3 hours ago »
// dans une interface en français. Vrai Lingui, vrais catalogues.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

const NOW = new Date("2026-11-20T10:00:00.000Z");

const mocks = vi.hoisted(() => ({
  useRecentChatGroups: vi.fn((): ChatGroupRecord[] => []),
}));

// Menu déroulant affiché ouvert : seule la liste des discussions compte ici.
vi.mock("@syntheo/ui/components/ui/dropdown-menu", () => ({
  appFloatingMenuPanelClassName: "",
  AppFloatingPanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

// Frontière base de données : la ligne lue est simulée, pas sa mise en forme.
vi.mock("~/chat/store/queries", () => ({
  useRecentChatGroups: mocks.useRecentChatGroups,
}));

import { ChatToolbarControls } from "./toolbar-controls";

function renderInLocale(locale: "en" | "fr") {
  i18n.load(locale, locale === "fr" ? frenchMessages : englishMessages);
  i18n.activate(locale);
  render(
    <I18nProvider i18n={i18n}>
      <ChatToolbarControls
        chatScope="general"
        currentChatGroupId={undefined}
        onNewChat={vi.fn()}
        onOpenRightPanel={vi.fn()}
        onSelectChat={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("ChatToolbarControls relative time", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mocks.useRecentChatGroups.mockReturnValue([
      {
        id: "chat-1",
        ownerUserId: "user-1",
        title: "Préparation de l'atelier",
        createdAt: new Date(NOW.getTime() - 3 * 3_600_000).toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    i18n.activate("en");
  });

  it("follows a French interface", () => {
    renderInLocale("fr");
    expect(screen.getByText("il y a 3 heures")).toBeTruthy();
    expect(screen.queryByText(/ago/)).toBeNull();
  });

  it("follows an English interface", () => {
    renderInLocale("en");
    expect(screen.getByText("3 hours ago")).toBeTruthy();
  });
});
