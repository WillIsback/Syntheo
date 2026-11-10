import { create } from "zustand";

export type SidebarNoteFilter = "mine" | "shared";
export type SidebarNotesGroupBy = "date" | "folder";
type SidebarNotesSortOrder = "newest" | "oldest";

type SidebarNotesState = {
  noteFilter: SidebarNoteFilter;
  folderFilter: string | null;
  groupBy: SidebarNotesGroupBy;
  sortOrder: SidebarNotesSortOrder;
  setView: (
    noteFilter: SidebarNoteFilter,
    folderFilter?: string | null,
  ) => void;
  setGroupBy: (groupBy: SidebarNotesGroupBy) => void;
  setSortOrder: (sortOrder: SidebarNotesSortOrder) => void;
};

const defaultSidebarNotes = {
  noteFilter: "mine" as const,
  folderFilter: null,
  groupBy: "date" as const,
  sortOrder: "newest" as const,
};

export const useSidebarNotes = create<SidebarNotesState>((set) => ({
  ...defaultSidebarNotes,
  setView: (noteFilter, folderFilter) =>
    set({
      noteFilter,
      folderFilter: noteFilter === "shared" ? null : (folderFilter ?? null),
    }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
}));

export function resetSidebarNotes() {
  useSidebarNotes.setState({ ...defaultSidebarNotes });
}

export function folderIdForNewNote(
  noteFilter: SidebarNoteFilter,
  folderFilter: string | null,
): string | undefined {
  if (noteFilter !== "mine" || folderFilter === null) {
    return undefined;
  }

  return folderFilter;
}
