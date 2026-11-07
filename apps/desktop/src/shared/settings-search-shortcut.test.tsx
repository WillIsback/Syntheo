import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Vrai react-hotkeys-hook : on vérifie la détection de Ctrl+Maj+P telle
// qu'elle arrive du clavier (issue 373).
vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    chat: { mode: "FloatingClosed", sendEvent: vi.fn(), startNewChat: vi.fn() },
  }),
}));
vi.mock("~/shared/useNewNote", () => ({
  useNewNote: () => vi.fn(),
  useNewNoteAndListen: () => vi.fn(),
}));
vi.mock("~/session/components/capsule/start-shortcut", () => ({
  startPreparedNoteFromShortcut: () => false,
}));
vi.mock("~/shared/leave-overlay-tab", () => ({
  goBackOrHome: vi.fn(),
  leaveOverlayTab: vi.fn(),
}));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: { currentTab: null }) => unknown) =>
    selector({ currentTab: null }),
}));

import { closeNoteDialog, usePaletteStore } from "~/shared/palette-store";
import { useMainShortcuts } from "~/shared/useMainShortcuts";

function press(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("Ctrl+Maj+P : rechercher un paramètre", () => {
  beforeEach(() => {
    closeNoteDialog();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it.each([
    ["QWERTY", { key: "P", code: "KeyP" }],
    // En AZERTY, P est à la même place : même code KeyP, même caractère.
    ["AZERTY", { key: "P", code: "KeyP" }],
  ])(
    "ouvre la palette filtrée et annule l'impression (%s)",
    (_layout, keys) => {
      renderHook(() => useMainShortcuts());

      const event = press(document.body, {
        ...keys,
        ctrlKey: true,
        shiftKey: true,
      });

      expect(usePaletteStore.getState()).toMatchObject({
        open: true,
        filter: "settings",
      });
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it("fonctionne aussi depuis un champ de saisie", () => {
    renderHook(() => useMainShortcuts());
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    press(input, { key: "P", code: "KeyP", ctrlKey: true, shiftKey: true });

    expect(usePaletteStore.getState().filter).toBe("settings");
  });

  it("laisse Ctrl+P (export, issue 374) et Maj+P tranquilles", () => {
    renderHook(() => useMainShortcuts());

    press(document.body, { key: "p", code: "KeyP", ctrlKey: true });
    press(document.body, { key: "P", code: "KeyP", shiftKey: true });

    expect(usePaletteStore.getState().open).toBe(false);
  });
});
