import { t } from "@lingui/core/macro";
import { platform } from "@tauri-apps/plugin-os";

// Table unique des raccourcis clavier (étude UX de la navigation, issue 372).
// Les menus, les infobulles, `aria-keyshortcuts`, les puces `kbd` et l'aide F1
// la lisent : on ne recopie plus « Ctrl+N » à la main.
//
// Règles (design/navigation/etude-ux.md, section 3) :
// - jamais `Ctrl+Alt+lettre` (AltGr sur AZERTY), ni `Ctrl+W`, `Ctrl+Q`,
//   `Ctrl+/`, `F5`, `Ctrl+R`, `Ctrl+Alt+Espace` (dictée globale) ;
// - aucune lettre que l'AZERTY déplace (A, Q, Z, W, M) ;
// - toute ponctuation compare le caractère tapé (`typedKey`, voir typed-key.ts).

export type ShortcutId =
  | "newNote"
  | "startListening"
  | "searchNotes"
  | "searchSettings"
  | "settings"
  | "findInNote"
  | "replaceInNote"
  | "findNext"
  | "findPrevious"
  | "previousView"
  | "nextView"
  | "askNote"
  | "exportNote"
  | "save"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "help"
  | "fullScreen"
  | "menuBar"
  | "back"
  | "home";

// Tâches de l'aide F1 (section 7 de l'étude).
export type ShortcutGroup =
  | "prepare"
  | "listen"
  | "review"
  | "export"
  | "settings"
  | "move";

// Qui écoute le raccourci :
// - "main" : `useMainShortcuts`, en permanence dans la fenêtre principale ;
// - "note" : la note ouverte ; `useMainShortcuts` l'enregistre aussi, sans
//   action, pour que WebView2 ne reprenne jamais la touche (en développement,
//   le plugin prevent-default est absent) ;
// - "app" : un autre écouteur toujours monté (palette, chat, zoom, Échap).
export type ShortcutScope = "main" | "note" | "app";

export type ShortcutKey = "Mod" | "Shift" | "Alt" | (string & {});

export interface ShortcutDef {
  id: ShortcutId;
  // Touches dans l'ordre d'affichage, modificateurs d'abord.
  keys: readonly ShortcutKey[];
  // Chaîne `useHotkeys` (react-hotkeys-hook). Absente : aucun écouteur ici.
  hotkeys?: string;
  // Caractère à comparer avec `event.key` (ponctuation, voir typed-key.ts).
  typedKey?: string;
  group: ShortcutGroup;
  scope: ShortcutScope;
  // false : réservé à une issue à venir ; ni écouteur ni affichage.
  available: boolean;
  label: () => string;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: "newNote",
    keys: ["Mod", "N"],
    hotkeys: "mod+n",
    group: "prepare",
    scope: "main",
    available: true,
    label: () => t`New note`,
  },
  {
    id: "startListening",
    keys: ["Mod", "Shift", "N"],
    hotkeys: "mod+shift+n",
    group: "listen",
    scope: "main",
    available: true,
    label: () => t`Begin listening`,
  },
  {
    id: "findInNote",
    keys: ["Mod", "F"],
    hotkeys: "mod+f",
    group: "review",
    scope: "note",
    available: true,
    label: () => t`Find in the note`,
  },
  {
    id: "replaceInNote",
    keys: ["Mod", "H"],
    hotkeys: "mod+h",
    group: "review",
    scope: "note",
    available: true,
    label: () => t`Replace`,
  },
  {
    id: "findNext",
    keys: ["F3"],
    hotkeys: "f3",
    group: "review",
    scope: "note",
    available: true,
    label: () => t`Next match`,
  },
  {
    id: "findPrevious",
    keys: ["Shift", "F3"],
    hotkeys: "shift+f3",
    group: "review",
    scope: "note",
    available: true,
    label: () => t`Previous match`,
  },
  {
    id: "previousView",
    keys: ["Mod", "PageUp"],
    hotkeys: "mod+pageup",
    group: "review",
    scope: "note",
    available: true,
    label: () => t`Previous view of the note`,
  },
  {
    id: "nextView",
    keys: ["Mod", "PageDown"],
    hotkeys: "mod+pagedown",
    group: "review",
    scope: "note",
    available: true,
    label: () => t`Next view of the note`,
  },
  {
    id: "askNote",
    keys: ["Mod", "J"],
    group: "review",
    scope: "app",
    available: true,
    label: () => t`Ask the note`,
  },
  {
    // Issue 374 : la note ouverte prend la main (registerShortcutAction) ;
    // sinon un message court (exportNoteFromShortcut).
    id: "exportNote",
    keys: ["Mod", "P"],
    hotkeys: "mod+p",
    group: "export",
    scope: "main",
    available: true,
    label: () => t`Export or print`,
  },
  {
    id: "save",
    keys: ["Mod", "S"],
    hotkeys: "mod+s",
    group: "export",
    scope: "main",
    available: true,
    label: () => t`Save (automatic)`,
  },
  {
    id: "settings",
    keys: ["Mod", ","],
    // « , » : code `Comma` en QWERTY, `KeyM` en AZERTY.
    hotkeys: "mod+comma, mod+m",
    typedKey: ",",
    group: "settings",
    scope: "main",
    available: true,
    label: () => t`Settings`,
  },
  {
    // Issue 373 : palette filtrée sur les paramètres (openSettingsSearch).
    id: "searchSettings",
    keys: ["Mod", "Shift", "P"],
    hotkeys: "mod+shift+p",
    group: "settings",
    scope: "main",
    available: true,
    label: () => t`Search a setting`,
  },
  {
    id: "zoomIn",
    keys: ["Mod", "+"],
    group: "settings",
    scope: "app",
    available: true,
    label: () => t`Zoom in`,
  },
  {
    id: "zoomOut",
    keys: ["Mod", "-"],
    group: "settings",
    scope: "app",
    available: true,
    label: () => t`Zoom out`,
  },
  {
    id: "zoomReset",
    keys: ["Mod", "0"],
    group: "settings",
    scope: "app",
    available: true,
    label: () => t`Reset zoom`,
  },
  {
    id: "searchNotes",
    keys: ["Mod", "K"],
    group: "move",
    scope: "app",
    available: true,
    label: () => t`Search a note`,
  },
  {
    id: "home",
    keys: ["Escape"],
    group: "move",
    scope: "app",
    available: true,
    label: () => t`Close the open panel, or go home`,
  },
  {
    id: "back",
    keys: ["Alt", "ArrowLeft"],
    hotkeys: "alt+left",
    group: "move",
    scope: "main",
    available: true,
    label: () => t`Back`,
  },
  {
    id: "menuBar",
    keys: ["F10"],
    hotkeys: "f10",
    group: "move",
    scope: "main",
    available: true,
    label: () => t`Go to the File menu`,
  },
  {
    id: "fullScreen",
    keys: ["F11"],
    hotkeys: "f11",
    group: "move",
    scope: "main",
    available: true,
    label: () => t`Full screen`,
  },
  {
    id: "help",
    keys: ["F1"],
    hotkeys: "f1",
    group: "move",
    scope: "main",
    available: true,
    label: () => t`Help and shortcuts`,
  },
];

// Touches neutralisées : WebView2 y réagirait (navigation), l'app n'en fait rien.
export const NEUTRALIZED_HOTKEYS = ["alt+right"] as const;

const SHORTCUTS_BY_ID = new Map(SHORTCUTS.map((def) => [def.id, def]));

export function getShortcut(id: ShortcutId): ShortcutDef {
  const def = SHORTCUTS_BY_ID.get(id);
  if (!def) {
    throw new Error(`unknown shortcut: ${id}`);
  }
  return def;
}

export type ShortcutPlatform = "mac" | "pc";

export function getShortcutPlatform(): ShortcutPlatform {
  try {
    return platform() === "macos" ? "mac" : "pc";
  } catch {
    return "pc";
  }
}

const MAC_SYMBOLS: Record<string, string> = {
  Mod: "⌘",
  Shift: "⇧",
  Alt: "⌥",
};

function keyLabel(key: ShortcutKey, os: ShortcutPlatform): string {
  if (os === "mac" && key in MAC_SYMBOLS) {
    return MAC_SYMBOLS[key];
  }

  switch (key) {
    case "Mod":
      return "Ctrl";
    case "Shift":
      return t`Shift`;
    case "PageUp":
      return t`PgUp`;
    case "PageDown":
      return t`PgDn`;
    case "Escape":
      return t`Esc`;
    case "Enter":
      return t`Enter`;
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    default:
      return key;
  }
}

// Notation Windows : « Ctrl+Maj+N », « Ctrl+Pg.Suiv », « Échap ».
export function formatShortcut(
  id: ShortcutId,
  os: ShortcutPlatform = getShortcutPlatform(),
): string {
  return getShortcut(id)
    .keys.map((key) => keyLabel(key, os))
    .join("+");
}

// Puces `kbd` : « Ctrl Maj N ».
export function formatShortcutKeys(
  id: ShortcutId,
  os: ShortcutPlatform = getShortcutPlatform(),
): string {
  return getShortcut(id)
    .keys.map((key) => keyLabel(key, os))
    .join(" ");
}

// Valeur de `aria-keyshortcuts` (noms de touches du standard UI Events).
export function ariaShortcut(
  id: ShortcutId,
  os: ShortcutPlatform = getShortcutPlatform(),
): string {
  return getShortcut(id)
    .keys.map((key) => {
      if (key === "Mod") {
        return os === "mac" ? "Meta" : "Control";
      }
      return key;
    })
    .join("+");
}

// Infobulle à la manière d'Office : « Exporter (Ctrl+P) ».
export function shortcutTooltip(
  label: string,
  id: ShortcutId,
  os: ShortcutPlatform = getShortcutPlatform(),
): string {
  return `${label} (${formatShortcut(id, os)})`;
}

export function shortcutGroupLabel(group: ShortcutGroup): string {
  switch (group) {
    case "prepare":
      return t`Prepare`;
    case "listen":
      return t`Listen`;
    case "review":
      return t`Review`;
    case "export":
      return t`Export`;
    case "settings":
      return t`Adjust`;
    case "move":
      return t`Get around`;
  }
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "prepare",
  "listen",
  "review",
  "export",
  "settings",
  "move",
];

// Raccourcis disponibles d'une tâche, pour l'aide F1.
export function shortcutsInGroup(group: ShortcutGroup): ShortcutDef[] {
  return SHORTCUTS.filter((def) => def.available && def.group === group);
}
