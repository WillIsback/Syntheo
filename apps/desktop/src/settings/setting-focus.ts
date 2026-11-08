import { type RefObject, useEffect } from "react";
import { create } from "zustand";

import { type SettingId, settingFallback } from "~/settings/search-index";

export type { SettingId };

// Ciblage d'un réglage précis dans les pages de réglages : l'élément porte
// `data-setting-id`, une demande de focus le fait défiler à l'écran, le
// surligne 2 secondes (fond `accent`) et place le focus sur son champ
// (issue 351). La recherche de paramètres s'en sert aussi (issue 373) : les
// identifiants viennent de son index.

const FOCUS_TIMEOUT_MS = 3_000;
export const SETTING_HIGHLIGHT_MS = 2_000;
const HIGHLIGHT_ATTRIBUTE = "data-setting-highlight";

const FOCUSABLE_SELECTOR = [
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

type SettingFocusState = {
  pending: SettingId | null;
  request: (id: SettingId) => void;
  clear: () => void;
};

export const useSettingFocus = create<SettingFocusState>((set) => ({
  pending: null,
  request: (id) => set({ pending: id }),
  clear: () => set({ pending: null }),
}));

export function requestSettingFocus(id: SettingId) {
  useSettingFocus.getState().request(id);
}

function findSettingFocusTarget(element: HTMLElement) {
  // L'option cochée d'un groupe de choix (thème, palette), puis un champ de
  // saisie (retrait d'une langue...), puis tout autre contrôle actif.
  const target =
    element.querySelector<HTMLElement>(
      "[role='radio'][aria-checked='true']:not([disabled])",
    ) ??
    element.querySelector<HTMLElement>(
      "input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled])",
    ) ??
    element.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  if (target) {
    return target;
  }

  // Réglage désactivé : la ligne elle-même reçoit le focus, pour que le
  // lecteur d'écran l'annonce.
  if (!element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1");
  }
  return element;
}

const highlightTimers = new WeakMap<HTMLElement, number>();

function highlightSetting(element: HTMLElement) {
  window.clearTimeout(highlightTimers.get(element));
  element.setAttribute(HIGHLIGHT_ATTRIBUTE, "");
  highlightTimers.set(
    element,
    window.setTimeout(() => {
      element.removeAttribute(HIGHLIGHT_ATTRIBUTE);
      highlightTimers.delete(element);
    }, SETTING_HIGHLIGHT_MS),
  );
}

function findSettingElement(root: ParentNode, id: string) {
  // Un réglage affiché sous condition (option désactivée, serveur non
  // configuré) apparaît dans le même rendu que son parent : si le parent est
  // là sans lui, il ne viendra pas, on cible donc le parent.
  for (
    let current: string | undefined = id;
    current;
    current = settingFallback(current)
  ) {
    const element = root.querySelector<HTMLElement>(
      `[data-setting-id="${current}"]`,
    );
    if (element) {
      return element;
    }
  }
  return null;
}

// Fait défiler jusqu'au réglage, le surligne et lui donne le focus. Renvoie
// false tant que le réglage n'est pas affiché.
export function focusSetting(root: ParentNode, id: SettingId) {
  const element = findSettingElement(root, id);
  if (!element) {
    return false;
  }

  element.scrollIntoView?.({ block: "center" });
  findSettingFocusTarget(element).focus({ preventScroll: true });
  highlightSetting(element);
  return true;
}

// Traite la demande en attente dès que le réglage apparaît dans `rootRef`
// (les pages affichent d'abord un indicateur de chargement).
export function usePendingSettingFocus(rootRef: RefObject<HTMLElement | null>) {
  const pending = useSettingFocus((state) => state.pending);
  const clear = useSettingFocus((state) => state.clear);

  useEffect(() => {
    const root = rootRef.current;
    if (!pending || !root) {
      return;
    }

    if (focusSetting(root, pending)) {
      clear();
      return;
    }

    const observer = new MutationObserver(() => {
      if (focusSetting(root, pending)) {
        observer.disconnect();
        window.clearTimeout(timeout);
        clear();
      }
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      clear();
    }, FOCUS_TIMEOUT_MS);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [pending, rootRef, clear]);
}
