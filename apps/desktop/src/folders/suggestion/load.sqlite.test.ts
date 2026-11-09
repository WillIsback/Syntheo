import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { loadFolderSuggestion } from "./load";

// Lectures de la suggestion (issue 499) sur une vraie base SQLite construite à
// partir des migrations : participants hors propriétaire et hors exclus,
// modèle choisi sur la note, modèle par défaut du dossier, aucune écriture.

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

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

function totalChanges(): number {
  return Number(
    (
      mocks.database!.prepare("SELECT total_changes() AS n").get() as {
        n: number;
      }
    ).n,
  );
}

describe("loadFolderSuggestion", () => {
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
      VALUES ('weekly', 'Point hebdo', '', '');
      INSERT INTO folders (id, path, template_id)
      VALUES ('f1', 'Atlas', ''), ('f2', 'Borée', 'weekly');
      INSERT INTO sessions (id, owner_user_id, title, folder_path, created_at)
      VALUES
        ('new', 'me', 'Atelier', '', '2026-11-09'),
        ('a1', 'me', 'Revue', 'Atlas', '2026-11-02'),
        ('b1', 'me', 'Comité', 'Borée', '2026-11-01'),
        ('filed', 'me', 'Atelier bis', 'Atlas', '2026-11-03');
      INSERT INTO session_participants (id, session_id, human_id, source)
      VALUES
        ('p1', 'new', 'me', 'manual'),
        ('p2', 'new', 'ana', 'manual'),
        ('p3', 'new', 'bob', 'excluded'),
        ('p4', 'a1', 'ana', 'manual'),
        ('p5', 'a1', 'me', 'manual'),
        ('p6', 'b1', 'ana', 'manual');
      INSERT INTO session_documents (id, session_id, kind, template_id)
      VALUES ('new', 'new', 'note', 'weekly');
    `);
    mocks.database = database;
  });

  it("reads participants and templates without writing anything", async () => {
    // Le propriétaire et le participant exclu ne comptent pas : « ana »
    // seule est vue dans Atlas comme dans Borée, et le modèle de la note est
    // celui de Borée seulement.
    const before = totalChanges();
    expect(await loadFolderSuggestion("new")).toEqual({
      folderPath: "Borée",
      reasons: ["participants", "template"],
      score: 1.5,
    });
    expect(totalChanges()).toBe(before);
  });

  it("suggests nothing for a note that is already filed", async () => {
    expect(await loadFolderSuggestion("filed")).toBeNull();
    expect(await loadFolderSuggestion("missing")).toBeNull();
  });
});
