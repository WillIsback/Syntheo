import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNamedFolder: vi.fn(),
  deleteLocalFolderMaterial: vi.fn(),
  deleteNamedFolder: vi.fn(),
  folders: [] as string[],
  icons: {} as Record<string, { type: "icon"; value: string; color: string }>,
  instructions: "",
  auth: null as { session: { user: { id: string } } } | null,
  materials: [] as Array<{
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    relativePath: string;
  }>,
  renameNamedFolder: vi.fn(),
  updateFolderIcon: vi.fn(),
  updateFolderInstructions: vi.fn(),
  updateFolderWorkspace: vi.fn(),
  upload: vi.fn(),
  personalWorkspaceId: "",
  workspaces: [] as Array<{ id: string; name: string }>,
  menu: [] as Array<{ id?: string; action?: () => void }>,
}));

// Menu natif Tauri : on capture les entrées pour les déclencher.
vi.mock("~/shared/hooks/useNativeContextMenu", () => ({
  showNativeContextMenu: (
    items: Array<{ id?: string; action?: () => void }>,
    event: { preventDefault: () => void },
  ) => {
    event.preventDefault();
    mocks.menu = items;
    return Promise.resolve();
  },
}));

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (message, part, index) =>
          `${message}${part}${index < values.length ? String(values[index]) : ""}`,
        "",
      ),
  }),
}));

vi.mock("~/session/queries", () => ({
  useFolderIcons: () => mocks.icons,
  useFolderPaths: () => mocks.folders,
}));

vi.mock("~/search/unified/catalog", () => ({
  useSearchNotes: () => [],
}));

vi.mock("~/session/folder-catalog", () => ({
  createNamedFolder: mocks.createNamedFolder,
  deleteNamedFolder: mocks.deleteNamedFolder,
  renameNamedFolder: mocks.renameNamedFolder,
  updateFolderIcon: mocks.updateFolderIcon,
  updateFolderInstructions: mocks.updateFolderInstructions,
  updateFolderWorkspace: mocks.updateFolderWorkspace,
  useFolderInstructions: () => mocks.instructions,
}));

vi.mock("~/session-sharing/folder-default-access", () => ({
  folderDefaultAccessRule: () => null,
  setFolderDefaultAccess: vi.fn(),
  useFolderDefaultAccessRules: () => [],
}));

vi.mock("~/session-sharing/source", () => ({
  useAvailableShareWorkspaces: () => mocks.workspaces,
  usePersonalWorkspaceId: () => mocks.personalWorkspaceId,
}));

vi.mock("~/session/folder-attachments", () => ({
  deleteLocalFolderMaterial: mocks.deleteLocalFolderMaterial,
  diskAttachmentId: (relativePath: string) => {
    const parts = relativePath.split("/");
    return parts[parts.length - 1] ?? relativePath;
  },
  useFolderMaterials: () => mocks.materials,
}));

vi.mock("~/shared/hooks/useFileUpload", () => ({
  useFolderMaterialUpload: () => mocks.upload,
}));

vi.mock("~/sidebar/custom-sidebar-header", () => ({
  CustomSidebarHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Page projet (issue 496) : réunions et fil rouge vides ici, ils ont leurs
// propres tests (project/).
vi.mock("./project/meetings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./project/meetings")>()),
  useFolderMeetings: () => [],
}));

vi.mock("./project/thread-store", () => ({
  useFolderThread: () => null,
  saveFolderThreadEdit: vi.fn(),
  saveGeneratedFolderThread: vi.fn(),
}));

vi.mock("~/editor-bridge/mention-config", () => ({
  useMentionConfig: () => undefined,
}));

vi.mock("~/ai/hooks", () => ({
  useLanguageModel: () => null,
}));

import { useExpandedFolders } from "./expanded-folders";
import { useFolderDialogs } from "./folder-actions";
import { FoldersMain } from "./index";
import { useFolderSelection } from "./selection";
import { FoldersSidebar } from "./sidebar";

function FoldersWorkspace() {
  return (
    <>
      <FoldersSidebar />
      <FoldersMain />
    </>
  );
}

function renderFoldersWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FoldersWorkspace />
    </QueryClientProvider>,
  );
}

describe("Folders workspace", () => {
  beforeEach(() => {
    mocks.createNamedFolder.mockReset();
    mocks.deleteLocalFolderMaterial.mockReset();
    mocks.deleteNamedFolder.mockReset();
    mocks.renameNamedFolder.mockReset();
    mocks.updateFolderIcon.mockReset();
    mocks.updateFolderInstructions.mockReset();
    mocks.updateFolderWorkspace.mockReset();
    mocks.upload.mockReset();
    mocks.folders = [];
    mocks.icons = {};
    mocks.instructions = "";
    mocks.materials = [];
    mocks.auth = null;
    mocks.personalWorkspaceId = "";
    mocks.workspaces = [];
    mocks.createNamedFolder.mockResolvedValue("CS 101");
    mocks.deleteNamedFolder.mockResolvedValue(undefined);
    mocks.renameNamedFolder.mockResolvedValue("Algorithms");
    mocks.updateFolderIcon.mockResolvedValue(undefined);
    mocks.updateFolderInstructions.mockResolvedValue(undefined);
    mocks.updateFolderWorkspace.mockResolvedValue(undefined);
    mocks.upload.mockResolvedValue({
      path: "/vault/sessions/CS 101/materials/syllabus.pdf",
      attachmentId: "syllabus.pdf",
    });
    mocks.deleteLocalFolderMaterial.mockResolvedValue(undefined);
    useFolderSelection.setState({
      selectedPath: null,
      deletedPrefixes: [],
      iconOverrides: {},
    });
    useFolderDialogs.setState({ request: null });
    useExpandedFolders.setState({ expanded: [] });
    mocks.menu = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("creates the first folder", async () => {
    renderFoldersWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.change(screen.getByLabelText("Folder name"), {
      target: { value: "CS 101" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mocks.createNamedFolder).toHaveBeenCalledWith("CS 101");
    });
  });

  it("edits context and materials for the selected folder", async () => {
    mocks.folders = ["CS 101", "Work"];
    mocks.materials = [
      {
        id: "mat-1",
        filename: "syllabus.pdf",
        contentType: "application/pdf",
        sizeBytes: 12,
        relativePath: "materials/syllabus.pdf",
      },
    ];

    renderFoldersWorkspace();

    expect(screen.getByRole("textbox", { name: "Folder name" })).toHaveProperty(
      "value",
      "CS 101",
    );
    fireEvent.click(screen.getByRole("treeitem", { name: "Work" }));
    expect(screen.getByRole("textbox", { name: "Folder name" })).toHaveProperty(
      "value",
      "Work",
    );

    fireEvent.change(screen.getByLabelText("Folder context"), {
      target: { value: "Prefer the syllabus." },
    });
    fireEvent.blur(screen.getByLabelText("Folder context"));

    await waitFor(() => {
      expect(mocks.updateFolderInstructions).toHaveBeenCalledWith(
        "Work",
        "Prefer the syllabus.",
      );
    });

    expect(screen.getByText("syllabus.pdf")).toBeTruthy();
    const file = new File(["week 1"], "notes.txt", { type: "text/plain" });
    fireEvent.click(screen.getByRole("button", { name: "Add file" }));
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mocks.upload).toHaveBeenCalledWith(file);
    });
  });

  it("renames the folder from the title field", async () => {
    mocks.folders = ["Work"];

    renderFoldersWorkspace();

    const title = screen.getByRole("textbox", { name: "Folder name" });
    fireEvent.change(title, { target: { value: "Algorithms" } });
    fireEvent.blur(title);

    await waitFor(() => {
      expect(mocks.renameNamedFolder).toHaveBeenCalledWith(
        "Work",
        "Algorithms",
      );
    });
  });

  it("keeps an explicitly selected folder active while queries catch up", () => {
    mocks.folders = ["Work"];
    useFolderSelection.setState({ selectedPath: "New Folder" });

    renderFoldersWorkspace();

    expect(screen.getByRole("textbox", { name: "Folder name" })).toHaveProperty(
      "value",
      "New Folder",
    );
  });

  it("keeps a nested folder under its parent when renaming it", async () => {
    mocks.folders = ["Courses/Algorithms"];
    mocks.renameNamedFolder.mockResolvedValue("Courses/Data Structures");

    renderFoldersWorkspace();

    const title = screen.getByRole("textbox", { name: "Folder name" });
    fireEvent.change(title, { target: { value: "Data Structures" } });
    fireEvent.blur(title);

    await waitFor(() => {
      expect(mocks.renameNamedFolder).toHaveBeenCalledWith(
        "Courses/Algorithms",
        "Courses/Data Structures",
      );
    });
  });

  it("deletes the folder from the actions menu", async () => {
    mocks.folders = ["Work", "Personal"];

    renderFoldersWorkspace();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Folder actions" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByText(
        "Notes stay in All notes. This folder, its nested folders, and all their materials will be deleted.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));

    await waitFor(() => {
      expect(mocks.deleteNamedFolder).toHaveBeenCalledWith("Work");
      expect(
        screen.getByRole("textbox", { name: "Folder name" }),
      ).toHaveProperty("value", "Personal");
    });
  });

  it("saves a folder icon from the header picker", async () => {
    mocks.folders = ["Work"];

    renderFoldersWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Choose folder icon" }));
    fireEvent.click(screen.getByRole("button", { name: "target" }));

    await waitFor(() => {
      expect(mocks.updateFolderIcon).toHaveBeenCalledWith("Work", {
        type: "icon",
        value: "target",
        color: "#9ca3af",
      });
    });
    expect(useFolderSelection.getState().iconOverrides.Work).toEqual({
      type: "icon",
      value: "target",
      color: "#9ca3af",
    });
  });

  it("clears an optimistic folder icon when saving fails", async () => {
    mocks.folders = ["Work"];
    mocks.updateFolderIcon.mockRejectedValue(new Error("unavailable"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderFoldersWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Choose folder icon" }));
    fireEvent.click(screen.getByRole("button", { name: "target" }));

    await waitFor(() => {
      expect(mocks.updateFolderIcon).toHaveBeenCalledWith("Work", {
        type: "icon",
        value: "target",
        color: "#9ca3af",
      });
      expect(useFolderSelection.getState().iconOverrides.Work).toBeUndefined();
    });
    consoleError.mockRestore();
  });

  it("creates a subfolder from the folder actions menu", async () => {
    mocks.folders = ["Equipe"];
    mocks.createNamedFolder.mockResolvedValue("Equipe/MCO");

    renderFoldersWorkspace();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Folder actions" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "New subfolder…" }),
    );
    expect(await screen.findByText("New subfolder in Equipe")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), {
      target: { value: "MCO" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mocks.createNamedFolder).toHaveBeenCalledWith("Equipe/MCO");
    });
    expect(useFolderSelection.getState().selectedPath).toBe("Equipe/MCO");
    expect(useExpandedFolders.getState().expanded).toContain("Equipe");
  });

  it("creates a subfolder from the tree row menu", async () => {
    mocks.folders = ["Equipe", "Work"];
    mocks.createNamedFolder.mockResolvedValue("Work/Points");

    renderFoldersWorkspace();

    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "Work" }));
    expect(mocks.menu.map((entry) => entry.id)).toEqual([
      "new-subfolder",
      "new-note",
      "move",
      undefined,
      "delete",
    ]);
    act(() => mocks.menu[0]!.action!());
    expect(await screen.findByText("New subfolder in Work")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), {
      target: { value: "Points" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mocks.createNamedFolder).toHaveBeenCalledWith("Work/Points");
    });
  });

  it("shows the breadcrumb and the direct subfolders of a folder", () => {
    mocks.folders = ["Equipe", "Equipe/MCO", "Equipe/MCO/2026", "Equipe/RH"];
    useFolderSelection.setState({ selectedPath: "Equipe/MCO" });

    renderFoldersWorkspace();

    const breadcrumb = screen.getByRole("navigation", {
      name: "Parent folders",
    });
    expect(breadcrumb.textContent).toBe("Equipe›MCO");
    expect(screen.getByRole("button", { name: /2026/ }).textContent).toContain(
      "2026",
    );

    fireEvent.click(screen.getByRole("button", { name: "Equipe" }));
    expect(useFolderSelection.getState().selectedPath).toBe("Equipe");
  });

  it("lists only the direct subfolders and opens one", () => {
    mocks.folders = ["Equipe", "Equipe/MCO", "Equipe/MCO/2026", "Equipe/RH"];
    useFolderSelection.setState({ selectedPath: "Equipe" });

    renderFoldersWorkspace();

    expect(
      screen.queryByRole("navigation", { name: "Parent folders" }),
    ).toBeNull();
    const subfolders = screen
      .getByRole("heading", { name: "Subfolders" })
      .closest("section")!;
    const names = Array.from(subfolders.querySelectorAll("li button")).map(
      (button) => button.textContent,
    );
    expect(names).toHaveLength(2);
    expect(names[0]).toContain("MCO");
    expect(names[1]).toContain("RH");

    fireEvent.click(subfolders.querySelector("li button")!);
    expect(useFolderSelection.getState().selectedPath).toBe("Equipe/MCO");
  });

  it("moves a folder into another one", async () => {
    mocks.folders = ["Equipe", "MCO", "MCO/2026"];
    mocks.renameNamedFolder.mockResolvedValue("Equipe/MCO");
    useFolderSelection.setState({ selectedPath: "MCO" });
    useExpandedFolders.setState({ expanded: ["MCO"] });

    renderFoldersWorkspace();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Folder actions" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to…" }));
    const radios = await screen.findAllByRole("radio");
    // Ni le dossier lui-même, ni ses sous-dossiers ; pas de « racine » pour un
    // dossier déjà à la racine.
    expect(radios.map((radio) => radio.textContent)).toEqual(["Equipe"]);
    fireEvent.click(radios[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => {
      expect(mocks.renameNamedFolder).toHaveBeenCalledWith("MCO", "Equipe/MCO");
    });
    expect(useFolderSelection.getState().selectedPath).toBe("Equipe/MCO");
    expect(useExpandedFolders.getState().expanded).toEqual([
      "Equipe/MCO",
      "Equipe",
    ]);
  });

  it("moves a nested folder back to the top level", async () => {
    mocks.folders = ["Equipe", "Equipe/MCO"];
    mocks.renameNamedFolder.mockResolvedValue("MCO");
    useFolderSelection.setState({ selectedPath: "Equipe/MCO" });

    renderFoldersWorkspace();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Folder actions" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to…" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Top level" }));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => {
      expect(mocks.renameNamedFolder).toHaveBeenCalledWith("Equipe/MCO", "MCO");
    });
  });

  it("reports a name collision when moving a folder", async () => {
    mocks.folders = ["Equipe", "MCO"];
    mocks.renameNamedFolder.mockRejectedValue(
      new Error("folder_target_exists"),
    );
    useFolderSelection.setState({ selectedPath: "MCO" });

    renderFoldersWorkspace();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Folder actions" }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to…" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Equipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "A folder with this name already exists there.",
    );
    expect(useFolderSelection.getState().selectedPath).toBe("MCO");
  });
});
