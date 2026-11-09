import { t } from "@lingui/core/macro";
import { useCallback, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { toast } from "@syntheo/ui/components/ui/toast";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { useShell } from "~/contexts/shell";
import { startPreparedNoteFromShortcut } from "~/session/components/capsule/start-shortcut";
import { exportNoteFromShortcut } from "~/shared/export-shortcut";
import { openHelpDialog } from "~/shared/help-dialog";
import { usesWindowsStyleTitleBar } from "~/shared/hooks/useWindowControlsGutter";
import { goBackOrHome, leaveOverlayTab } from "~/shared/leave-overlay-tab";
import { openSettingsSearch } from "~/shared/palette-store";
import { runShortcutAction } from "~/shared/shortcut-actions";
import {
  getShortcut,
  NEUTRALIZED_HOTKEYS,
  SHORTCUTS,
  type ShortcutId,
} from "~/shared/shortcuts";
import { ignoreUnlessTyped } from "~/shared/typed-key";
import { useNewNote, useNewNoteAndListen } from "~/shared/useNewNote";
import { focusTitleBarMenu, toggleFullscreen } from "~/shared/window-shortcuts";
import { useTabs } from "~/store/zustand/tabs";
import { toggleLiveChannel } from "~/stt/channel-mute";

// Raccourcis enregistrés en permanence, avec `preventDefault` : en
// développement, le plugin prevent-default est absent et WebView2 reprendrait
// sinon la touche (Ctrl+F, F3, Ctrl+S…). Les touches viennent de la table
// unique `shared/shortcuts.ts`.
const ALWAYS_ON = {
  preventDefault: true,
  enableOnFormTags: true,
  enableOnContentEditable: true,
} as const;

function hotkeysOf(id: ShortcutId) {
  return getShortcut(id).hotkeys ?? "";
}

// Raccourcis de la note : la note ouverte les traite ; ici, on ne fait
// qu'empêcher WebView2 de les prendre quand aucune note n'est affichée.
export const NOTE_GUARD_HOTKEYS = SHORTCUTS.filter(
  (def) => def.available && def.scope === "note" && def.hotkeys,
)
  .map((def) => def.hotkeys)
  .join(", ");

// Ctrl+F hors d'une note : focus sur le champ de recherche de l'écran
// (Paramètres), texte sélectionné.
export const PAGE_SEARCH_ATTRIBUTE = "data-page-search";

function focusPageSearch() {
  const input = document.querySelector<HTMLInputElement>(
    `[${PAGE_SEARCH_ATTRIBUTE}]`,
  );
  input?.focus();
  input?.select();
}

export function useMainShortcuts() {
  const runEscapeShortcut = useMainEscapeShortcutAction();
  const currentTab = useTabs((state) => state.currentTab);
  const { chat } = useShell();

  const newNote = useNewNote();
  const newNoteCurrent = useNewNote({ behavior: "current" });

  const escapeShortcutRef = useRef(runEscapeShortcut);
  escapeShortcutRef.current = runEscapeShortcut;
  const chatRef = useRef(chat);
  chatRef.current = chat;

  useMountEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const escapeContext = getEscapeShortcutContext(event.target);
      const hadOpenChat = chatRef.current.mode !== "FloatingClosed";

      window.setTimeout(() => {
        if (shouldSkipEscapeShortcut(event, escapeContext)) {
          return;
        }

        if (hadOpenChat) {
          chatRef.current.sendEvent({ type: "CLOSE" });
          return;
        }

        escapeShortcutRef.current();
      });
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  });

  useHotkeys(
    hotkeysOf("newNote"),
    () => {
      if (isPersistentChatInputFocused(chat.mode)) {
        chat.startNewChat();
        return;
      }

      if (currentTab?.type === "empty") {
        newNoteCurrent();
      } else {
        newNote();
      }
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [chat, currentTab, newNote, newNoteCurrent],
  );

  // Alt+← : retour en arrière, convention Windows et navigateur (issue 315).
  // Sur macOS, Option+← déplace le curseur d'un mot : on laisse alors la main
  // aux champs de saisie et à l'éditeur.
  const altLeftInTextFields = usesWindowsStyleTitleBar();
  useHotkeys(
    hotkeysOf("back"),
    () => {
      goBackOrHome();
    },
    {
      preventDefault: true,
      enableOnFormTags: altLeftInTextFields,
      enableOnContentEditable: altLeftInTextFields,
    },
    [],
  );

  // Alt+→ : pas d'historique « suivant » ; on évite la navigation WebView2.
  useHotkeys(
    NEUTRALIZED_HOTKEYS.join(", "),
    () => {},
    {
      preventDefault: true,
      enableOnFormTags: altLeftInTextFields,
      enableOnContentEditable: altLeftInTextFields,
    },
    [],
  );

  const newNoteAndListen = useNewNoteAndListen();

  useHotkeys(
    hotkeysOf("startListening"),
    () => {
      // Note en préparation ouverte : « Commencer l'écoute » de cette note.
      if (startPreparedNoteFromShortcut()) {
        return;
      }

      newNoteAndListen();
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [newNoteAndListen],
  );

  const openNew = useTabs((state) => state.openNew);
  useHotkeys(
    hotkeysOf("settings"),
    () => openNew({ type: "settings" }),
    {
      ...ALWAYS_ON,
      ignoreEventWhen: ignoreUnlessTyped(getShortcut("settings").typedKey),
    },
    [openNew],
  );

  useHotkeys(hotkeysOf("help"), openHelpDialog, ALWAYS_ON, []);

  // Ctrl+Maj+M et Ctrl+Maj+S (issue 447) : couper ou rétablir le micro ou le
  // son système de l'écoute en cours, sans effet hors écoute.
  useHotkeys(
    hotkeysOf("toggleMicrophone"),
    () => toggleLiveChannel("mic"),
    {
      ...ALWAYS_ON,
      ignoreEventWhen: ignoreUnlessTyped(
        getShortcut("toggleMicrophone").typedKey,
      ),
    },
    [],
  );
  useHotkeys(
    hotkeysOf("toggleSystemAudio"),
    () => toggleLiveChannel("speaker"),
    ALWAYS_ON,
    [],
  );

  useHotkeys(
    hotkeysOf("fullScreen"),
    () => {
      void toggleFullscreen().catch((error) =>
        console.error("[shortcuts] failed to toggle full screen", error),
      );
    },
    ALWAYS_ON,
    [],
  );

  useHotkeys(hotkeysOf("menuBar"), focusTitleBarMenu, ALWAYS_ON, []);

  // Ctrl+S : l'enregistrement est automatique, on le dit. L'édition de la
  // transcription prend la main pour sortir de ce mode.
  useHotkeys(
    hotkeysOf("save"),
    () => {
      if (runShortcutAction("save")) {
        return;
      }

      toast.info(t`Your notes are saved automatically.`);
    },
    ALWAYS_ON,
    [],
  );

  useHotkeys(
    NOTE_GUARD_HOTKEYS,
    (_event, hotkey) => {
      if (hotkey.hotkey.trim() === hotkeysOf("findInNote")) {
        focusPageSearch();
      }
    },
    ALWAYS_ON,
    [],
  );

  // Ctrl+Maj+P : rechercher un paramètre (issue 373), la palette filtrée.
  // Enregistré en permanence avec preventDefault : en développement, rien
  // d'autre n'empêche Chromium d'ouvrir l'impression système. En version
  // publiée, tauri-plugin-prevent-default l'annule aussi (drapeau PRINT) sans
  // arrêter la propagation : l'événement arrive bien ici. react-hotkeys-hook
  // compare `event.code` (KeyP) ou `event.key` (« P ») : la touche P est au
  // même endroit en AZERTY et en QWERTY, les deux voies concordent.
  useHotkeys(hotkeysOf("searchSettings"), openSettingsSearch, ALWAYS_ON, []);

  // Ctrl+P : exporter ou imprimer la note (issue 374), et jamais l'impression
  // de la page entière par WebView2. Même protection que Ctrl+Maj+P (drapeau
  // PRINT du plugin en version publiée, preventDefault ici en développement).
  useHotkeys(hotkeysOf("exportNote"), exportNoteFromShortcut, ALWAYS_ON, []);

  return { runEscapeShortcut };
}

function useMainEscapeShortcutAction() {
  const { chat } = useShell();

  return useCallback(() => {
    if (chat.mode !== "FloatingClosed") {
      chat.sendEvent({ type: "CLOSE" });
      return;
    }

    leaveOverlayTab();
  }, [chat.mode, chat.sendEvent]);
}

export function getEscapeShortcutContext(target: EventTarget | null) {
  const fromProseMirrorEditor = isFromProseMirrorEditor(target);

  return {
    fromProseMirrorEditor,
    fromSessionTitleInput: isFromSessionTitleInput(target),
    fromSessionSurface: isFromSessionSurface(target),
    fromTranscriptEditor:
      target instanceof Element &&
      target.closest("[data-transcript-editor]") !== null,
    hadEditorEscapeConsumer:
      fromProseMirrorEditor &&
      document.querySelector("[data-editor-escape-consumer]") !== null,
    hadMeaningfulFocus: hasMeaningfulFocus(target),
  };
}

export function shouldSkipEscapeShortcut(
  event: KeyboardEvent,
  {
    fromProseMirrorEditor,
    fromSessionTitleInput,
    fromSessionSurface,
    fromTranscriptEditor,
    hadEditorEscapeConsumer,
    hadMeaningfulFocus,
  }: {
    fromProseMirrorEditor: boolean;
    fromSessionTitleInput: boolean;
    fromSessionSurface: boolean;
    fromTranscriptEditor: boolean;
    hadEditorEscapeConsumer: boolean;
    hadMeaningfulFocus: boolean;
  },
) {
  if (!event.defaultPrevented) {
    return false;
  }

  if (!hadMeaningfulFocus) {
    return false;
  }

  if (fromTranscriptEditor) {
    return true;
  }

  if (fromSessionTitleInput || fromSessionSurface) {
    return false;
  }

  if (!fromProseMirrorEditor) {
    return true;
  }

  return hadEditorEscapeConsumer;
}

function hasMeaningfulFocus(target: EventTarget | null) {
  if (isMeaningfulEscapeTarget(target)) {
    return true;
  }

  const activeElement = document.activeElement;

  return (
    activeElement instanceof HTMLElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  );
}

function isMeaningfulEscapeTarget(target: EventTarget | null) {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  return (
    element !== null &&
    element !== document.body &&
    element !== document.documentElement
  );
}

function isFromProseMirrorEditor(target: EventTarget | null) {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  return element !== null && element.closest(".ProseMirror") !== null;
}

function isFromSessionTitleInput(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("[data-session-title-input]") !== null
  );
}

function isFromSessionSurface(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("[data-session-surface]") !== null
  );
}

function isPersistentChatInputFocused(
  mode: ReturnType<typeof useShell>["chat"]["mode"],
) {
  if (mode === "FloatingClosed") {
    return false;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }

  return activeElement.closest("[data-chat-message-input]") !== null;
}
