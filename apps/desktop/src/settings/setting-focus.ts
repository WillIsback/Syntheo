import { type RefObject, useEffect } from "react";
import { create } from "zustand";

// Ciblage d'un réglage précis dans les pages de réglages : l'élément porte
// `data-setting-id`, une demande de focus le fait défiler à l'écran et place
// le focus sur son champ (issue 351). Prévu pour servir aussi à la recherche
// de paramètres (issue 373).
export type SettingId = "spoken-languages";

const FOCUS_TIMEOUT_MS = 3_000;

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
  // Un champ de saisie passe avant les boutons (retrait d'une langue...).
  return (
    element.querySelector<HTMLElement>(
      "input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled])",
    ) ??
    element.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
    element
  );
}

// Fait défiler jusqu'au réglage et lui donne le focus. Renvoie false tant que
// le réglage n'est pas affiché.
export function focusSetting(root: ParentNode, id: SettingId) {
  const element = root.querySelector<HTMLElement>(`[data-setting-id="${id}"]`);
  if (!element) {
    return false;
  }

  element.scrollIntoView?.({ block: "center" });
  findSettingFocusTarget(element).focus({ preventScroll: true });
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
