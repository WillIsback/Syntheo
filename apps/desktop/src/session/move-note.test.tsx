import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuItemDef } from "~/shared/hooks/useNativeContextMenu";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  updateSession: vi.fn(),
  openNew: vi.fn(),
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({ toast: mocks.toast }));

vi.mock("~/session/queries", () => ({
  updateSession: mocks.updateSession,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: mocks.openNew }) },
}));

// Le sélecteur réel lit la base : on garde son contrat (dossier choisi).
vi.mock("~/session/components/folder-picker", () => ({
  FolderPickerContent: ({
    selectedPath,
    onSelectFolder,
    onClose,
  }: {
    selectedPath?: string;
    onSelectFolder: (path: string) => void;
    onClose: () => void;
  }) => (
    <button
      type="button"
      data-testid="picker"
      data-selected={selectedPath}
      onClick={() => {
        onClose();
        onSelectFolder("Equipe/MCO");
      }}
    >
      Equipe/MCO
    </button>
  ),
}));

import {
  MoveNoteDialog,
  moveNoteToFolder,
  useMoveNoteDialog,
  useNoteMenuItems,
} from "./move-note";

type ActionItem = Exclude<MenuItemDef, { separator: true }>;

function lastToast() {
  const [message, options] = mocks.toast.mock.lastCall as [
    string,
    { action: { label: string; onClick: () => void } },
  ];
  return { message, options };
}

describe("moveNoteToFolder", () => {
  beforeEach(() => {
    mocks.toast.mockReset();
    mocks.updateSession.mockReset();
    mocks.updateSession.mockResolvedValue(undefined);
    mocks.openNew.mockReset();
    useMoveNoteDialog.setState({ note: null, hosts: [] });
  });

  afterEach(cleanup);

  it("moves the note and offers to undo", async () => {
    await moveNoteToFolder({ id: "s1", folderPath: "Clients" }, "Equipe/MCO");

    expect(mocks.updateSession).toHaveBeenCalledWith("s1", {
      folder_id: "Equipe/MCO",
    });
    const { message, options } = lastToast();
    expect(message).toBe("Note moved to Equipe › MCO");
    expect(options.action.label).toBe("Undo");

    // Annuler remet la note en place sans proposer de régénérer.
    options.action.onClick();
    expect(mocks.updateSession).toHaveBeenLastCalledWith(
      "s1",
      { folder_id: "Clients" },
      { proposeLateFiling: false },
    );
  });

  it("removes the note from its folder", async () => {
    await moveNoteToFolder({ id: "s1", folderPath: "Clients" }, "");

    expect(mocks.updateSession).toHaveBeenCalledWith("s1", { folder_id: "" });
    expect(lastToast().message).toBe("Note removed from its folder");
  });

  it("does nothing when the note is already in the folder", async () => {
    await moveNoteToFolder({ id: "s1", folderPath: "Clients" }, "Clients");

    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("builds the note menu: open, move, remove from folder", () => {
    let menu: (note: {
      id: string;
      title: string;
      folderPath: string;
    }) => MenuItemDef[] = () => [];
    function Probe() {
      menu = useNoteMenuItems();
      return null;
    }
    render(<Probe />);

    const items = menu({
      id: "s1",
      title: "Point",
      folderPath: "Clients",
    }) as ActionItem[];
    expect(items.map((item) => item.id)).toEqual([
      "open",
      "move",
      "remove-from-folder",
    ]);
    items[0]!.action();
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "sessions", id: "s1" });
    items[1]!.action();
    expect(useMoveNoteDialog.getState().note?.id).toBe("s1");

    const unfiled = menu({ id: "s2", title: "", folderPath: "" });
    expect((unfiled[2] as ActionItem).disabled).toBe(true);
  });

  it("moves the note from the dialog, then closes it", async () => {
    render(<MoveNoteDialog />);
    act(() =>
      useMoveNoteDialog
        .getState()
        .open({ id: "s1", title: "Point hebdo", folderPath: "Clients" }),
    );

    expect(await screen.findByText("Move “Point hebdo” to…")).toBeTruthy();
    expect(screen.getByTestId("picker").dataset.selected).toBe("Clients");
    fireEvent.click(screen.getByTestId("picker"));

    await waitFor(() =>
      expect(mocks.updateSession).toHaveBeenCalledWith("s1", {
        folder_id: "Equipe/MCO",
      }),
    );
    expect(useMoveNoteDialog.getState().note).toBeNull();
  });

  it("offers an explicit « No folder » entry for a filed note", async () => {
    render(<MoveNoteDialog />);
    act(() =>
      useMoveNoteDialog
        .getState()
        .open({ id: "s1", title: "Point", folderPath: "Clients" }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "No folder" }));

    await waitFor(() =>
      expect(mocks.updateSession).toHaveBeenCalledWith("s1", {
        folder_id: "",
      }),
    );
  });

  it("renders the dialog once when mounted twice", async () => {
    render(
      <>
        <MoveNoteDialog />
        <MoveNoteDialog />
      </>,
    );
    act(() =>
      useMoveNoteDialog
        .getState()
        .open({ id: "s1", title: "Point", folderPath: "" }),
    );

    expect(await screen.findAllByTestId("picker")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "No folder" })).toBeNull();
  });
});
