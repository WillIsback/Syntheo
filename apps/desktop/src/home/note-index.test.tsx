import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MenuItemDef } from "~/shared/hooks/useNativeContextMenu";

const mocks = vi.hoisted(() => ({
  showMenu: vi.fn(),
}));

// Le menu natif Tauri ne s'affiche pas sous jsdom : on capture les éléments
// passés au menu.
vi.mock("~/shared/hooks/useNativeContextMenu", () => ({
  useNativeContextMenu:
    (items: MenuItemDef[]) => (event: { preventDefault: () => void }) => {
      event.preventDefault();
      mocks.showMenu(items);
    },
}));

import { NoteIndex } from "./note-index";
import type { RecentNote } from "./queries";

type ActionItem = Exclude<MenuItemDef, { separator: true }>;

function lastMenu(): MenuItemDef[] {
  return mocks.showMenu.mock.lastCall?.[0] as MenuItemDef[];
}

function action(id: string): ActionItem {
  const item = lastMenu().find(
    (entry): entry is ActionItem => !("separator" in entry) && entry.id === id,
  );
  if (!item) throw new Error(`menu item ${id} missing`);
  return item;
}

function renderIndex() {
  const props = {
    notes: NOTES,
    onOpen: vi.fn(),
    onExport: vi.fn(),
    onDelete: vi.fn(),
  };
  render(<NoteIndex {...props} />);
  return props;
}

const NOTES: RecentNote[] = [
  {
    id: "s1",
    title: "Entretien annuel",
    createdAt: "2024-10-29T10:00:00",
    durationMs: 42 * 60_000,
    trackingId: "event-tracking-1",
  },
  {
    id: "s2",
    title: "",
    createdAt: "2024-10-28T10:00:00",
    durationMs: 65 * 60_000,
    trackingId: null,
  },
  {
    id: "s3",
    title: "Sans audio",
    createdAt: "2024-10-27T10:00:00",
    durationMs: 0,
    trackingId: null,
  },
];

describe("NoteIndex", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("n'affiche rien sans note", () => {
    const { container } = render(
      <NoteIndex
        notes={[]}
        onOpen={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("liste date, titre et durée, sans carte", () => {
    renderIndex();

    expect(screen.getByRole("heading", { name: "Resume" })).toBeTruthy();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);

    const cells = (row: HTMLElement) =>
      Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent);
    expect(cells(rows[1]!)[1]).toBe("Untitled");
    expect(cells(rows[0]!)[2]).toBe("42 min");
    expect(cells(rows[1]!)[2]).toBe("1 h 05");
    expect(cells(rows[2]!)[2]).toBe("");

    const [date, , duration] = Array.from(rows[0]!.querySelectorAll("td"));
    expect(date?.className).toContain("text-muted-foreground");
    expect(duration?.className).toContain("text-muted-foreground");
    expect(date?.className).toContain("border-border");
    expect(rows[0]!.className).toContain("hover:bg-accent");
    expect(document.querySelector(".bg-card, .shadow")).toBeNull();
  });

  it("ouvre la note au clic sur la ligne ou au clavier", () => {
    const { onOpen } = renderIndex();

    fireEvent.click(screen.getAllByRole("row")[2]!);
    expect(onOpen).toHaveBeenLastCalledWith("s3");

    fireEvent.click(screen.getByRole("button", { name: "Entretien annuel" }));
    expect(onOpen).toHaveBeenLastCalledWith("s1");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("passe d'une note à l'autre avec les flèches", () => {
    renderIndex();
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[data-note-open]"),
    );
    buttons[0]!.focus();

    fireEvent.keyDown(buttons[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0]!.className).toContain("focus-visible:ring-2");
  });

  it("le clic droit sur une ligne ouvre le menu Ouvrir, Exporter…, Supprimer", () => {
    const { onOpen } = renderIndex();

    fireEvent.contextMenu(screen.getAllByRole("row")[0]!);

    expect(mocks.showMenu).toHaveBeenCalledTimes(1);
    expect(
      lastMenu().map((item) => ("separator" in item ? "---" : item.text)),
    ).toEqual(["Open", "Export…", "---", "Delete"]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("le bouton « ⋮ » ouvre le même menu sans ouvrir la note", () => {
    const { onOpen } = renderIndex();
    const more = screen.getAllByRole("button", { name: "More actions" });
    expect(more).toHaveLength(3);
    expect(more[1]!.getAttribute("aria-haspopup")).toBe("menu");

    fireEvent.click(more[1]!);

    expect(onOpen).not.toHaveBeenCalled();
    expect(mocks.showMenu).toHaveBeenCalledTimes(1);
    expect(
      lastMenu().map((item) => ("separator" in item ? "---" : item.id)),
    ).toEqual(["open", "export", "---", "delete"]);
    action("open").action();
    expect(onOpen).toHaveBeenCalledWith("s2");
  });

  it("Exporter… et Supprimer visent la note de la ligne", () => {
    const { onExport, onDelete } = renderIndex();

    fireEvent.click(
      screen.getAllByRole("button", { name: "More actions" })[0]!,
    );
    action("export").action();
    expect(onExport).toHaveBeenCalledWith("s1");

    action("delete").action();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(NOTES[0]);
  });

  it("la touche menu ou Maj+F10 sur le titre ouvre le menu", () => {
    const { onOpen } = renderIndex();
    const title = screen.getByRole("button", { name: "Sans audio" });

    fireEvent.keyDown(title, { key: "ContextMenu" });
    expect(mocks.showMenu).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(title, { key: "F10", shiftKey: true });
    expect(mocks.showMenu).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(title, { key: "F10" });
    expect(mocks.showMenu).toHaveBeenCalledTimes(2);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
