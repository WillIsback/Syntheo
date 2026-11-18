import { describe, expect, it } from "vitest";

import {
  ancestorFolderPaths,
  childFolderPath,
  collectFolderPaths,
  folderDisplayName,
  folderPathLabel,
  folderPathMatchesFilter,
  isSameOrDescendantFolder,
  movedFolderPath,
  normalizeFolderPath,
  parentFolderPath,
  rebaseFolderPath,
} from "./folders";

describe("folder paths", () => {
  it("normalizes a single folder name and empty values", () => {
    expect(normalizeFolderPath("")).toBe("");
    expect(normalizeFolderPath("   ")).toBe("");
    expect(normalizeFolderPath("work")).toBe("work");
    expect(normalizeFolderPath("  meetings  ")).toBe("meetings");
  });

  it("allows nested paths and normalizes separators", () => {
    expect(normalizeFolderPath("work/meetings")).toBe("work/meetings");
    expect(normalizeFolderPath("work/meetings/")).toBe("work/meetings");
    expect(normalizeFolderPath(String.raw`work\meetings`)).toBe(
      "work/meetings",
    );
  });

  it("rejects traversal, empty segments, and absolute paths", () => {
    expect(normalizeFolderPath("/work")).toBeNull();
    expect(normalizeFolderPath("work//meetings")).toBeNull();
    expect(normalizeFolderPath("../work")).toBeNull();
    expect(normalizeFolderPath("work/../meetings")).toBeNull();
    expect(normalizeFolderPath("./work")).toBeNull();
    expect(normalizeFolderPath(".")).toBeNull();
    expect(normalizeFolderPath("..")).toBeNull();
  });

  it("lists unique folder paths and their ancestors", () => {
    expect(
      collectFolderPaths(["work/meetings", "personal", "work", ""]),
    ).toEqual(["personal", "work", "work/meetings"]);
  });

  it("displays the last segment from stored paths", () => {
    expect(folderDisplayName("work")).toBe("work");
    expect(folderDisplayName("work/meetings")).toBe("meetings");
    expect(folderDisplayName("")).toBe("");
    expect(folderDisplayName(null)).toBe("");
  });

  it("matches a folder filter against the path and its children", () => {
    expect(folderPathMatchesFilter("CS 101", "CS 101")).toBe(true);
    expect(folderPathMatchesFilter("CS 101/week-3", "CS 101")).toBe(true);
    expect(folderPathMatchesFilter("CS 101 Extra", "CS 101")).toBe(false);
    expect(folderPathMatchesFilter("work", "CS 101")).toBe(false);
    expect(folderPathMatchesFilter("", "")).toBe(true);
    expect(folderPathMatchesFilter("CS 101", "")).toBe(false);
    expect(folderPathMatchesFilter("CS 101", null)).toBe(true);
  });

  it("joins a child folder under its parent", () => {
    expect(childFolderPath("CS 101", "Week 1")).toBe("CS 101/Week 1");
    expect(childFolderPath("", "Week 1")).toBeNull();
    expect(ancestorFolderPaths("CS 101/Week 1")).toEqual([
      "CS 101",
      "CS 101/Week 1",
    ]);
  });

  it("labels nested paths with chevrons", () => {
    expect(folderPathLabel("Equipe/MCO")).toBe("Equipe › MCO");
    expect(folderPathLabel("Equipe")).toBe("Equipe");
    expect(folderPathLabel("")).toBe("");
  });

  it("finds the parent of a folder", () => {
    expect(parentFolderPath("Equipe/MCO/2026")).toBe("Equipe/MCO");
    expect(parentFolderPath("Equipe")).toBe("");
  });

  it("detects a folder and its descendants, not its look-alikes", () => {
    expect(isSameOrDescendantFolder("Equipe", "Equipe")).toBe(true);
    expect(isSameOrDescendantFolder("Equipe/MCO", "Equipe")).toBe(true);
    expect(isSameOrDescendantFolder("Equipe 2", "Equipe")).toBe(false);
    expect(isSameOrDescendantFolder("Equipe2/MCO", "Equipe")).toBe(false);
  });

  it("moves a folder under another parent or to the root", () => {
    expect(movedFolderPath("MCO", "Equipe")).toBe("Equipe/MCO");
    expect(movedFolderPath("Equipe/MCO", "")).toBe("MCO");
    expect(movedFolderPath("Equipe/MCO", "Clients/Acme")).toBe(
      "Clients/Acme/MCO",
    );
  });

  it("refuses to move a folder into itself or a descendant", () => {
    expect(movedFolderPath("Equipe", "Equipe")).toBeNull();
    expect(movedFolderPath("Equipe", "Equipe/MCO")).toBeNull();
    expect(movedFolderPath("Equipe", "Equipe 2")).toBe("Equipe 2/Equipe");
  });

  it("rebases a path after its ancestor is renamed", () => {
    expect(rebaseFolderPath("Equipe/MCO", "Equipe", "Pôle")).toBe("Pôle/MCO");
    expect(rebaseFolderPath("Equipe", "Equipe", "Pôle")).toBe("Pôle");
    expect(rebaseFolderPath("Equipe 2/MCO", "Equipe", "Pôle")).toBe(
      "Equipe 2/MCO",
    );
  });
});
