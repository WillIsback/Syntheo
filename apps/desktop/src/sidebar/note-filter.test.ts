import { afterEach, describe, expect, it } from "vitest";

import {
  folderIdForNewNote,
  resetSidebarNotes,
  useSidebarNotes,
} from "./note-filter";

describe("sidebar note filter", () => {
  afterEach(() => {
    resetSidebarNotes();
  });

  it("inherits a folder only while that folder is the active mine view", () => {
    expect(folderIdForNewNote("mine", null)).toBeUndefined();
    expect(folderIdForNewNote("shared", "CS 101")).toBeUndefined();
    expect(folderIdForNewNote("mine", "")).toBe("");
    expect(folderIdForNewNote("mine", "CS 101")).toBe("CS 101");
  });

  it("clears the folder filter when switching to shared notes", () => {
    useSidebarNotes.getState().setView("mine", "CS 101");
    useSidebarNotes.getState().setView("shared");

    expect(useSidebarNotes.getState()).toMatchObject({
      noteFilter: "shared",
      folderFilter: null,
    });
  });

  it("keeps grouping and sort independent of the ownership filter", () => {
    useSidebarNotes.getState().setGroupBy("folder");
    useSidebarNotes.getState().setSortOrder("oldest");
    useSidebarNotes.getState().setView("shared");

    expect(useSidebarNotes.getState()).toMatchObject({
      noteFilter: "shared",
      folderFilter: null,
      groupBy: "folder",
      sortOrder: "oldest",
    });
  });
});
