import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openNew: vi.fn() }));

// Les macros Lingui compilent vers `@lingui/react` : on traduit avec le vrai
// moteur pour que les pluriels (compteurs, « … N autres ») soient rendus.
vi.mock("@lingui/react", async () => {
  const { i18n } = await import("@lingui/core");
  type Descriptor = {
    id?: string;
    message?: string;
    values?: Record<string, unknown>;
  };
  const translate = (descriptor: Descriptor) =>
    i18n._({ id: descriptor.id ?? "", ...descriptor });
  return {
    Trans: (props: Descriptor) => <>{translate(props)}</>,
    useLingui: () => ({ _: translate, t: translate, i18n }),
  };
});

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: mocks.openNew }) },
}));

import {
  EXPANDED_FOLDERS_STORAGE_KEY,
  reloadExpandedFolders,
  useExpandedFolders,
} from "./expanded-folders";
import { buildFolderTree } from "./sidebar-tree";
import { FolderTreeView } from "./sidebar-tree-view";

import type { SearchNote } from "~/search/unified/types";

function note(id: string, folderPath: string, day: number): SearchNote {
  return {
    id,
    title: `Point ${id}`,
    createdAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
    folderPath,
  };
}

const tree = buildFolderTree(
  ["Atlas", "Atlas/Ateliers", "Recrutement"],
  [
    note("a1", "Atlas", 28),
    note("a2", "Atlas", 21),
    note("w1", "Atlas/Ateliers", 14),
    note("r1", "Recrutement", 7),
  ],
);

function renderTree(onSelectFolder = vi.fn()) {
  render(
    <FolderTreeView
      tree={tree}
      forcedExpanded={new Set()}
      activeFolder="Atlas"
      iconFor={() => ({ type: "emoji", value: "📁" })}
      onSelectFolder={onSelectFolder}
    />,
  );
  return onSelectFolder;
}

function item(name: string) {
  return screen.getByRole("treeitem", { name });
}

function visibleNames() {
  return screen
    .getAllByRole("treeitem")
    .map(
      (element) => element.getAttribute("aria-label") ?? element.textContent,
    );
}

describe("FolderTreeView", () => {
  beforeEach(() => {
    localStorage.clear();
    reloadExpandedFolders();
    mocks.openNew.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows each folder with its meeting count, collapsed", () => {
    renderTree();

    expect(screen.getByRole("tree", { name: "Folders" })).toBeTruthy();
    expect(visibleNames()).toEqual(["Atlas", "Recrutement"]);
    expect(item("Atlas").getAttribute("aria-expanded")).toBe("false");
    expect(item("Atlas").getAttribute("aria-selected")).toBe("true");
    expect(item("Atlas").textContent).toContain("3");
    expect(screen.getByText("3 meetings")).toBeTruthy();
    expect(screen.getByText("1 meeting")).toBeTruthy();
  });

  it("expands into subfolders then notes, and remembers it", () => {
    renderTree();

    fireEvent.click(item("Atlas").querySelector("[data-folder-tree-toggle]")!);

    expect(visibleNames()).toEqual([
      "Atlas",
      "Ateliers",
      "Point a1",
      "Point a2",
      "Recrutement",
    ]);
    expect(item("Atlas").getAttribute("aria-expanded")).toBe("true");
    expect(item("Ateliers").getAttribute("aria-level")).toBe("2");
    expect(
      JSON.parse(localStorage.getItem(EXPANDED_FOLDERS_STORAGE_KEY)!),
    ).toEqual(["Atlas"]);

    cleanup();
    useExpandedFolders.setState({ expanded: [] });
    reloadExpandedFolders();
    renderTree();
    expect(visibleNames()).toContain("Point a1");
  });

  it("opens the folder page from its name and a note from its row", () => {
    useExpandedFolders.setState({ expanded: ["Atlas"] });
    const onSelectFolder = renderTree();

    fireEvent.click(item("Recrutement"));
    expect(onSelectFolder).toHaveBeenCalledWith("Recrutement");

    fireEvent.click(item("Point a2"));
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "sessions", id: "a2" });
  });

  it("navigates with the keyboard", () => {
    const onSelectFolder = renderTree();
    const atlas = item("Atlas");
    expect(atlas.tabIndex).toBe(0);
    atlas.focus();

    fireEvent.keyDown(atlas, { key: "ArrowRight" });
    expect(atlas.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(atlas, { key: "ArrowRight" });
    expect(document.activeElement).toBe(item("Ateliers"));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Point a1"));

    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "sessions", id: "a1" });

    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(atlas);

    fireEvent.keyDown(atlas, { key: "ArrowLeft" });
    expect(atlas.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(atlas, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("Recrutement"));
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onSelectFolder).toHaveBeenCalledWith("Recrutement");
  });

  it("opens the folder page from the « others » row", () => {
    const many = buildFolderTree(
      ["Atlas"],
      Array.from({ length: 7 }, (_, index) => note(`n${index}`, "Atlas", 20)),
    );
    useExpandedFolders.setState({ expanded: ["Atlas"] });
    const onSelectFolder = vi.fn();
    render(
      <FolderTreeView
        tree={many}
        forcedExpanded={new Set()}
        activeFolder={null}
        iconFor={() => ({ type: "emoji", value: "📁" })}
        onSelectFolder={onSelectFolder}
      />,
    );

    fireEvent.click(screen.getByRole("treeitem", { name: "… 2 others" }));
    expect(onSelectFolder).toHaveBeenCalledWith("Atlas");
  });

  it("keeps working when local storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    renderTree();

    fireEvent.keyDown(item("Atlas"), { key: "ArrowRight" });
    expect(item("Atlas").getAttribute("aria-expanded")).toBe("true");
    setItem.mockRestore();
  });
});
