import { describe, expect, it } from "vitest";

import {
  buildFolderTree,
  filterFolderTree,
  type FolderTreeRow,
  visibleFolderTreeRows,
} from "./sidebar-tree";

import type { SearchNote } from "~/search/unified/types";

function note(id: string, folderPath: string, createdAt: string): SearchNote {
  return { id, title: `Note ${id}`, createdAt, folderPath };
}

function describeRow(row: FolderTreeRow): string {
  const indent = "  ".repeat(row.depth);
  switch (row.kind) {
    case "folder":
      return `${indent}${row.expanded ? "v" : ">"} ${row.name} (${row.noteCount})`;
    case "note":
      return `${indent}- ${row.note.id}`;
    case "more":
      return `${indent}… ${row.hiddenCount}`;
  }
}

const notes = [
  note("a", "Atlas", "2026-11-02T10:00:00Z"),
  note("b", "Atlas", "2026-10-26T10:00:00Z"),
  note("c", "Atlas/Ateliers", "2026-10-20T10:00:00Z"),
  note("d", "Recrutement", "2026-10-01T10:00:00Z"),
  note("e", "", "2026-10-01T10:00:00Z"),
];

describe("buildFolderTree", () => {
  it("nests subfolders under their parent, sorted by name", () => {
    const tree = buildFolderTree(
      ["Recrutement", "Atlas/Ateliers", "Atlas", "Atlas/Archives"],
      [],
    );

    expect(tree.map((node) => node.path)).toEqual(["Atlas", "Recrutement"]);
    expect(tree[0]!.children.map((node) => node.name)).toEqual([
      "Archives",
      "Ateliers",
    ]);
  });

  it("adds missing parent folders of nested paths", () => {
    const tree = buildFolderTree(["Clients/Boréal"], []);

    expect(tree.map((node) => node.path)).toEqual(["Clients"]);
    expect(tree[0]!.children.map((node) => node.path)).toEqual([
      "Clients/Boréal",
    ]);
  });

  it("counts meetings including subfolders and keeps only direct notes", () => {
    const tree = buildFolderTree(
      ["Atlas", "Atlas/Ateliers", "Recrutement"],
      notes,
    );
    const atlas = tree[0]!;

    expect(atlas.noteCount).toBe(3);
    expect(atlas.notes.map((item) => item.id)).toEqual(["a", "b"]);
    expect(atlas.children[0]!.noteCount).toBe(1);
    expect(tree[1]!.noteCount).toBe(1);
  });

  it("sorts direct notes from the most recent", () => {
    const tree = buildFolderTree(
      ["Atlas"],
      [
        note("old", "Atlas", "2026-01-01T10:00:00Z"),
        note("new", "Atlas", "2026-11-01T10:00:00Z"),
      ],
    );

    expect(tree[0]!.notes.map((item) => item.id)).toEqual(["new", "old"]);
  });
});

describe("visibleFolderTreeRows", () => {
  const tree = buildFolderTree(
    ["Atlas", "Atlas/Ateliers", "Recrutement"],
    notes,
  );

  it("shows only root folders when nothing is expanded", () => {
    expect(visibleFolderTreeRows(tree, () => false).map(describeRow)).toEqual([
      "> Atlas (3)",
      "> Recrutement (1)",
    ]);
  });

  it("lists subfolders first, then notes, when a folder is expanded", () => {
    const rows = visibleFolderTreeRows(tree, (path) => path === "Atlas");

    expect(rows.map(describeRow)).toEqual([
      "v Atlas (3)",
      "  > Ateliers (1)",
      "  - a",
      "  - b",
      "> Recrutement (1)",
    ]);
    expect(rows[1]!.parentKey).toBe(rows[0]!.key);
    expect(rows[2]!.parentKey).toBe(rows[0]!.key);
  });

  it("caps the notes and summarises the others", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      note(
        `n${index}`,
        "Atlas",
        `2026-10-${String(20 - index).padStart(2, "0")}T10:00:00Z`,
      ),
    );
    const rows = visibleFolderTreeRows(
      buildFolderTree(["Atlas"], many),
      () => true,
    );

    expect(rows.map(describeRow)).toEqual([
      "v Atlas (8)",
      "  - n0",
      "  - n1",
      "  - n2",
      "  - n3",
      "  - n4",
      "  … 3",
    ]);
  });

  it("marks an empty folder as not expandable", () => {
    const rows = visibleFolderTreeRows(
      buildFolderTree(["Vide"], []),
      () => true,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "folder", expandable: false });
  });
});

describe("filterFolderTree", () => {
  const tree = buildFolderTree(
    ["Atlas", "Atlas/Ateliers", "Recrutement"],
    notes,
  );

  it("keeps matching folders and opens their ancestors", () => {
    const { tree: filtered, forcedExpanded } = filterFolderTree(tree, "atel");

    expect(filtered.map((node) => node.path)).toEqual(["Atlas"]);
    expect(filtered[0]!.children.map((node) => node.path)).toEqual([
      "Atlas/Ateliers",
    ]);
    expect(filtered[0]!.notes).toEqual([]);
    expect([...forcedExpanded]).toEqual(["Atlas"]);
  });

  it("returns the tree unchanged without a query", () => {
    const result = filterFolderTree(tree, "  ");

    expect(result.tree).toBe(tree);
    expect(result.forcedExpanded.size).toBe(0);
  });
});
