import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Issue 798 : une réunion importée par un agent pouvait avoir metadata_json = ''.
// La requête de la pastille flottante lisait alors json_extract sur un texte
// qui n'est pas du JSON et échouait pour toutes les réunions. Seule la base est
// simulée ici, par une vraie base SQLite construite à partir des migrations.

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

type SqlParams = import("node:sqlite").SQLInputValue[];

const mocks = vi.hoisted(() => ({
  database: null as null | import("node:sqlite").DatabaseSync,
}));

vi.mock("~/db", () => ({
  liveQueryClient: {
    execute: async (sql: string, params: unknown[] = []) =>
      mocks.database!.prepare(sql).all(...(params as SqlParams)),
  },
}));

import { loadMeetingFloatData } from "./hooks";

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");

describe("meeting float query on the real schema", () => {
  beforeEach(() => {
    const database = new DatabaseSync(":memory:");
    for (const file of readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      database.exec(readFileSync(resolve(MIGRATIONS, file), "utf8"));
    }
    database.exec(`
      INSERT INTO humans (id, name, email) VALUES ('self', 'Moi', 'moi@example.org');
      INSERT INTO sessions (id, owner_user_id, title, metadata_json)
        VALUES ('imported', 'self', 'Import', '');
      INSERT INTO sessions (id, owner_user_id, title, metadata_json)
        VALUES ('live', 'self', 'Réunion', json_object('speaker_context', json_object('intervals', json_array())));
    `);
    mocks.database = database;
  });

  afterEach(() => {
    mocks.database?.close();
    mocks.database = null;
  });

  it("loads every meeting when one has empty metadata", async () => {
    const data = await loadMeetingFloatData();

    expect(Object.keys(data.sessions).sort()).toEqual(["imported", "live"]);
    expect(data.sessions.imported?.title).toBe("Import");
    expect(data.sessions.imported?.speakerContext.intervals).toEqual([]);
    expect(data.sessions.live?.title).toBe("Réunion");
  });
});
