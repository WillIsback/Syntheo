import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FicheFolderField } from "./fiche-folder";

import { createNoteInFolder } from "~/folders/project/folder-header-actions";
import { prepareNextNote } from "~/folders/project/prepare-next-note";

// Issue 498 : le dossier est un champ de la fiche Préparer. Rejoué sur une
// vraie base SQLite construite à partir des migrations, avec les vraies
// requêtes de session (lecture `useSession`, écriture `updateSession`), le
// vrai sélecteur de dossier et la vraie suggestion « même titre ».

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type SqlParams = import("node:sqlite").SQLInputValue[];

const mocks = vi.hoisted(() => ({
  database: null as null | import("node:sqlite").DatabaseSync,
  listeners: new Set<() => void>(),
  writes: [] as string[],
  openNew: vi.fn(),
  nextId: 0,
}));

function query(sql: string, params: unknown[] = []) {
  return mocks.database!.prepare(sql).all(...(params as SqlParams));
}

function notify() {
  mocks.listeners.forEach((listener) => listener());
}

vi.mock("~/db", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    liveQueryClient: {
      execute: async (sql: string, params?: unknown[]) => query(sql, params),
    },
    executeTransaction: async (
      statements: Array<{ sql: string; params: unknown[] }>,
    ) => {
      const database = mocks.database!;
      database.exec("BEGIN");
      try {
        const changes = statements.map(({ sql, params }) => {
          mocks.writes.push(sql);
          return database.prepare(sql).run(...(params as SqlParams)).changes;
        });
        database.exec("COMMIT");
        return changes;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      } finally {
        notify();
      }
    },
    useLiveQuery: (options: {
      sql: string;
      params?: unknown[];
      enabled?: boolean;
      mapRows?: (rows: Array<Record<string, unknown>>) => unknown;
    }) => {
      const [, refresh] = React.useReducer((count: number) => count + 1, 0);
      React.useEffect(() => {
        mocks.listeners.add(refresh);
        return () => {
          mocks.listeners.delete(refresh);
        };
      }, []);
      if (options.enabled === false) return { data: undefined };
      const rows = query(options.sql, options.params) as Array<
        Record<string, unknown>
      >;
      return { data: options.mapRows ? options.mapRows(rows) : rows };
    },
  };
});

// La commande Tauri de création, rejouée sur la base : une session avec son
// dossier, comme `create_session`.
vi.mock("@syntheo/plugin-session", () => ({
  commands: {
    createSession: async (input: { title: string; folder_path: string }) => {
      mocks.nextId += 1;
      const id = `new-${mocks.nextId}`;
      mocks
        .database!.prepare(
          "INSERT INTO sessions (id, owner_user_id, title, folder_path) VALUES (?, 'user-1', ?, ?)",
        )
        .run(id, input.title, input.folder_path);
      notify();
      return { status: "ok", data: id };
    },
  },
}));

vi.mock("~/session/folder-catalog", () => ({
  ensureFolderCatalog: async (path: string) => path,
  createNamedFolder: async (path: string) => {
    mocks.writes.push(`create folder ${path}`);
    mocks
      .database!.prepare("INSERT INTO folders (id, path) VALUES (?, ?)")
      .run(`folder-${path}`, path);
    notify();
    return path;
  },
}));

vi.mock("@syntheo/plugin-windows", () => ({
  commands: {},
  getCurrentWebviewWindowLabel: () => "main",
}));

vi.mock("~/store/zustand/tabs", () => {
  const state = { openNew: mocks.openNew };
  return {
    useTabs: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

function run(sql: string, ...params: SqlParams) {
  mocks.database!.prepare(sql).run(...params);
}

function addNote(id: string, title: string, folder: string, createdAt = "") {
  run(
    "INSERT INTO sessions (id, owner_user_id, title, folder_path, created_at) VALUES (?, 'user-1', ?, ?, COALESCE(NULLIF(?, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))",
    id,
    title,
    folder,
    createdAt,
  );
}

function storedFolder(id = "session-1") {
  const [row] = query("SELECT folder_path FROM sessions WHERE id = ?", [
    id,
  ]) as Array<{ folder_path: string }>;
  return row?.folder_path;
}

function openPicker(name: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByPlaceholderText("Search or create folder");
}

describe("folder field of the Prepare fiche on the real schema", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView ??= vi.fn();
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    schema = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(resolve(MIGRATIONS, name), "utf8"))
      .join("\n");
  });
  beforeEach(() => {
    const database = new DatabaseSync(":memory:");
    database.exec(schema);
    mocks.database = database;
    mocks.writes = [];
    mocks.nextId = 0;
    mocks.openNew.mockClear();
    addNote("session-1", "Point hebdo Atlas", "");
  });
  afterEach(() => {
    cleanup();
    mocks.listeners.clear();
  });

  it("asks to choose a folder when the note is not filed", () => {
    render(<FicheFolderField sessionId="session-1" />);

    const button = screen.getByRole("button", { name: "Choose a folder" });
    expect(button.textContent).toContain("Choose a folder");
    expect(button.getAttribute("data-fiche-folder")).toBeNull();
  });

  it("shows the folder of a filed note", () => {
    run(
      "UPDATE sessions SET folder_path = 'Clients/Boréal' WHERE id = 'session-1'",
    );
    render(<FicheFolderField sessionId="session-1" />);

    const button = screen.getByRole("button", {
      name: "Folder: Clients/Boréal",
    });
    expect(button.textContent).toContain("Clients/Boréal");
  });

  it("files the note in the chosen folder and shows it", async () => {
    addNote("other", "Entretien", "Recrutement");
    render(<FicheFolderField sessionId="session-1" />);

    openPicker("Choose a folder");
    fireEvent.click(screen.getByRole("option", { name: "Recrutement" }));

    await waitFor(() => expect(storedFolder()).toBe("Recrutement"));
    expect(
      await screen.findByRole("button", { name: "Folder: Recrutement" }),
    ).toBeTruthy();
  });

  it("creates a folder from the search and files the note in it", async () => {
    render(<FicheFolderField sessionId="session-1" />);

    const input = openPicker("Choose a folder");
    fireEvent.change(input, { target: { value: "Atlas" } });
    fireEvent.click(screen.getByRole("option", { name: 'Create "Atlas"' }));

    await waitFor(() => expect(storedFolder()).toBe("Atlas"));
    expect(mocks.writes).toContain("create folder Atlas");
  });

  it("suggests the folder holding a note with the same normalized title, without filing it", async () => {
    addNote("atlas-1", "point hebdo  ATLAS — 2 nov.", "Réunion produit Atlas");
    addNote("atlas-2", "Point hébdo Atlas 26/10/2026", "Réunion produit Atlas");
    addNote("other", "Point hebdo Boréal", "Clients/Boréal");
    render(<FicheFolderField sessionId="session-1" />);

    openPicker("Choose a folder");
    const suggested = screen.getByRole("group", { name: "Suggested" });
    const option = within(suggested).getByRole("option");
    expect(option.textContent).toContain("Réunion produit Atlas");
    expect(option.textContent).toContain("same title");

    // Ouvrir le sélecteur et voir la suggestion n'écrit rien.
    expect(mocks.writes).toEqual([]);
    expect(storedFolder()).toBe("");

    fireEvent.click(option);
    await waitFor(() => expect(storedFolder()).toBe("Réunion produit Atlas"));
  });

  it("suggests nothing without a note of the same title", () => {
    addNote("other", "Point hebdo Boréal", "Clients/Boréal");
    render(<FicheFolderField sessionId="session-1" />);

    openPicker("Choose a folder");
    expect(screen.queryByRole("group", { name: "Suggested" })).toBeNull();
    expect(screen.getByRole("option", { name: "Clients/Boréal" })).toBeTruthy();
  });

  it("does not suggest the folder the note is already in", () => {
    run("UPDATE sessions SET folder_path = 'Atlas' WHERE id = 'session-1'");
    addNote("atlas-1", "Point hebdo Atlas", "Atlas");
    render(<FicheFolderField sessionId="session-1" />);

    openPicker("Folder: Atlas");
    expect(screen.queryByRole("group", { name: "Suggested" })).toBeNull();
  });

  it("shows the folder of a note created with « New note in this folder »", async () => {
    const id = await createNoteInFolder("Réunion produit Atlas");
    render(<FicheFolderField sessionId={id} />);

    expect(
      screen.getByRole("button", { name: "Folder: Réunion produit Atlas" }),
    ).toBeTruthy();
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "sessions", id });
  });

  it("shows the folder of a note created with « Prepare the note »", async () => {
    const id = await prepareNextNote({
      folderPath: "Réunion produit Atlas",
      meetings: [
        {
          id: "atlas-1",
          title: "Point hebdo Atlas",
          createdAt: "2026-11-02T10:00:00Z",
          folderPath: "Réunion produit Atlas",
          summaryMarkdown: null,
          oneLine: null,
        },
      ],
      agenda: null,
      agendaHeading: "Agenda",
    });
    render(<FicheFolderField sessionId={id} />);

    expect(
      screen.getByRole("button", { name: "Folder: Réunion produit Atlas" }),
    ).toBeTruthy();
  });
});
