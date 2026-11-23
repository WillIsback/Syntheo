import { useEditorEventListener } from "@handlewithcare/react-prosemirror";
import type { Dispatch, SetStateAction } from "react";

// Navigation clavier d'une liste de suggestions ouverte dans l'éditeur :
// Échap la ferme, haut et bas changent la sélection, Entrée la choisit.
export function useListKeyboard<T>({
  active,
  items,
  selectedIndex,
  setSelectedIndex,
  onDismiss,
  onChoose,
}: {
  active: boolean;
  items: readonly T[];
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  onDismiss: () => void;
  onChoose: (item: T) => void;
}) {
  useEditorEventListener("keydown", (_view, event) => {
    if (!active || items.length === 0) return false;

    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss();
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
      return true;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
      return true;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[selectedIndex];
      if (item) onChoose(item);
      return true;
    }

    return false;
  });
}
