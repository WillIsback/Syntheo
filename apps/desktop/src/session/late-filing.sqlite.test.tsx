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

import { buildMoveMeetingsToFolderTool } from "~/chat/tools/folders";
import { FileNoteButton } from "~/home/file-note-button";
import { FolderPicker } from "~/session/components/folder-picker";

// Issue 534 : une note synthétisée en « Automatique », rangée dans un dossier
// qui a un modèle de compte rendu, doit recevoir la proposition de régénérer
// (issue 502), quel que soit le chemin de rangement. Les tests rejouent le
// rangement sur une vraie base SQLite construite à partir des migrations, avec
// les vraies requêtes de session (`useSession`, `updateSession`) et les vrais
// sélecteurs, sans le document de la note : la proposition ne dépend plus
// d'un écran ouvert.

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type SqlParams = import("node:sqlite").SQLInputValue[];

const mocks = vi.hoisted(() => ({
  database: null as null | import("node:sqlite").DatabaseSync,
  listeners: new Set<() => void>(),
  toast: vi.fn(),
  enhance: vi.fn(async () => ({ type: "started" })),
}));

function query(sql: string, params: unknown[] = []) {
  return mocks.database!.prepare(sql).all(...(params as SqlParams));
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
    // Live query: re-read the real database after every write.
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

vi.mock("@syntheo/ui/components/ui/toast", () => ({ toast: mocks.toast }));
vi.mock("~/templates/queries", () => ({
  getTemplateById: async (id: string) =>
    (query("SELECT id, title FROM templates WHERE id = ?", [id])[0] as
      | { id: string; title: string }
      | undefined) ?? null,
}));
vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => ({ enhance: mocks.enhance }),
}));
vi.mock("~/ai/task-window-sync", () => ({
  isMainAITaskHostWindow: () => true,
  requestMainEnhance: vi.fn(),
}));
vi.mock("@syntheo/plugin-windows", () => ({
  commands: { windowEmitNavigate: vi.fn(), windowShow: vi.fn() },
  getCurrentWebviewWindowLabel: () => "main",
}));
vi.mock("~/folders/selection", () => ({
  useFolderSelection: (selector: (state: object) => unknown) =>
    selector({ setSelectedPath: vi.fn() }),
}));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: object) => unknown) =>
    selector({ openNew: vi.fn() }),
}));
vi.mock("~/session/folder-catalog", () => ({
  createNamedFolder: async (path: string) => path,
  ensureFolderCatalog: async (path: string) => path,
}));

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

const WRITTEN_SUMMARY = JSON.stringify({
  type: "doc",
  content: [
    { type: "heading", content: [{ type: "text", text: "Décisions" }] },
    { type: "paragraph", content: [{ type: "text", text: "On livre jeudi." }] },
  ],
});

function seed({
  summaryTemplateId = "",
  noteTemplateId = "",
  folderTemplateId = "default-daily-standup",
  withSummary = true,
}: {
  summaryTemplateId?: string;
  noteTemplateId?: string;
  folderTemplateId?: string;
  withSummary?: boolean;
} = {}) {
  const database = mocks.database!;
  database.exec(`
    INSERT INTO sessions (id, owner_user_id, title)
    VALUES ('session-1', 'user-1', 'Point d''équipe');
    INSERT INTO folders (id, path) VALUES ('folder-perso', 'Perso');
  `);
  database
    .prepare("INSERT INTO folders (id, path, template_id) VALUES (?, ?, ?)")
    .run("folder-atlas", "Atlas", folderTemplateId);
  database
    .prepare(
      "INSERT INTO session_documents (id, session_id, kind, template_id, body_format, body) VALUES ('session-1', 'session-1', 'note', ?, 'prosemirror_json', '')",
    )
    .run(noteTemplateId);
  if (withSummary) {
    database
      .prepare(
        "INSERT INTO session_documents (id, session_id, kind, template_id, body_format, body) VALUES ('summary:session-1', 'session-1', ?, ?, 'prosemirror_json', ?)",
      )
      .run(
        summaryTemplateId ? "template_output" : "summary",
        summaryTemplateId,
        WRITTEN_SUMMARY,
      );
  }
}

function storedFolder() {
  const [row] = query(
    "SELECT folder_path FROM sessions WHERE id = 'session-1'",
  ) as Array<{ folder_path: string }>;
  return row?.folder_path;
}

async function fileWithHeaderPicker(folder: string) {
  render(<FolderPicker sessionId="session-1" />);
  fireEvent.click(screen.getByRole("combobox", { name: "Select folder" }));
  fireEvent.click(await screen.findByRole("option", { name: folder }));
  await waitFor(() => expect(storedFolder()).toBe(folder));
}

async function expectNoProposal() {
  await act(() => new Promise((done) => setTimeout(done, 30)));
  expect(mocks.toast).not.toHaveBeenCalled();
}

describe("late filing proposal on every filing path", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView ??= vi.fn();
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
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
  });
  afterEach(() => {
    cleanup();
    mocks.listeners.clear();
    mocks.toast.mockReset();
    mocks.enhance.mockClear();
  });

  // Le cas relevé par William sur l'alpha 0.7.0-7.
  it("offers to regenerate an Automatic summary filed with the note header folder picker", async () => {
    seed();
    await fileWithHeaderPicker("Atlas");

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    const [message, options] = mocks.toast.mock.calls[0]!;
    expect(message).toBe("This folder uses the Standup quotidien template");
    // Rien n'est réécrit sans accord.
    expect(mocks.enhance).not.toHaveBeenCalled();

    options.action.onClick();
    expect(mocks.enhance).toHaveBeenCalledWith("session-1", {
      templateId: "default-daily-standup",
      targetNoteId: "summary:session-1",
      templateTitle: "Standup quotidien",
    });
  });

  it("offers it when the note is filed from the home « File » button", async () => {
    seed();
    render(<FileNoteButton sessionId="session-1" />);
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(await screen.findByRole("option", { name: "Atlas" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    expect(storedFolder()).toBe("Atlas");
  });

  it("offers it when the chat moves the note into the folder", async () => {
    seed();
    const tool = buildMoveMeetingsToFolderTool();
    const output = await tool.execute!(
      { meeting_ids: ["session-1"], folder_path: "Atlas" },
      { toolCallId: "call-1", messages: [], context: {} },
    );

    expect(output).toMatchObject({ status: "ok", moved: 1 });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
  });

  it("offers it for a folder that inherits the template of its parent", async () => {
    seed();
    mocks.database!.exec(
      "INSERT INTO folders (id, path) VALUES ('folder-hebdo', 'Atlas/Hebdo')",
    );
    await fileWithHeaderPicker("Atlas/Hebdo");

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
  });

  it("stays quiet when the summary already uses the folder template", async () => {
    seed({ summaryTemplateId: "default-daily-standup" });
    await fileWithHeaderPicker("Atlas");
    await expectNoProposal();
  });

  it("stays quiet when the note has a chosen template", async () => {
    seed({ noteTemplateId: "default-one-on-one-meeting" });
    await fileWithHeaderPicker("Atlas");
    await expectNoProposal();
  });

  it("stays quiet for a folder without a template", async () => {
    seed();
    await fileWithHeaderPicker("Perso");
    await expectNoProposal();
  });

  it("stays quiet for a note that has no summary yet", async () => {
    seed({ withSummary: false });
    await fileWithHeaderPicker("Atlas");
    await expectNoProposal();
  });
});
