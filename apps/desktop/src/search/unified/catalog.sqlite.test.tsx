import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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

// Issue 799 : une réunion importée par un agent (CLI ou MCP, autre processus)
// doit apparaître dans la palette sans relancer l'application.
//
// Vraie base SQLite construite à partir des migrations (déclencheurs de
// search_index_dirty compris) et vrai hook useLiveQuery de packages/db-react.
// Seule la frontière IPC est simulée : le client de requêtes vives reproduit le
// moteur Rust (crates/db-reactive) : dépendances lues dans EXPLAIN QUERY PLAN,
// rafraîchissement seulement quand une table lue est écrite PAR L'APPLICATION
// (le crochet de mise à jour SQLite ne voit pas les écritures d'un autre
// processus), premier résultat livré de façon asynchrone (« en chargement »).

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type SqlParams = import("node:sqlite").SQLInputValue[];
type Row = Record<string, unknown>;

type Subscription = {
  sql: string;
  params: unknown[];
  tables: Set<string>;
  onData: (rows: unknown[]) => void;
};

type Database = InstanceType<typeof DatabaseSync>;

const fake = vi.hoisted(() => ({
  // Base ouverte par chaque test (beforeEach), fermée après.
  database: undefined as unknown as Database,
  subscriptions: new Set<Subscription>(),
}));

function query(sql: string, params: unknown[] = []): Row[] {
  return fake.database.prepare(sql).all(...(params as SqlParams)) as Row[];
}

// Même lecture que crates/db-reactive (explain.rs) : tables des lignes
// SCAN/SEARCH du plan, alias résolus vers leur table.
function dependencies(sql: string): Set<string> {
  const plan = query(`EXPLAIN QUERY PLAN ${sql}`, []) as Array<{
    detail: string;
  }>;
  const tables = new Set<string>();
  for (const { detail } of plan) {
    const match = /^(?:SCAN|SEARCH) (\w+)/.exec(detail.trim());
    if (!match) continue;
    const name = match[1]!;
    const aliased = new RegExp(`(\\w+)\\s+(?:AS\\s+)?${name}\\b`, "i").exec(
      sql,
    );
    tables.add(
      aliased && aliased[1]!.toUpperCase() !== "FROM" ? aliased[1]! : name,
    );
  }
  return tables;
}

// Écriture faite par l'application : le moteur prévient les requêtes vives
// qui lisent une des tables touchées.
function writeFromApp(sql: string, params: unknown[], tables: string[]) {
  fake.database.prepare(sql).run(...(params as SqlParams));
  for (const subscription of fake.subscriptions) {
    if (tables.some((table) => subscription.tables.has(table))) {
      subscription.onData(query(subscription.sql, subscription.params));
    }
  }
}

// Écriture d'un autre processus (CLI, MCP) : aucune notification.
function writeFromOtherProcess(sql: string, params: unknown[] = []) {
  fake.database.prepare(sql).run(...(params as SqlParams));
}

vi.mock("~/db", async () => {
  const { createUseLiveQuery } =
    await vi.importActual<typeof import("@syntheo/db-react")>(
      "@syntheo/db-react",
    );
  const client = {
    execute: async (sql: string, params: unknown[] = []) => query(sql, params),
    subscribe: async (
      sql: string,
      params: unknown[],
      options: { onData: (rows: unknown[]) => void },
    ) => {
      const subscription: Subscription = {
        sql,
        params,
        tables: dependencies(sql),
        onData: options.onData,
      };
      fake.subscriptions.add(subscription);
      queueMicrotask(() => {
        if (fake.subscriptions.has(subscription)) {
          subscription.onData(query(sql, params));
        }
      });
      return async () => {
        fake.subscriptions.delete(subscription);
      };
    },
  };
  return {
    liveQueryClient: client,
    useLiveQuery: createUseLiveQuery(client as never),
  };
});

import { useSearchNotes } from "./catalog";

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

const INSERT_SESSION = `INSERT INTO sessions (id, owner_user_id, title, folder_path, created_at)
  VALUES (?, 'user-1', ?, '', ?)`;

// Ce que fait le moteur d'indexation de l'application (search_index.rs)
// après avoir indexé une entité, y compris une écrite par un autre processus.
function acknowledgeSearchIndex() {
  writeFromApp(
    `UPDATE search_index_dirty SET acknowledged_generation = generation
     WHERE acknowledged_generation < generation`,
    [],
    ["search_index_dirty"],
  );
}

function titles(notes: Array<{ title: string }>) {
  return notes.map((note) => note.title);
}

describe("useSearchNotes (palette)", () => {
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
    fake.database = database;
    fake.subscriptions.clear();
    writeFromApp(
      INSERT_SESSION,
      ["s1", "Point hebdo", "2026-11-01T09:00:00.000Z"],
      ["sessions"],
    );
    acknowledgeSearchIndex();
  });

  afterEach(() => {
    cleanup();
    fake.subscriptions.clear();
    fake.database.close();
  });

  it("montre une réunion créée par l'application", async () => {
    const { result } = renderHook(() => useSearchNotes());
    await waitFor(() =>
      expect(titles(result.current)).toEqual(["Point hebdo"]),
    );

    act(() => {
      writeFromApp(
        INSERT_SESSION,
        ["s2", "Atelier", "2026-11-02T09:00:00.000Z"],
        ["sessions"],
      );
    });

    await waitFor(() =>
      expect(titles(result.current)).toEqual(["Atelier", "Point hebdo"]),
    );
  });

  it("montre une réunion importée par un agent dès que l'index l'a traitée", async () => {
    const { result } = renderHook(() => useSearchNotes());
    await waitFor(() =>
      expect(titles(result.current)).toEqual(["Point hebdo"]),
    );

    // La CLI insère la réunion dans son propre processus : le déclencheur
    // marque la note à indexer, mais l'application n'en est pas prévenue.
    writeFromOtherProcess(INSERT_SESSION, [
      "agent-1",
      "Entretien importé",
      "2026-11-03T09:00:00.000Z",
    ]);
    expect(
      query(
        "SELECT generation > acknowledged_generation AS pending FROM search_index_dirty WHERE entity_id = 'agent-1'",
      ),
    ).toEqual([{ pending: 1 }]);

    // L'application indexe la note et acquitte search_index_dirty.
    act(() => {
      acknowledgeSearchIndex();
    });

    await waitFor(() =>
      expect(titles(result.current)).toEqual([
        "Entretien importé",
        "Point hebdo",
      ]),
    );
  });
});
