import { create } from "zustand";

// État de la palette `Ctrl K`, dans un store pour l'ouvrir de n'importe où
// (accueil, barre de titre, raccourcis) sans dépendre d'un contexte React.
// `filter: "settings"` est la palette filtrée de `Ctrl Maj P` (issue 373) :
// une étiquette « Paramètres » dans le champ, retirable.
export type PaletteFilter = "settings" | null;

export const usePaletteStore = create<{
  open: boolean;
  filter: PaletteFilter;
  setOpen: (open: boolean) => void;
  setFilter: (filter: PaletteFilter) => void;
}>((set) => ({
  open: false,
  filter: null,
  setOpen: (open) => set(open ? { open } : { open, filter: null }),
  setFilter: (filter) => set({ filter }),
}));

/** Ouvre la palette de recherche (`Ctrl K`). Stable, utilisable hors React. */
export function openNoteDialog() {
  usePaletteStore.setState({ open: true, filter: null });
}

/** Ouvre la palette filtrée sur les paramètres (`Ctrl Maj P`). */
export function openSettingsSearch() {
  usePaletteStore.setState({ open: true, filter: "settings" });
}

/** Ferme la palette de recherche. */
export function closeNoteDialog() {
  usePaletteStore.getState().setOpen(false);
}

/** Indique si la palette est ouverte (lecture réactive). */
export function useIsNoteDialogOpen() {
  return usePaletteStore((state) => state.open);
}
