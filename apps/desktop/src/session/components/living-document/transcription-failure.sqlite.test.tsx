import {
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

import { TranscriptionFailureNotice } from "./transcription-failure";

import {
  clearTranscriptionFailure,
  recordTranscriptionFailure,
} from "~/session/transcription-failure";
import { NoSpeechDetectedError } from "~/stt/no-speech-error";

// Issue 559 : un import sans parole laissait la note vierge en « Préparer »,
// avant comme après la relance. L'échec est gardé dans la note, sur une vraie
// base SQLite construite à partir des migrations.

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type SqlParams = import("node:sqlite").SQLInputValue[];

const mocks = vi.hoisted(() => ({
  database: null as null | import("node:sqlite").DatabaseSync,
  listeners: new Set<() => void>(),
  clearBatchSession: vi.fn(),
}));

function query(sql: string, params: unknown[] = []) {
  return mocks.database!.prepare(sql).all(...(params as SqlParams));
}

vi.mock("~/db", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    executeTransaction: async (
      statements: Array<{ sql: string; params: unknown[] }>,
    ) => {
      try {
        return statements.map(
          ({ sql, params }) =>
            mocks.database!.prepare(sql).run(...(params as SqlParams)).changes,
        );
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
      if (options.enabled === false) return { data: undefined };
      const rows = query(options.sql, options.params) as Array<
        Record<string, unknown>
      >;
      return { data: options.mapRows ? options.mapRows(rows) : rows };
    },
  };
});

// L'état du listener est en mémoire : vide, comme après une relance.
vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ batch: {}, clearBatchSession: mocks.clearBatchSession }),
}));

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

function storedMetadata() {
  return query("SELECT metadata_json FROM sessions WHERE id = 'session-1'")[0]
    ?.metadata_json;
}

describe("TranscriptionFailureNotice", () => {
  beforeAll(() => {
    schema = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(resolve(MIGRATIONS, name), "utf8"))
      .join("\n");
  });

  beforeEach(() => {
    const database = new DatabaseSync(":memory:");
    database.exec(schema);
    database.exec(
      `INSERT INTO sessions (id, owner_user_id, title, metadata_json)
       VALUES ('session-1', 'user-1', 'Import', '{"welcome_note":"kept"}')`,
    );
    mocks.database = database;
    mocks.clearBatchSession.mockReset();
  });

  afterEach(() => {
    cleanup();
    mocks.database?.close();
    mocks.database = null;
  });

  it("still shows a no-speech failure after a relaunch, until dismissed", async () => {
    await recordTranscriptionFailure("session-1", new NoSpeechDetectedError());

    // Relance : nouvel affichage, état du listener vide.
    const first = render(<TranscriptionFailureNotice sessionId="session-1" />);
    first.unmount();
    render(<TranscriptionFailureNotice sessionId="session-1" />);

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("The audio transcription failed.");
    expect(notice.textContent).toContain(
      "No speech was detected in the audio.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mocks.clearBatchSession).toHaveBeenCalledWith("session-1");

    // Effacé durablement, sans toucher au reste des métadonnées.
    cleanup();
    render(<TranscriptionFailureNotice sessionId="session-1" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(JSON.parse(String(storedMetadata()))).toEqual({
      welcome_note: "kept",
    });
  });

  it("keeps the provider message for other failures", async () => {
    await recordTranscriptionFailure("session-1", new Error("Quota exceeded"));
    render(<TranscriptionFailureNotice sessionId="session-1" />);
    expect(screen.getByRole("alert").textContent).toContain("Quota exceeded");
  });

  it("shows nothing for a note without failure, and clearing it is harmless", async () => {
    await clearTranscriptionFailure("session-1");
    render(<TranscriptionFailureNotice sessionId="session-1" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(JSON.parse(String(storedMetadata()))).toEqual({
      welcome_note: "kept",
    });
  });
});
