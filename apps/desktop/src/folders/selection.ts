import { create } from "zustand";

import { rebaseFolderPath } from "~/session/folders";
import { type TemplateIcon } from "~/templates/template-icon";

export const useFolderSelection = create<{
  selectedPath: string | null;
  deletedPrefixes: string[];
  iconOverrides: Record<string, TemplateIcon>;
  setSelectedPath: (path: string | null) => void;
  markFolderDeleted: (path: string) => void;
  setIconOverride: (path: string, icon: TemplateIcon) => void;
  clearIconOverride: (path: string, icon: TemplateIcon) => void;
  rekeyIconOverride: (fromPath: string, toPath: string) => void;
}>((set) => ({
  selectedPath: null,
  deletedPrefixes: [],
  iconOverrides: {},
  setSelectedPath: (selectedPath) =>
    set((state) => ({
      selectedPath,
      deletedPrefixes: selectedPath
        ? state.deletedPrefixes.filter(
            (prefix) =>
              selectedPath !== prefix && !selectedPath.startsWith(`${prefix}/`),
          )
        : state.deletedPrefixes,
    })),
  markFolderDeleted: (path) =>
    set((state) => ({
      selectedPath:
        state.selectedPath === path ||
        state.selectedPath?.startsWith(`${path}/`)
          ? null
          : state.selectedPath,
      deletedPrefixes: state.deletedPrefixes.includes(path)
        ? state.deletedPrefixes
        : [...state.deletedPrefixes, path],
    })),
  setIconOverride: (path, icon) =>
    set((state) => ({
      iconOverrides: { ...state.iconOverrides, [path]: icon },
    })),
  clearIconOverride: (path, icon) =>
    set((state) => {
      if (state.iconOverrides[path] !== icon) {
        return state;
      }
      const { [path]: _, ...rest } = state.iconOverrides;
      return { iconOverrides: rest };
    }),
  // Le dossier et ses sous-dossiers suivent le renommage ou le déplacement.
  rekeyIconOverride: (fromPath, toPath) =>
    set((state) => {
      if (fromPath === toPath) {
        return state;
      }
      let changed = false;
      const next: Record<string, TemplateIcon> = {};
      for (const [path, icon] of Object.entries(state.iconOverrides)) {
        const rebased = rebaseFolderPath(path, fromPath, toPath);
        changed ||= rebased !== path;
        next[rebased] = icon;
      }
      return changed ? { iconOverrides: next } : state;
    }),
}));

export function useActiveFolderPath(folders: string[]): string | null {
  const selectedPath = useFolderSelection((state) => state.selectedPath);
  const deletedPrefixes = useFolderSelection((state) => state.deletedPrefixes);
  const isDeleted = (path: string) =>
    deletedPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  if (selectedPath !== null && !isDeleted(selectedPath)) {
    return selectedPath;
  }
  return folders.find((folder) => !isDeleted(folder)) ?? null;
}
