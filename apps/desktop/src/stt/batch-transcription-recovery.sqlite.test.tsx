import { cleanup, render, waitFor } from "@testing-library/react";
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

import type { TranscriptionSession } from "@syntheo/plugin-transcription";

import { serializeBatchResumeContext } from "./batch-resume-context";
import { BatchTranscriptionRecovery } from "./batch-transcription-recovery";
import { recoverInterruptedImports } from "./interrupted-imports";

import { markImportPending } from "~/session/transcription-failure";

// Issue 822 : un import d'audio repris après un rechargement de la vue doit
// retirer le marqueur « import en cours ». Sinon, au lancement suivant,
// l'import est annoncé « interrompu » alors que sa transcription est là. Vraie
// base SQLite construite à partir des migrations ; seules la base, la
// transcription (runBatch) et l'interface sont simulées.

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type SqlParams = import("node:sqlite").SQLInputValue[];

const mocks = vi.hoisted(() => ({
  database: null as null | import("node:sqlite").DatabaseSync,
  runBatch: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  sessions: [] as TranscriptionSession[],
}));

function query(sql: string, params: unknown[] = []) {
  return mocks.database!.prepare(sql).all(...(params as SqlParams));
}

vi.mock("~/db", () => ({
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
    }
  },
  liveQueryClient: {
    execute: async (sql: string, params: unknown[] = []) => query(sql, params),
  },
  useLiveQuery: () => ({ data: undefined }),
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { error: mocks.toastError, warning: mocks.toastWarning },
}));
vi.mock("~/store/zustand/listener/general-batch", () => ({
  acknowledgeCompletedBatch: async () => {},
  recoverRunningBatchSessions: async (
    _get: unknown,
    onResumable: (sessions: TranscriptionSession[]) => void,
  ) => {
    onResumable(mocks.sessions);
    return () => {};
  },
}));
vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: {
    getState: () => ({
      handleBatchFailed: () => {},
      batch: { "session-1": {} },
    }),
  },
}));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: () => {} }) },
}));
vi.mock("~/session/queries", () => ({
  useSession: (id: string) => ({ id, title: "Entretien Atelier Brun" }),
}));
vi.mock("~/services/enhancer", () => ({ getEnhancerService: () => null }));
vi.mock("~/stt/useSTTConnection", () => ({
  useSTTConnection: () => ({ isLoading: false }),
}));
vi.mock("~/stt/useRunBatch", () => ({
  useRunBatch: () => mocks.runBatch,
  isStoppedTranscriptionError: (error: unknown) =>
    error instanceof Error && error.message === "Transcription stopped.",
}));

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

const SESSION: TranscriptionSession = {
  session_id: "session-1",
  file_path: "/home/me/Videos/entretien.mp4",
  provider: "realtime",
  model: "nvidia-streaming",
  started_at_ms: 0,
  resume_context: serializeBatchResumeContext({ promotion: "whole_session" }),
  completed: true,
};

function metadata(): Record<string, unknown> {
  return JSON.parse(
    String(
      query("SELECT metadata_json FROM sessions WHERE id = 'session-1'")[0]
        ?.metadata_json,
    ),
  ) as Record<string, unknown>;
}

async function resumeAfterReload() {
  render(<BatchTranscriptionRecovery />);
  await waitFor(() => expect(mocks.runBatch).toHaveBeenCalledTimes(1));
  // Laisse la chaîne de la reprise (succès, échec, nettoyage) se terminer.
  await waitFor(() =>
    expect(metadata()).not.toHaveProperty("transcription_pending"),
  ).catch(() => {});
}

async function nextLaunch() {
  // Au lancement suivant, le natif ne reprend plus rien.
  await recoverInterruptedImports(() => false);
}

describe("resumed audio import and its pending marker", () => {
  beforeAll(() => {
    schema = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(resolve(MIGRATIONS, name), "utf8"))
      .join("\n");
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const database = new DatabaseSync(":memory:");
    database.exec(schema);
    database.exec(
      `INSERT INTO sessions (id, owner_user_id, title, metadata_json)
       VALUES ('session-1', 'user-1', 'Entretien Atelier Brun', '{}')`,
    );
    mocks.database = database;
    mocks.sessions = [SESSION];
    await markImportPending("session-1", "entretien.mp4");
  });

  afterEach(() => {
    cleanup();
    mocks.database?.close();
    mocks.database = null;
  });

  it("clears the marker after a successful resume, so the next launch stays quiet", async () => {
    mocks.runBatch.mockResolvedValue(undefined);

    await resumeAfterReload();
    expect(metadata()).not.toHaveProperty("transcription_pending");

    await nextLaunch();
    expect(metadata()).not.toHaveProperty("transcription_failure");
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("keeps the resume failure, without a second interrupted notice", async () => {
    mocks.runBatch.mockRejectedValue(new Error("Server error (500)."));

    await resumeAfterReload();
    await waitFor(() =>
      expect(metadata()).toHaveProperty("transcription_failure"),
    );
    expect(metadata()).not.toHaveProperty("transcription_pending");
    const failure = metadata().transcription_failure as { code: unknown };
    expect(failure.code).not.toBe("interrupted");
    expect(mocks.toastError).toHaveBeenCalledTimes(1);

    await nextLaunch();
    expect(
      (metadata().transcription_failure as { code: unknown }).code,
    ).not.toBe("interrupted");
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it("clears the marker when the user stops the resume, like a direct import", async () => {
    mocks.runBatch.mockRejectedValue(new Error("Transcription stopped."));

    await resumeAfterReload();
    expect(metadata()).not.toHaveProperty("transcription_pending");

    await nextLaunch();
    expect(metadata()).not.toHaveProperty("transcription_failure");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
