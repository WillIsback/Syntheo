import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

// Page d'un dossier projet (issue 496) sur une vraie base SQLite construite à
// partir des migrations : vraies requêtes des réunions et du fil rouge, vrai
// éditeur de note. Seuls le modèle, les onglets et la création de note sont
// simulés.

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type SqlParams = import("node:sqlite").SQLInputValue[];

const mocks = vi.hoisted(() => ({
  database: null as null | import("node:sqlite").DatabaseSync,
  listeners: new Set<() => void>(),
  generateText: vi.fn(),
  createSession: vi.fn(),
  openNew: vi.fn(),
  transitionChatMode: vi.fn(),
}));

function query(sql: string, params: unknown[] = []) {
  return mocks.database!.prepare(sql).all(...(params as SqlParams));
}

function run(sql: string, params: unknown[] = []) {
  mocks.database!.prepare(sql).run(...(params as SqlParams));
}

function refreshLiveQueries() {
  act(() => {
    mocks.listeners.forEach((listener) => listener());
  });
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
        const changes = statements.map(
          ({ sql, params }) =>
            database.prepare(sql).run(...(params as SqlParams)).changes,
        );
        database.exec("COMMIT");
        return changes;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      } finally {
        mocks.listeners.forEach((listener) => listener());
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
      const enabled = options.enabled !== false;
      const rows = enabled
        ? (query(options.sql, options.params) as Array<Record<string, unknown>>)
        : [];
      const mapped = options.mapRows ? options.mapRows(rows) : rows;
      // Même identité tant que le résultat ne change pas, comme la vraie
      // requête vivante.
      const cache = React.useRef<{ key: string; data: unknown } | null>(null);
      const key = JSON.stringify(mapped);
      if (cache.current?.key !== key) {
        cache.current = { key, data: mapped };
      }
      return { data: enabled ? cache.current.data : undefined };
    },
  };
});

// Vraie Lingui (la configuration de test la simule) : pluriels compilés.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));

vi.mock("~/ai/hooks", () => ({
  useLanguageModel: () => ({ id: "local-model" }),
}));

vi.mock("~/editor-bridge/mention-config", () => ({
  useMentionConfig: () => undefined,
}));

vi.mock("~/editor-bridge/open-editor-link", () => ({
  openEditorLink: vi.fn(),
}));

vi.mock("~/session/folder-catalog", () => ({
  deleteNamedFolder: vi.fn(),
  renameNamedFolder: vi.fn(),
  updateFolderIcon: vi.fn(),
  updateFolderInstructions: vi.fn(),
  useFolderInstructions: () => "Projet Atlas : refonte de l'application.",
  ensureFolderCatalog: async (path: string) => {
    run(
      `INSERT INTO folders (id, path)
       SELECT lower(hex(randomblob(8))), ?
       WHERE NOT EXISTS (SELECT 1 FROM folders WHERE path = ?)`,
      [path, path],
    );
    return path;
  },
}));

vi.mock("~/session/queries", () => ({
  useFolderIcons: () => ({}),
  createSession: mocks.createSession,
}));

vi.mock("~/session/folder-attachments", () => ({
  deleteLocalFolderMaterial: vi.fn(),
  diskAttachmentId: (relativePath: string) => relativePath,
  useFolderMaterials: () => [],
}));

vi.mock("~/shared/hooks/useFileUpload", () => ({
  useFolderMaterialUpload: () => vi.fn(),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: Object.assign(() => undefined, {
    getState: () => ({
      openNew: mocks.openNew,
      transitionChatMode: mocks.transitionChatMode,
    }),
  }),
}));

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

import { FolderEditor } from "../folder-editor";
import { useFolderSelection } from "../selection";

import { messages as englishMessages } from "~/i18n/locales/en/messages";

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

function summary(title: string, text: string) {
  return JSON.stringify({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title }],
      },
      { type: "paragraph", content: [{ type: "text", text }] },
    ],
  });
}

function addMeeting({
  id,
  title,
  folder,
  createdAt,
  summaryText,
}: {
  id: string;
  title: string;
  folder: string;
  createdAt: string;
  summaryText?: string;
}) {
  run(
    `INSERT INTO sessions (id, owner_user_id, title, folder_path, created_at)
     VALUES (?, 'user-1', ?, ?, ?)`,
    [id, title, folder, createdAt],
  );
  if (summaryText) {
    run(
      `INSERT INTO session_documents (id, session_id, kind, title, body_format, body)
       VALUES (?, ?, 'summary', 'Summary', 'prosemirror_json', ?)`,
      [`summary:${id}`, id, summary(title, summaryText)],
    );
  }
}

function modelOutput(overrides: Record<string, unknown>) {
  return {
    output: {
      status: "",
      decisions: [],
      openPoints: [],
      tasks: [],
      resolvedOpenPoints: [],
      doneTasks: [],
      ...overrides,
    },
  };
}

function storedThread() {
  return query(
    `SELECT body, version, edited_at FROM folder_threads
     WHERE folder_id = 'folder-1'`,
  )[0] as { body: string; version: number; edited_at: string } | undefined;
}

function lastPayload() {
  const call = mocks.generateText.mock.calls[
    mocks.generateText.mock.calls.length - 1
  ]![0] as { prompt: string };
  return JSON.parse(call.prompt) as Record<string, any>;
}

function renderPage() {
  return render(
    <I18nProvider i18n={i18n}>
      <FolderEditor folderPath="Atlas" />
    </I18nProvider>,
  );
}

describe("Folder project page", () => {
  beforeAll(() => {
    // Catalogue anglais compilé : les pluriels s'affichent comme dans l'app.
    i18n.load("en", englishMessages);
    i18n.activate("en");
    Element.prototype.scrollIntoView ??= vi.fn();
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
    mocks.generateText.mockReset();
    mocks.createSession.mockReset();
    mocks.openNew.mockReset();
    mocks.transitionChatMode.mockReset();
    useFolderSelection.setState({
      selectedPath: null,
      deletedPrefixes: [],
      iconOverrides: {},
    });
    run("INSERT INTO folders (id, path) VALUES ('folder-1', 'Atlas')");
    addMeeting({
      id: "s1",
      title: "Atelier onboarding",
      folder: "Atlas/Ateliers",
      createdAt: "2026-10-19T09:00:00.000Z",
      summaryText: "Onboarding ramené à 3 écrans.",
    });
    addMeeting({
      id: "s2",
      title: "Point hebdo Atlas",
      folder: "Atlas",
      createdAt: "2026-10-26T09:00:00.000Z",
      summaryText: "Export PDF repoussé en v3 ; Marc doit chiffrer la recette.",
    });
    addMeeting({
      id: "s3",
      title: "Préparation recette",
      folder: "Atlas",
      createdAt: "2026-10-28T09:00:00.000Z",
    });
    addMeeting({
      id: "elsewhere",
      title: "Recrutement",
      folder: "Atlas 2",
      createdAt: "2026-10-27T09:00:00.000Z",
      summaryText: "Hors dossier.",
    });
  });

  afterEach(() => {
    cleanup();
    mocks.database?.close();
    mocks.database = null;
  });

  it("lists the meetings of the folder and its nested folders, most recent first", () => {
    renderPage();

    expect(screen.getByTestId("folder-meeting-stats").textContent).toBe(
      "3 meetings · since Oct 19 · last on Wed, Oct 28",
    );
    const titles = [
      ...document.querySelectorAll<HTMLButtonElement>("ol > li button"),
    ].map((button) => button.textContent);
    expect(titles).toEqual([
      "Préparation recette",
      "Point hebdo Atlas",
      "Atelier onboarding",
    ]);
    expect(
      screen.getByText(
        "Export PDF repoussé en v3 ; Marc doit chiffrer la recette.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Ateliers")).toBeTruthy();
    expect(screen.queryByText("Recrutement")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Point hebdo Atlas" }));
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "sessions", id: "s2" });
  });

  it("writes the thread on demand, persists a checked task and keeps it on the next update", async () => {
    mocks.generateText.mockResolvedValueOnce(
      modelOutput({
        status: "Atlas est en recette de la v2.",
        decisions: [{ text: "Export PDF repoussé en v3", meetingId: "s2" }],
        tasks: [{ text: "Marc — chiffrer la recette", meetingId: "s2" }],
      }),
    );
    renderPage();
    expect(screen.queryByTestId("folder-thread-freshness")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(screen.getByTestId("folder-thread-freshness").textContent).toBe(
        "up to date as of Oct 26",
      );
    });
    expect(
      lastPayload().meetings.map((m: { meetingId: string }) => m.meetingId),
    ).toEqual(["s1", "s2"]);
    expect(screen.getByText("Atlas est en recette de la v2.")).toBeTruthy();
    expect(storedThread()?.version).toBe(1);

    // La tâche cochée dans l'éditeur est enregistrée.
    fireEvent.click(document.querySelector("input.task-checkbox")!);
    await waitFor(
      () => {
        expect(storedThread()?.body).toContain('"status":"done"');
      },
      { timeout: 3_000 },
    );
    expect(storedThread()?.edited_at).not.toBe("");
    // L'éditeur ne transforme pas l'état du projet en titre de note.
    expect(JSON.parse(storedThread()!.body).content[0]).toMatchObject({
      type: "paragraph",
      content: [{ text: "Atlas est en recette de la v2." }],
    });

    // Une nouvelle réunion résumée : la pastille la compte.
    addMeeting({
      id: "s4",
      title: "Point hebdo Atlas",
      folder: "Atlas",
      createdAt: "2026-11-02T09:00:00.000Z",
      summaryText: "Date du 27 maintenue sous réserve.",
    });
    refreshLiveQueries();
    expect(screen.getByTestId("folder-thread-freshness").textContent).toBe(
      "up to date as of Oct 26 · 1 meeting since",
    );

    mocks.generateText.mockResolvedValueOnce(
      modelOutput({
        status: "La date du 27 est maintenue sous réserve.",
        openPoints: [{ text: "Date du 27 à confirmer", meetingId: "s4" }],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(storedThread()?.version).toBe(2);
    });
    const payload = lastPayload();
    expect(
      payload.meetings.map((m: { meetingId: string }) => m.meetingId),
    ).toEqual(["s4"]);
    expect(payload.existing_thread.tasks).toEqual([
      { index: 0, text: "Marc — chiffrer la recette", done: true },
    ]);
    const body = storedThread()!.body;
    expect(body).toContain('"status":"done"');
    expect(body).toContain("Date du 27 à confirmer");
    expect(body).toContain("Export PDF repoussé en v3");
    expect(query("SELECT version FROM folder_thread_versions")).toEqual([
      { version: 1 },
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("folder-thread-freshness").textContent).toBe(
        "up to date as of Nov 2",
      );
    });
  });

  it("creates a note filed in the folder and opens it at the Prepare step", async () => {
    mocks.createSession.mockResolvedValue("new-session");
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: "New note in this folder" }),
    );

    await waitFor(() => {
      expect(mocks.openNew).toHaveBeenCalledWith({
        type: "sessions",
        id: "new-session",
      });
    });
    expect(mocks.createSession).toHaveBeenCalledWith("", undefined, {
      folder_id: "Atlas",
    });
  });

  it("asks the folder in the chat", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Ask the folder" }));

    expect(useFolderSelection.getState().selectedPath).toBe("Atlas");
    expect(mocks.transitionChatMode).toHaveBeenCalledWith({ type: "OPEN" });
  });
});
