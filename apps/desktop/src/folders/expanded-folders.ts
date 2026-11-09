import { create } from "zustand";

// Dossiers dépliés dans la barre latérale (issue 497), mémorisés sur ce poste.
// Le stockage local peut manquer (navigation privée, accès refusé) : on garde
// alors l'état en mémoire seulement.
export const EXPANDED_FOLDERS_STORAGE_KEY = "syntheo.folders.sidebar-expanded";

function readStoredPaths(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(EXPANDED_FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is string => typeof entry === "string" && entry !== "",
    );
  } catch {
    return [];
  }
}

function writeStoredPaths(paths: readonly string[]) {
  try {
    globalThis.localStorage?.setItem(
      EXPANDED_FOLDERS_STORAGE_KEY,
      JSON.stringify(paths),
    );
  } catch {
    // Stockage indisponible : l'état reste valable pour cette session.
  }
}

type ExpandedFoldersState = {
  expanded: readonly string[];
  setExpanded: (path: string, expanded: boolean) => void;
};

export const useExpandedFolders = create<ExpandedFoldersState>((set, get) => ({
  expanded: readStoredPaths(),
  setExpanded: (path, expanded) => {
    const current = get().expanded;
    if (current.includes(path) === expanded) return;
    const next = expanded
      ? [...current, path]
      : current.filter((entry) => entry !== path);
    writeStoredPaths(next);
    set({ expanded: next });
  },
}));

/** Relit l'état mémorisé (démarrage, tests). */
export function reloadExpandedFolders() {
  useExpandedFolders.setState({ expanded: readStoredPaths() });
}
