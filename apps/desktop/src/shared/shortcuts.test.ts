import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { messages as frMessages } from "~/i18n/locales/fr/messages";
import {
  ariaShortcut,
  formatShortcut,
  formatShortcutKeys,
  getShortcut,
  NEUTRALIZED_HOTKEYS,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  shortcutsInGroup,
  shortcutTooltip,
} from "~/shared/shortcuts";

describe("table des raccourcis", () => {
  beforeEach(() => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
  });

  afterEach(() => {
    i18n.activate("en");
  });

  it("écrit les raccourcis à la manière de Windows en français", () => {
    expect(formatShortcut("newNote", "pc")).toBe("Ctrl+N");
    expect(formatShortcut("startListening", "pc")).toBe("Ctrl+Maj+N");
    expect(formatShortcut("settings", "pc")).toBe("Ctrl+,");
    expect(formatShortcut("previousView", "pc")).toBe("Ctrl+Pg.Préc");
    expect(formatShortcut("nextView", "pc")).toBe("Ctrl+Pg.Suiv");
    expect(formatShortcut("findPrevious", "pc")).toBe("Maj+F3");
    expect(formatShortcut("home", "pc")).toBe("Échap");
    expect(formatShortcut("back", "pc")).toBe("Alt+←");
  });

  it("garde les symboles ⌘ ⇧ pour macOS", () => {
    expect(formatShortcut("startListening", "mac")).toBe("⌘+⇧+N");
    expect(formatShortcutKeys("askNote", "mac")).toBe("⌘ J");
  });

  it("donne les puces, l'infobulle et aria-keyshortcuts", () => {
    expect(formatShortcutKeys("startListening", "pc")).toBe("Ctrl Maj N");
    expect(shortcutTooltip("Accueil", "home", "pc")).toBe("Accueil (Échap)");
    expect(ariaShortcut("startListening", "pc")).toBe("Control+Shift+N");
    expect(ariaShortcut("askNote", "mac")).toBe("Meta+J");
    expect(ariaShortcut("nextView", "pc")).toBe("Control+PageDown");
  });

  it("n'a ni identifiant ni écouteur en double", () => {
    const ids = SHORTCUTS.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);

    const hotkeys = SHORTCUTS.flatMap((def) =>
      def.hotkeys ? def.hotkeys.split(",").map((key) => key.trim()) : [],
    );
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
    for (const neutralized of NEUTRALIZED_HOTKEYS) {
      expect(hotkeys).not.toContain(neutralized);
    }
  });

  it("respecte les interdits de l'étude (AZERTY, AltGr, Windows)", () => {
    const forbidden = [
      "mod+w",
      "mod+q",
      "mod+/",
      "mod+r",
      "f5",
      "mod+alt+space",
      "ctrl+alt+space",
    ];
    for (const def of SHORTCUTS) {
      const keys = def.keys.map((key) => key.toUpperCase());
      // Lettres que l'AZERTY déplace.
      for (const moved of ["A", "Q", "Z", "W", "M"]) {
        expect(keys, def.id).not.toContain(moved);
      }
      // Ctrl+Alt+… vaut AltGr sur AZERTY.
      expect(keys.includes("MOD") && keys.includes("ALT"), def.id).toBe(false);
      for (const hotkey of def.hotkeys?.split(",") ?? []) {
        expect(forbidden, def.id).not.toContain(hotkey.trim());
      }
    }
  });

  it("compare le caractère tapé pour toute ponctuation écoutée", () => {
    for (const def of SHORTCUTS) {
      const main = def.keys[def.keys.length - 1];
      const isPunctuation = main.length === 1 && !/[a-z0-9]/i.test(main);
      if (isPunctuation && def.hotkeys) {
        expect(def.typedKey, def.id).toBe(main);
      }
    }
  });

  it("range chaque raccourci disponible dans une tâche de l'aide", () => {
    const grouped = SHORTCUT_GROUPS.flatMap((group) =>
      shortcutsInGroup(group).map((def) => def.id),
    );
    const available = SHORTCUTS.filter((def) => def.available).map(
      (def) => def.id,
    );
    expect(grouped.sort()).toEqual(available.sort());
    for (const group of SHORTCUT_GROUPS) {
      expect(shortcutsInGroup(group).length, group).toBeGreaterThan(0);
    }
  });

  it("réserve Ctrl+P (issue 374) et Ctrl+Maj+P (issue 373) sans les afficher", () => {
    expect(getShortcut("exportNote").available).toBe(false);
    expect(getShortcut("searchSettings").available).toBe(false);
    expect(formatShortcut("exportNote", "pc")).toBe("Ctrl+P");
    expect(formatShortcut("searchSettings", "pc")).toBe("Ctrl+Maj+P");
  });
});
