import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (
  event?: KeyboardEvent,
  hotkey?: { hotkey: string },
) => void | Promise<void>;
type Options = {
  preventDefault?: boolean;
  ignoreEventWhen?: (event: Pick<KeyboardEvent, "key">) => boolean;
};

const hoisted = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  options: new Map<string, Options>(),
  focusTitleBarMenu: vi.fn(),
  openHelpDialog: vi.fn(),
  openNew: vi.fn(),
  toastInfo: vi.fn(),
  toggleFullscreen: vi.fn(() => Promise.resolve()),
}));

vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: (keys: string, handler: Handler, options: Options) => {
    hoisted.handlers.set(keys, handler);
    hoisted.options.set(keys, options);
  },
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { info: hoisted.toastInfo },
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    chat: { mode: "FloatingClosed", sendEvent: vi.fn(), startNewChat: vi.fn() },
  }),
}));

vi.mock("~/shared/help-dialog", () => ({
  openHelpDialog: hoisted.openHelpDialog,
}));

vi.mock("~/shared/window-shortcuts", () => ({
  focusTitleBarMenu: hoisted.focusTitleBarMenu,
  toggleFullscreen: hoisted.toggleFullscreen,
}));

vi.mock("~/shared/useNewNote", () => ({
  useNewNote: () => vi.fn(),
  useNewNoteAndListen: () => vi.fn(),
}));

vi.mock("~/shared/hooks/useWindowControlsGutter", () => ({
  usesWindowsStyleTitleBar: () => true,
}));

vi.mock("~/store/zustand/tabs", () => {
  const state = { currentTab: null, openNew: hoisted.openNew };
  const useTabs = Object.assign(
    (selector: (s: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return { useTabs };
});

import { registerShortcutAction } from "~/shared/shortcut-actions";
import {
  getShortcut,
  NEUTRALIZED_HOTKEYS,
  SHORTCUTS,
} from "~/shared/shortcuts";
import {
  NOTE_GUARD_HOTKEYS,
  PAGE_SEARCH_ATTRIBUTE,
  useMainShortcuts,
} from "~/shared/useMainShortcuts";

function run(id: Parameters<typeof getShortcut>[0]) {
  const keys = getShortcut(id).hotkeys ?? "";
  const handler = hoisted.handlers.get(keys);
  expect(handler, id).toBeDefined();
  return handler?.();
}

describe("useMainShortcuts : table des raccourcis (issue 372)", () => {
  beforeEach(() => {
    hoisted.handlers.clear();
    hoisted.options.clear();
    for (const mock of [
      hoisted.focusTitleBarMenu,
      hoisted.openHelpDialog,
      hoisted.openNew,
      hoisted.toastInfo,
      hoisted.toggleFullscreen,
    ]) {
      mock.mockClear();
    }
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("enregistre en permanence chaque raccourci disponible, avec preventDefault", () => {
    renderHook(() => useMainShortcuts());

    const guarded = NOTE_GUARD_HOTKEYS.split(",").map((key) => key.trim());
    for (const def of SHORTCUTS) {
      if (!def.available || !def.hotkeys) {
        // Réservé à une issue à venir : aucun écouteur.
        if (def.hotkeys) {
          expect(hoisted.handlers.has(def.hotkeys), def.id).toBe(false);
        }
        continue;
      }

      if (def.scope === "main") {
        expect(hoisted.options.get(def.hotkeys)?.preventDefault, def.id).toBe(
          true,
        );
      } else if (def.scope === "note") {
        expect(guarded, def.id).toContain(def.hotkeys);
      }
    }
    expect(hoisted.options.get(NOTE_GUARD_HOTKEYS)?.preventDefault).toBe(true);
    expect(
      hoisted.options.get(NEUTRALIZED_HOTKEYS.join(", "))?.preventDefault,
    ).toBe(true);
  });

  it("F1 ouvre l'aide et les raccourcis", () => {
    renderHook(() => useMainShortcuts());
    void run("help");
    expect(hoisted.openHelpDialog).toHaveBeenCalledOnce();
  });

  it("F11 bascule le plein écran", () => {
    renderHook(() => useMainShortcuts());
    void run("fullScreen");
    expect(hoisted.toggleFullscreen).toHaveBeenCalledOnce();
  });

  it("F10 va au menu Fichier", () => {
    renderHook(() => useMainShortcuts());
    void run("menuBar");
    expect(hoisted.focusTitleBarMenu).toHaveBeenCalledOnce();
  });

  it("Ctrl+S rappelle que l'enregistrement est automatique", () => {
    renderHook(() => useMainShortcuts());
    void run("save");
    expect(hoisted.toastInfo).toHaveBeenCalledWith(
      "Your notes are saved automatically.",
    );
  });

  it("Ctrl+S laisse la main à l'édition de la transcription", () => {
    const exitEdit = vi.fn();
    const unregister = registerShortcutAction("save", exitEdit);
    renderHook(() => useMainShortcuts());

    void run("save");

    expect(exitEdit).toHaveBeenCalledOnce();
    expect(hoisted.toastInfo).not.toHaveBeenCalled();
    unregister();
  });

  it("Ctrl+P hors d'une note affiche un message court (issue 374)", () => {
    renderHook(() => useMainShortcuts());
    void run("exportNote");
    expect(hoisted.toastInfo).toHaveBeenCalledWith("Open a note to export it.");
    expect(
      hoisted.options.get(getShortcut("exportNote").hotkeys ?? "")
        ?.preventDefault,
    ).toBe(true);
  });

  it("Ctrl+P laisse la main à la note ouverte (issue 374)", () => {
    const openExport = vi.fn();
    const unregister = registerShortcutAction("exportNote", openExport);
    renderHook(() => useMainShortcuts());

    void run("exportNote");

    expect(openExport).toHaveBeenCalledOnce();
    expect(hoisted.toastInfo).not.toHaveBeenCalled();
    unregister();
  });

  it("Ctrl+, ouvre les paramètres, seulement si « , » est tapé", () => {
    renderHook(() => useMainShortcuts());
    void run("settings");
    expect(hoisted.openNew).toHaveBeenCalledWith({ type: "settings" });

    const ignore = hoisted.options.get(
      getShortcut("settings").hotkeys ?? "",
    )?.ignoreEventWhen;
    expect(ignore?.({ key: "," })).toBe(false);
    expect(ignore?.({ key: ";" })).toBe(true);
    expect(ignore?.({ key: "m" })).toBe(true);
  });

  it("Ctrl+F hors d'une note sélectionne le champ de recherche de l'écran", () => {
    const input = document.createElement("input");
    input.setAttribute(PAGE_SEARCH_ATTRIBUTE, "");
    input.value = "micro";
    document.body.append(input);
    renderHook(() => useMainShortcuts());

    void hoisted.handlers.get(NOTE_GUARD_HOTKEYS)?.(undefined, {
      hotkey: "mod+f",
    });

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("micro".length);
  });

  it("les autres raccourcis de la note ne font rien hors d'une note", () => {
    const input = document.createElement("input");
    input.setAttribute(PAGE_SEARCH_ATTRIBUTE, "");
    document.body.append(input);
    renderHook(() => useMainShortcuts());

    void hoisted.handlers.get(NOTE_GUARD_HOTKEYS)?.(undefined, {
      hotkey: " f3",
    });

    expect(document.activeElement).not.toBe(input);
  });
});
