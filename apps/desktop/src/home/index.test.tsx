import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuItemDef } from "~/shared/hooks/useNativeContextMenu";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(() => "linux"),
  openCurrent: vi.fn(),
  newNote: vi.fn(),
  openSearch: vi.fn(),
  deleteSession: vi.fn(),
  live: {
    status: "inactive" as "inactive" | "active" | "finalizing",
    sessionId: null as string | null,
    seconds: 0,
    elapsedOffsetSeconds: 0,
    pause: null,
  },
  menus: [] as MenuItemDef[][],
  firstName: "Camille",
  recentNotes: [
    {
      id: "s1",
      title: "Comité projet",
      createdAt: "2024-10-28T10:00:00",
      durationMs: 0,
      folderPath: "Atlas",
    },
  ],
  folders: [
    {
      path: "Atlas",
      name: "Atlas",
      icon: { type: "icon", value: "folder", color: "" },
      meetingCount: 3,
      lastMeetingAt: "2024-10-28T10:00:00",
      thread: null,
    },
  ],
}));

vi.mock("@tauri-apps/plugin-os", () => ({ platform: mocks.platform }));

vi.mock("./queries", () => ({
  RECENT_NOTES_LIMIT: 5,
  useOwnerFirstName: () => mocks.firstName,
  useRecentNotes: () => mocks.recentNotes,
}));

vi.mock("./active-folders", () => ({
  useActiveFolders: () => mocks.folders,
}));

vi.mock("~/session/queries", () => ({
  useFolderIcons: () => ({}),
  useSession: (sessionId: string) => ({
    id: sessionId,
    title: "Comité projet",
  }),
}));

// Carte « En cours » (issue 517) : état de l'écoute lu dans le magasin.
vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ live: mocks.live, pause: vi.fn() }),
}));

vi.mock("~/stt/useStartListening", () => ({
  useStartListening: () => vi.fn(),
}));

vi.mock("~/session/components/folder-picker", () => ({
  FolderPickerContent: () => null,
}));

vi.mock("~/session/hooks/useDeleteSession", () => ({
  useDeleteSession: () => mocks.deleteSession,
}));

vi.mock("~/shared/hooks/useNativeContextMenu", () => ({
  useNativeContextMenu:
    (items: MenuItemDef[]) => (event: { preventDefault: () => void }) => {
      event.preventDefault();
      mocks.menus.push(items);
    },
}));

// La fenêtre d'export réelle lit la note en base : on vérifie seulement
// qu'elle est montée pour la bonne note.
vi.mock("./note-export-dialog", () => ({
  NoteExportDialog: ({
    sessionId,
    open,
  }: {
    sessionId: string;
    open: boolean;
  }) => (
    <div data-testid="export-dialog" data-session={sessionId}>
      {open ? "open" : "closed"}
    </div>
  ),
}));

vi.mock("~/shared/open-note-dialog", () => ({
  useOpenNoteDialog: () => ({ open: mocks.openSearch }),
}));

vi.mock("~/shared/useNewNote", () => ({
  useNewNote: () => mocks.newNote,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: { openCurrent: () => void }) => unknown) =>
    selector({ openCurrent: mocks.openCurrent }),
}));

import { HomePage } from "./index";

import { useFolderSelection } from "~/folders/selection";

describe("HomePage", () => {
  beforeEach(() => {
    mocks.live = {
      status: "inactive",
      sessionId: null,
      seconds: 0,
      elapsedOffsetSeconds: 0,
      pause: null,
    };
    mocks.menus = [];
    mocks.platform.mockReturnValue("linux");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("Démarrer crée une note vierge", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /Start a meeting/ }));
    expect(mocks.newNote).toHaveBeenCalledTimes(1);
  });

  it("ouvre une note de « Reprendre » dans l'onglet courant", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Comité projet" }));
    expect(mocks.openCurrent).toHaveBeenCalledWith({
      type: "sessions",
      id: "s1",
    });
  });

  it("une carte « Vos dossiers » ouvre la page de son dossier", () => {
    useFolderSelection.getState().setSelectedPath(null);
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /Atlas/ }));
    expect(useFolderSelection.getState().selectedPath).toBe("Atlas");
    expect(mocks.openCurrent).toHaveBeenCalledWith({ type: "folders" });

    fireEvent.click(screen.getByRole("button", { name: "All folders" }));
    expect(mocks.openCurrent).toHaveBeenLastCalledWith({ type: "folders" });
    expect(mocks.openCurrent).toHaveBeenCalledTimes(2);
  });

  it("la capsule ouvre la palette de recherche (Ctrl K)", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: /Search a note/ }));
    expect(mocks.openSearch).toHaveBeenCalledTimes(1);
  });

  it("affiche ⌘ sur macOS", () => {
    mocks.platform.mockReturnValue("macos");
    render(<HomePage />);
    expect(
      screen.getByRole("button", { name: /Start a meeting/ }).textContent,
    ).toContain("⌘ N");
  });

  it("Supprimer depuis le menu d'une note passe par useDeleteSession", () => {
    render(<HomePage />);
    fireEvent.contextMenu(screen.getByRole("row"));

    const item = mocks.menus[mocks.menus.length - 1]?.find(
      (entry) => !("separator" in entry) && entry.id === "delete",
    );
    act(() => {
      if (item && !("separator" in item)) item.action();
    });

    expect(mocks.deleteSession).toHaveBeenCalledWith("s1", {
      title: "Comité projet",
    });
    expect(mocks.openCurrent).not.toHaveBeenCalled();
  });

  it("Exporter… ouvre la fenêtre d'export de la note sans l'ouvrir", () => {
    render(<HomePage />);
    expect(screen.queryByTestId("export-dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const item = mocks.menus[mocks.menus.length - 1]?.find(
      (entry) => !("separator" in entry) && entry.id === "export",
    );
    act(() => {
      if (item && !("separator" in item)) item.action();
    });

    const dialog = screen.getByTestId("export-dialog");
    expect(dialog.getAttribute("data-session")).toBe("s1");
    expect(dialog.textContent).toBe("open");
    expect(mocks.openCurrent).not.toHaveBeenCalled();
  });

  it("sans écoute, pas de carte « En cours »", () => {
    render(<HomePage />);
    expect(screen.queryByRole("region", { name: /In progress/ })).toBeNull();
  });

  it("pendant l'écoute, la carte remplace la note dans « Reprendre »", () => {
    mocks.live = { ...mocks.live, status: "active", sessionId: "s1" };
    render(<HomePage />);

    const card = screen.getByRole("region", { name: /In progress/ });
    expect(card.textContent).toContain("Comité projet");
    // La note écoutée n'est pas répétée dans les notes récentes.
    expect(screen.queryByRole("row")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(mocks.openCurrent).toHaveBeenCalledWith({
      type: "sessions",
      id: "s1",
    });
  });
});
