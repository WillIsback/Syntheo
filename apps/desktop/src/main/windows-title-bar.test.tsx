import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn().mockResolvedValue(undefined),
  createNewNote: vi.fn(),
  isFullscreen: vi.fn().mockResolvedValue(false),
  isMaximized: vi.fn().mockResolvedValue(false),
  minimize: vi.fn().mockResolvedValue(undefined),
  onResized: vi.fn().mockResolvedValue(vi.fn()),
  openNew: vi.fn(),
  openNoteDialog: vi.fn(),
  openHelpDialog: vi.fn(),
  openSettingsSearch: vi.fn(),
  exportNoteFromShortcut: vi.fn(),
  openUrl: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  setFullscreen: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  chatMode: "FloatingClosed",
  currentTab: { type: "empty" } as { id?: string; type: string },
  openCurrent: vi.fn(),
  sendEvent: vi.fn(),
  platform: "windows",
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: () => mocks.platform,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: mocks.close,
    isFullscreen: mocks.isFullscreen,
    isMaximized: mocks.isMaximized,
    minimize: mocks.minimize,
    onResized: mocks.onResized,
    setFullscreen: mocks.setFullscreen,
    toggleMaximize: mocks.toggleMaximize,
  }),
}));

vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: mocks.openUrl },
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    chat: { mode: mocks.chatMode, sendEvent: mocks.sendEvent },
  }),
}));

vi.mock("~/shared/useNewNote", () => ({
  useNewNote: () => mocks.createNewNote,
}));

vi.mock("~/shared/open-note-dialog", () => ({
  openNoteDialog: mocks.openNoteDialog,
  openSettingsSearch: mocks.openSettingsSearch,
}));

vi.mock("~/shared/export-shortcut", () => ({
  exportNoteFromShortcut: mocks.exportNoteFromShortcut,
}));

vi.mock("~/shared/help-dialog", () => ({
  openHelpDialog: mocks.openHelpDialog,
}));

vi.mock("./view-navigation", () => ({
  hasViewNavigation: (tab: { type: string } | null) =>
    tab !== null &&
    [
      "settings",
      "calendar",
      "contacts",
      "templates",
      "automations",
      "folders",
    ].includes(tab.type),
}));

vi.mock("~/store/zustand/tabs", () => {
  const getState = () => ({
    canGoBack: false,
    currentTab: mocks.currentTab,
    goBack: vi.fn(),
    openCurrent: mocks.openCurrent,
    openNew: mocks.openNew,
    select: vi.fn(),
    tabs: [],
  });
  const useTabs = Object.assign(
    (selector: (state: ReturnType<typeof getState>) => unknown) =>
      selector(getState()),
    { getState },
  );

  return { uniqueIdfromTab: (tab: { type: string }) => tab.type, useTabs };
});

import { WindowsTitleBar } from "./windows-title-bar";

import { ariaShortcut, formatShortcut } from "~/shared/shortcuts";
import { TITLE_BAR_FIRST_MENU_ATTRIBUTE } from "~/shared/window-shortcuts";

function openMenu(name: string) {
  const trigger = screen.getByRole("menuitem", { name });
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("WindowsTitleBar", () => {
  beforeEach(() => {
    mocks.close.mockClear();
    mocks.createNewNote.mockClear();
    mocks.isFullscreen.mockClear();
    mocks.isMaximized.mockClear();
    mocks.isMaximized.mockResolvedValue(false);
    mocks.minimize.mockClear();
    mocks.onResized.mockClear();
    mocks.openNew.mockClear();
    mocks.openNoteDialog.mockClear();
    mocks.openHelpDialog.mockClear();
    mocks.openSettingsSearch.mockClear();
    mocks.exportNoteFromShortcut.mockClear();
    mocks.openUrl.mockClear();
    mocks.setFullscreen.mockClear();
    mocks.toggleMaximize.mockClear();
    mocks.openCurrent.mockClear();
    mocks.sendEvent.mockClear();
    mocks.chatMode = "FloatingClosed";
    mocks.currentTab = { type: "empty" };
    mocks.platform = "windows";
  });

  afterEach(() => {
    cleanup();
  });

  it("ne propose plus de bascule de barre latérale et garde les contrôles de fenêtre", () => {
    render(<WindowsTitleBar />);

    expect(screen.queryByRole("button", { name: "Hide sidebar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show sidebar" })).toBeNull();
    expect(screen.getByRole("menubar")).toBeTruthy();
    for (const name of ["File", "Edit", "View", "Help"]) {
      expect(screen.getByRole("menuitem", { name })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(mocks.minimize).toHaveBeenCalledOnce();
    expect(mocks.toggleMaximize).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(
      screen
        .getByTestId("windows-title-bar")
        .hasAttribute("data-tauri-drag-region"),
    ).toBe(true);
  });

  describe("raccourcis des menus (issue 372)", () => {
    it("affiche les raccourcis du menu Fichier depuis la table", () => {
      render(<WindowsTitleBar />);
      openMenu("File");

      for (const [name, id] of [
        ["New Note", "newNote"],
        ["Search Notes…", "searchNotes"],
        ["Settings", "settings"],
      ] as const) {
        const item = screen.getByRole("menuitem", {
          name: `${name}${formatShortcut(id)}`,
        });
        expect(item.getAttribute("aria-keyshortcuts")).toBe(ariaShortcut(id));
      }
      expect(formatShortcut("settings")).toBe("Ctrl+,");
    });

    it("le menu Fichier est la cible de F10", () => {
      render(<WindowsTitleBar />);

      expect(
        screen
          .getByRole("menuitem", { name: "File" })
          .hasAttribute(TITLE_BAR_FIRST_MENU_ATTRIBUTE),
      ).toBe(true);
      expect(
        screen
          .getByRole("menuitem", { name: "Edit" })
          .hasAttribute(TITLE_BAR_FIRST_MENU_ATTRIBUTE),
      ).toBe(false);
    });

    it("ouvre l'aide F1 depuis le menu Aide", () => {
      render(<WindowsTitleBar />);
      openMenu("Help");

      fireEvent.click(
        screen.getByRole("menuitem", { name: "Help and shortcutsF1" }),
      );

      expect(mocks.openHelpDialog).toHaveBeenCalledOnce();
    });

    it("bascule le plein écran depuis le menu Afficher (F11)", async () => {
      render(<WindowsTitleBar />);
      openMenu("View");

      fireEvent.click(screen.getByRole("menuitem", { name: "Full ScreenF11" }));

      await vi.waitFor(() =>
        expect(mocks.setFullscreen).toHaveBeenCalledWith(true),
      );
    });
  });

  it("propose « Rechercher un paramètre… » avec Ctrl+Maj+P dans le menu Fichier (issue 373)", async () => {
    render(<WindowsTitleBar />);

    fireEvent.keyDown(screen.getByRole("menuitem", { name: "File" }), {
      key: "Enter",
    });
    const item = await screen.findByRole("menuitem", {
      name: /Search for a Setting…/,
    });
    expect(item.textContent).toContain(formatShortcut("searchSettings"));
    expect(item.getAttribute("aria-keyshortcuts")).toBe("Control+Shift+P");

    fireEvent.click(item);

    expect(mocks.openSettingsSearch).toHaveBeenCalledOnce();
  });

  describe("« Exporter… » Ctrl+P dans le menu Fichier (issue 374)", () => {
    it("exporte la note ouverte", async () => {
      mocks.currentTab = { type: "sessions", id: "session-1" };
      render(<WindowsTitleBar />);
      openMenu("File");

      const item = await screen.findByRole("menuitem", {
        name: `Export…${formatShortcut("exportNote")}`,
      });
      expect(formatShortcut("exportNote")).toBe("Ctrl+P");
      expect(item.getAttribute("aria-keyshortcuts")).toBe("Control+P");
      expect(item.hasAttribute("data-disabled")).toBe(false);

      fireEvent.click(item);

      expect(mocks.exportNoteFromShortcut).toHaveBeenCalledOnce();
    });

    it("est grisé hors d'une note", async () => {
      mocks.currentTab = { type: "settings" };
      render(<WindowsTitleBar />);
      openMenu("File");

      const item = await screen.findByRole("menuitem", { name: /Export…/ });
      expect(item.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(item);
      expect(mocks.exportNoteFromShortcut).not.toHaveBeenCalled();
    });
  });

  describe("bouton Accueil (issue 315)", () => {
    it("apparaît dans les réglages et ramène à l'accueil", () => {
      mocks.currentTab = { type: "settings" };

      render(<WindowsTitleBar />);

      expect(document.getElementById("title-bar-sidebar-actions")).toBeTruthy();

      const home = screen.getByRole("button", { name: "Home" });
      expect(home.hasAttribute("disabled")).toBe(false);
      fireEvent.click(home);

      expect(mocks.openCurrent).toHaveBeenCalledWith({ type: "empty" });
    });

    it("apparaît sur une note et ramène à l'accueil", () => {
      mocks.currentTab = { type: "sessions", id: "s1" };

      render(<WindowsTitleBar />);

      fireEvent.click(screen.getByRole("button", { name: "Home" }));

      expect(mocks.openCurrent).toHaveBeenCalledWith({ type: "empty" });
      expect(document.getElementById("title-bar-sidebar-actions")).toBeNull();
    });

    it("est placé avant les menus, en haut à gauche", () => {
      mocks.currentTab = { type: "sessions", id: "s1" };

      render(<WindowsTitleBar />);

      const home = screen.getByRole("button", { name: "Home" });
      const menubar = screen.getByRole("menubar");
      expect(
        home.compareDocumentPosition(menubar) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("reste en place mais désactivé sur l'accueil", () => {
      mocks.currentTab = { type: "empty" };

      render(<WindowsTitleBar />);

      const home = screen.getByRole("button", { name: "Home" });
      expect(home.hasAttribute("disabled")).toBe(true);
      expect(home.getAttribute("aria-current")).toBe("page");
      fireEvent.click(home);

      expect(mocks.openCurrent).not.toHaveBeenCalled();
    });

    it("rappelle le raccourci dans l'infobulle", () => {
      mocks.currentTab = { type: "settings" };

      render(<WindowsTitleBar />);

      const home = screen.getByRole("button", { name: "Home" });
      expect(home.getAttribute("title")).toBe("Home (Esc)");
      expect(home.getAttribute("aria-keyshortcuts")).toBe(
        "Escape Alt+ArrowLeft",
      );
    });

    it("va à l'accueil même si l'assistant est ouvert", () => {
      mocks.currentTab = { type: "calendar" };
      mocks.chatMode = "Floating";

      render(<WindowsTitleBar />);

      fireEvent.click(screen.getByRole("button", { name: "Home" }));

      expect(mocks.openCurrent).toHaveBeenCalledWith({ type: "empty" });
    });

    it("est absent pendant la prise en main", () => {
      mocks.currentTab = { type: "onboarding" };

      render(<WindowsTitleBar />);

      expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    });
  });
});
