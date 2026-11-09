import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { HomeFolder } from "./active-folders";
import { FolderCards } from "./folder-cards";

import { messages as englishMessages } from "~/i18n/locales/en/messages";
import { DEFAULT_FOLDER_ICON } from "~/session/folder-icon";

// Vraie Lingui (la configuration de test la simule) : pluriels compilés.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

function folder(overrides: Partial<HomeFolder>): HomeFolder {
  return {
    path: "Atlas",
    name: "Atlas",
    icon: DEFAULT_FOLDER_ICON,
    meetingCount: 1,
    lastMeetingAt: "2026-11-02T09:00:00",
    thread: null,
    ...overrides,
  };
}

const FOLDERS: HomeFolder[] = [
  folder({
    path: "Produit/Atlas",
    name: "Atlas",
    meetingCount: 17,
    thread: { openPoints: 3, tasks: 2 },
  }),
  folder({
    path: "Comité",
    name: "Comité",
    meetingCount: 9,
    thread: { openPoints: 1, tasks: 0 },
  }),
  folder({ path: "Recrutement", name: "Recrutement", meetingCount: 1 }),
  folder({ path: "Calme", name: "Calme", thread: { openPoints: 0, tasks: 0 } }),
];

function renderCards(folders: readonly HomeFolder[] = FOLDERS) {
  const props = { onOpenFolder: vi.fn(), onOpenAllFolders: vi.fn() };
  const view = render(
    <I18nProvider i18n={i18n}>
      <FolderCards folders={folders} {...props} />
    </I18nProvider>,
  );
  return { ...props, ...view };
}

function card(path: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-home-folder="${path}"]`,
  );
  if (!element) throw new Error(`card ${path} missing`);
  return element;
}

describe("FolderCards", () => {
  beforeAll(() => {
    // Catalogue anglais compilé : les pluriels s'affichent comme dans l'app.
    i18n.load("en", englishMessages);
    i18n.activate("en");
  });

  afterEach(() => {
    cleanup();
  });

  it("est masqué sans dossier", () => {
    const { container } = renderCards([]);
    expect(container.innerHTML).toBe("");
  });

  it("montre nom, nombre de réunions et dernière date", () => {
    renderCards();
    expect(screen.getByRole("heading", { name: "Your folders" })).toBeTruthy();
    const atlas = card("Produit/Atlas");
    expect(atlas.textContent).toContain("Atlas");
    expect(atlas.textContent).toContain("17 meetings · last ");
    expect(atlas.getAttribute("title")).toBe("Produit/Atlas");
    expect(card("Recrutement").textContent).toContain("1 meeting · last ");
  });

  it("résume le fil rouge, ou signale qu'il n'existe pas encore", () => {
    renderCards();
    const line = (path: string) =>
      card(path).querySelector("[data-folder-thread]");

    expect(line("Produit/Atlas")?.textContent).toBe("3 open points · 2 tasks");
    expect(line("Comité")?.textContent).toBe("1 open point");
    expect(line("Calme")?.textContent).toBe("Nothing pending");
    const none = line("Recrutement");
    expect(none?.getAttribute("data-folder-thread")).toBe("none");
    expect(none?.textContent).toBe("Project thread not created yet");
    expect(none?.className).toContain("text-faint");
  });

  it("une carte ouvre son dossier, le lien ouvre tous les dossiers", () => {
    const { onOpenFolder, onOpenAllFolders } = renderCards();

    fireEvent.click(card("Comité"));
    expect(onOpenFolder).toHaveBeenCalledWith("Comité");

    fireEvent.click(screen.getByRole("button", { name: "All folders" }));
    expect(onOpenAllFolders).toHaveBeenCalledTimes(1);
  });

  it("reste sobre : filet `border`, survol `accent`, sans fond plein", () => {
    renderCards();
    const atlas = card("Produit/Atlas");
    expect(atlas.className).toContain("border-border");
    expect(atlas.className).toContain("hover:bg-accent");
    expect(document.querySelector(".bg-card, .shadow")).toBeNull();
  });
});
