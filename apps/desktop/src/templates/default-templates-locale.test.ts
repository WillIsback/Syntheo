import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/db", () => ({ executeTransaction: vi.fn() }));

import { DEFAULT_TEMPLATES_EN } from "./default-templates-en";
import { DEFAULT_TEMPLATES_FR } from "./default-templates-fr";
import {
  buildDefaultTemplateLocaleStatements,
  storedTemplateColumns,
} from "./default-templates-locale";

// Vitest s'exécute avec cwd = apps/desktop.
function readMigration(name: string): string {
  return readFileSync(
    resolve(process.cwd(), `../../crates/db-app/migrations/${name}.sql`),
    "utf8",
  );
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

describe("modèles fournis bilingues", () => {
  it("couvre les mêmes modèles en français et en anglais", () => {
    expect(Object.keys(DEFAULT_TEMPLATES_EN).sort()).toEqual(
      Object.keys(DEFAULT_TEMPLATES_FR).sort(),
    );
    expect(Object.keys(DEFAULT_TEMPLATES_FR)).toHaveLength(21);
  });

  it("reprend mot pour mot les textes français de la migration", () => {
    const sql = readMigration("20261024120000_syntheo_templates_fr");
    for (const text of Object.values(DEFAULT_TEMPLATES_FR)) {
      for (const column of storedTemplateColumns(text)) {
        expect(sql).toContain(sqlLiteral(column));
      }
    }
  });

  it("reprend mot pour mot les textes anglais d'origine", () => {
    const sql = readMigration("20260524000000_default_templates");
    for (const [id, text] of Object.entries(DEFAULT_TEMPLATES_EN)) {
      if (!id.startsWith("default-")) continue;
      for (const column of storedTemplateColumns(text)) {
        expect(sql).toContain(sqlLiteral(column));
      }
    }
  });
});

describe("buildDefaultTemplateLocaleStatements", () => {
  it("ne remplace que les modèles encore identiques à l'autre langue", () => {
    const statements = buildDefaultTemplateLocaleStatements("en");
    expect(statements).toHaveLength(21);
    const general = statements.find(
      (statement) => statement.params[5] === "syntheo-general",
    );
    expect(general?.params.slice(0, 1)).toEqual(["General meeting"]);
    expect(general?.params.slice(6)).toEqual(
      storedTemplateColumns(DEFAULT_TEMPLATES_FR["syntheo-general"]!),
    );
    expect(general?.sql).toContain("AND sections_json = ?");
  });

  it("ramène les modèles anglais non modifiés en français", () => {
    const statements = buildDefaultTemplateLocaleStatements("fr");
    const board = statements.find(
      (statement) => statement.params[5] === "default-board-meeting",
    );
    expect(board?.params[0]).toBe("Conseil d'administration");
    expect(board?.params[6]).toBe("Board Meeting");
  });
});
