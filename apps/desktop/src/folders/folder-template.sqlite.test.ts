import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadSessionFolderTemplateId,
  updateFolderTemplate,
} from "./folder-template";

// Modèle d'un dossier (issue 502) sur une vraie base SQLite construite à partir
// des migrations : écriture, héritage du parent, modèle supprimé ignoré.

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
  liveQueryClient: {
    execute: async (sql: string, params?: unknown[]) => query(sql, params),
  },
  executeTransaction: async (
    statements: Array<{ sql: string; params: unknown[] }>,
  ) =>
    statements.map(
      ({ sql, params }) =>
        mocks.database!.prepare(sql).run(...(params as SqlParams)).changes,
    ),
  useLiveQuery: () => ({ data: undefined }),
}));

vi.mock("~/session/folder-catalog", () => ({
  ensureFolderCatalog: async (path: string) => {
    mocks
      .database!.prepare(
        `INSERT INTO folders (id, path)
         SELECT lower(hex(randomblob(8))), ?
         WHERE NOT EXISTS (SELECT 1 FROM folders WHERE path = ?)`,
      )
      .run(path, path);
    return path;
  },
}));

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

describe("folder template storage", () => {
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
    database.exec(`
      INSERT INTO templates (id, title, created_at, updated_at)
      VALUES ('weekly', 'Point hebdo', '', ''), ('retro', 'Rétro', '', '');
      INSERT INTO sessions (id, owner_user_id, title, folder_path)
      VALUES ('session-1', 'user-1', 'Point', 'Clients/Atlas/Hebdo');
    `);
    mocks.database = database;
  });

  it("stores the folder template and resolves it from the nearest folder", async () => {
    expect(await loadSessionFolderTemplateId("session-1")).toBeUndefined();

    await updateFolderTemplate("Clients", "weekly");
    expect(await loadSessionFolderTemplateId("session-1")).toBe("weekly");

    await updateFolderTemplate("Clients/Atlas/Hebdo", "retro");
    expect(await loadSessionFolderTemplateId("session-1")).toBe("retro");

    // « Aucun » : retour au modèle du parent.
    await updateFolderTemplate("Clients/Atlas/Hebdo", "");
    expect(await loadSessionFolderTemplateId("session-1")).toBe("weekly");
    expect(
      query("SELECT path, template_id FROM folders ORDER BY path"),
    ).toEqual([
      { path: "Clients", template_id: "weekly" },
      { path: "Clients/Atlas/Hebdo", template_id: "" },
    ]);
  });

  it("ignores a deleted template and notes outside any folder", async () => {
    await updateFolderTemplate("Clients/Atlas", "retro");
    mocks.database!.exec("DELETE FROM templates WHERE id = 'retro'");
    expect(await loadSessionFolderTemplateId("session-1")).toBeUndefined();

    await updateFolderTemplate("Clients", "weekly");
    expect(await loadSessionFolderTemplateId("session-1")).toBe("weekly");

    mocks.database!.exec(
      "UPDATE sessions SET folder_path = '' WHERE id = 'session-1'",
    );
    expect(await loadSessionFolderTemplateId("session-1")).toBeUndefined();
  });
});
