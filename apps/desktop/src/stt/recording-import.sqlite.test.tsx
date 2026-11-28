import { cleanup, render, screen } from "@testing-library/react";
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

import { recordingImportHeartbeat } from "./recording-import";

import { TranscriptionFailureNotice } from "~/session/components/living-document/transcription-failure";

// Issue 794 : un import d'agent interrompu (Syntheo fermé pendant la
// transcription) est passé en échec par le battement de cœur suivant. La
// réunion doit le dire, comme pour un échec pendant l'import. Vraie base
// SQLite construite à partir des migrations ; seules la base et l'IPC des
// plugins sont simulées.

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type SqlParams = import("node:sqlite").SQLInputValue[];

const mocks = vi.hoisted(() => ({
  database: null as null | import("node:sqlite").DatabaseSync,
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
  useLiveQuery: (options: {
    sql: string;
    params?: unknown[];
    enabled?: boolean;
    mapRows?: (rows: Array<Record<string, unknown>>) => unknown;
  }) => {
    if (options.enabled === false) return { data: undefined };
    const rows = query(options.sql, options.params) as Array<
      Record<string, unknown>
    >;
    return { data: options.mapRows ? options.mapRows(rows) : rows };
  },
}));
vi.mock("@syntheo/plugin-settings", () => ({
  commands: { vaultBase: async () => ({ status: "ok", data: "/vault" }) },
}));
vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ batch: {}, clearBatchSession: () => {} }),
}));
vi.mock("~/session/hooks/useDeleteSession", () => ({
  useDeleteSession: () => () => {},
}));
vi.mock("~/session/queries", () => ({
  useSession: () => null,
  useSessionSummary: () => ({ title: "Agent import" }),
}));

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

function insertJob(
  id: string,
  meetingId: string,
  status: string,
  { workerId = "previous-worker", ageSeconds = 600 } = {},
) {
  mocks.database!.exec(
    `INSERT INTO sessions (id, owner_user_id, title, metadata_json)
     VALUES ('${meetingId}', 'user-1', 'Agent import', '{"welcome_note":"kept"}')`,
  );
  mocks.database!.exec(
    `INSERT INTO local_recording_import_jobs
       (id, meeting_id, file_path, processing_status, worker_id, updated_at)
     VALUES ('${id}', '${meetingId}', '/recordings/call.wav', '${status}',
       '${workerId}', unixepoch() - ${ageSeconds})`,
  );
}

function jobStatus(id: string) {
  return query(
    "SELECT processing_status FROM local_recording_import_jobs WHERE id = ?",
    [id],
  )[0]?.processing_status;
}

function workerIds() {
  return query("SELECT id FROM local_recording_import_worker ORDER BY id").map(
    (row) => String(row.id),
  );
}

function metadata(meetingId: string) {
  return JSON.parse(
    String(
      query("SELECT metadata_json FROM sessions WHERE id = ?", [meetingId])[0]
        ?.metadata_json,
    ),
  ) as Record<string, unknown>;
}

describe("recording import heartbeat", () => {
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
    mocks.database = database;
  });

  afterEach(() => {
    cleanup();
    mocks.database?.close();
    mocks.database = null;
  });

  it("shows an agent import interrupted before the summary in its meeting", async () => {
    insertJob("job-1", "meeting-1", "transcribing");

    await recordingImportHeartbeat();

    const job = query(
      "SELECT processing_status, error FROM local_recording_import_jobs WHERE id = 'job-1'",
    )[0];
    expect(job?.processing_status).toBe("failed");
    expect(metadata("meeting-1")).toMatchObject({
      welcome_note: "kept",
      transcription_failure: { code: "agent_import" },
    });

    render(<TranscriptionFailureNotice sessionId="meeting-1" />);
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("The import requested by an agent failed.");
    expect(text).toContain("Syntheo was closed before the import finished.");
    expect(screen.getByRole("button", { name: "Delete note" })).toBeTruthy();
  });

  it("leaves the meeting alone when the summary was interrupted", async () => {
    insertJob("job-2", "meeting-2", "summarizing");

    await recordingImportHeartbeat();

    expect(
      query(
        "SELECT processing_status FROM local_recording_import_jobs WHERE id = 'job-2'",
      )[0]?.processing_status,
    ).toBe("failed");
    expect(metadata("meeting-2")).toEqual({ welcome_note: "kept" });
  });

  // Issue 816 : l'application est à instance unique et seule la fenêtre
  // principale porte le worker. Une tâche en cours tenue par un autre worker
  // a donc perdu son traitement : elle est interrompue au premier battement,
  // sans attendre les deux minutes du délai de péremption.
  it("interrupts at once a running job left by another worker", async () => {
    insertJob("job-3", "meeting-3", "transcribing", { ageSeconds: 5 });

    await recordingImportHeartbeat();

    expect(jobStatus("job-3")).toBe("failed");
    expect(metadata("meeting-3")).toMatchObject({
      transcription_failure: { code: "agent_import" },
    });
  });

  it("leaves a running job of the current worker alone", async () => {
    await recordingImportHeartbeat();
    const [current] = workerIds();
    insertJob("job-4", "meeting-4", "transcribing", {
      workerId: current,
      ageSeconds: 5,
    });

    await recordingImportHeartbeat();

    expect(jobStatus("job-4")).toBe("transcribing");
    expect(metadata("meeting-4")).toEqual({ welcome_note: "kept" });
  });

  // Issue 817 : un rechargement de l'interface (location.reload) relit le
  // module. Le worker garde son identifiant pour toute la vie de la fenêtre,
  // sinon sa propre tâche en cours passerait pour celle d'un worker disparu.
  // Base pour l'issue 817 : seul l'identifiant est vérifié ; la reprise de la
  // tâche jusqu'à done n'est pas livrée.
  it("keeps the same worker id and its running job after the interface reloads (base for issue 817)", async () => {
    await recordingImportHeartbeat();
    const [current] = workerIds();
    insertJob("job-5", "meeting-5", "transcribing", {
      workerId: current,
      ageSeconds: 5,
    });

    vi.resetModules();
    const reloaded = await import("./recording-import");
    await reloaded.recordingImportHeartbeat();

    expect(workerIds()).toEqual([current]);
    expect(jobStatus("job-5")).toBe("transcribing");
    expect(metadata("meeting-5")).toEqual({ welcome_note: "kept" });
  });

  // Issue 816 : après un rechargement, l'identifiant est le même mais le
  // nouveau chargement ne traite rien. La tâche en cours abandonnée par le
  // chargement précédent ne doit pas bloquer la file jusqu'à sa péremption :
  // la tâche en attente est prise tout de suite, l'abandonnée reste au
  // battement.
  it("picks a queued job at once when a reload abandoned a running job", async () => {
    await recordingImportHeartbeat();
    const [current] = workerIds();
    insertJob("job-6", "meeting-6", "transcribing", {
      workerId: current,
      ageSeconds: 5,
    });
    insertJob("job-7", "meeting-7", "queued");

    vi.resetModules();
    const reloaded = await import("./recording-import");

    expect(await reloaded.nextImportJob()).toEqual([
      {
        id: "job-7",
        meeting_id: "meeting-7",
        file_path: "/recordings/call.wav",
      },
    ]);
    expect(jobStatus("job-6")).toBe("transcribing");
  });
});
