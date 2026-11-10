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
    // 21 depuis le français, plus 4 depuis les anciens titres anglais.
    expect(statements).toHaveLength(25);
    const general = statements.find(
      (statement) =>
        statement.params[5] === "syntheo-general" &&
        statement.params[6] === "Réunion générale",
    );
    expect(general?.params.slice(0, 1)).toEqual(["General Meeting"]);
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

  // Issue 560 : titres anglais des modèles syntheo-* en Title Case. Les notes
  // déjà passées en anglais avec l'ancien titre (alpha 0.7.1-2) suivent encore
  // la langue de l'interface.
  it.each([
    ["syntheo-general", "General meeting", "General Meeting"],
    [
      "syntheo-compliance",
      "Compliance / GDPR committee",
      "Compliance / GDPR Committee",
    ],
    [
      "syntheo-project",
      "Project / Sprint check-in",
      "Project / Sprint Check-In",
    ],
    ["syntheo-standup", "Team standup", "Team Standup"],
  ])(
    "met à jour %s depuis son ancien titre anglais",
    (id, oldTitle, newTitle) => {
      expect(DEFAULT_TEMPLATES_EN[id]?.title).toBe(newTitle);

      const toEnglish = buildDefaultTemplateLocaleStatements("en").find(
        (statement) =>
          statement.params[5] === id && statement.params[6] === oldTitle,
      );
      expect(toEnglish?.params[0]).toBe(newTitle);

      const toFrench = buildDefaultTemplateLocaleStatements("fr").find(
        (statement) =>
          statement.params[5] === id && statement.params[6] === oldTitle,
      );
      expect(toFrench?.params[0]).toBe(DEFAULT_TEMPLATES_FR[id]?.title);
    },
  );
});
