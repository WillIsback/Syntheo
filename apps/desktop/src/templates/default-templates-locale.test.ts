import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/db", () => ({ executeTransaction: vi.fn() }));

import {
  DEFAULT_TEMPLATES_EN,
  LEGACY_DEFAULT_TEMPLATES_EN,
} from "./default-templates-en";
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
    // 21 depuis le français, plus 8 depuis les anciens textes anglais des
    // modèles syntheo-* (0.7.1 à 0.7.3, et alpha 0.7.1-2).
    expect(statements).toHaveLength(29);
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

  // Issue 616 : sections des modèles syntheo-* en Title Case, comme les modèles
  // généraux. Un modèle non modifié publié de 0.7.1 à 0.7.3 (sections en casse
  // de phrase) bascule encore de langue, et passe aux nouvelles sections.
  it("met en Title Case les sections des modèles syntheo-*", () => {
    expect(
      DEFAULT_TEMPLATES_EN["syntheo-general"]?.sections.map(([title]) => title),
    ).toEqual(["Participants", "Decisions Made", "Action Items", "Next Step"]);
    expect(
      DEFAULT_TEMPLATES_EN["syntheo-compliance"]?.sections.map(
        ([title]) => title,
      ),
    ).toEqual([
      "Context",
      "Decisions Made",
      "Blockers Before Production",
      "Residual Risks",
      "Next Step",
    ]);
    expect(
      DEFAULT_TEMPLATES_EN["syntheo-project"]?.sections.map(([title]) => title),
    ).toEqual(["Progress", "Blockers", "Next Steps"]);
    expect(
      DEFAULT_TEMPLATES_EN["syntheo-standup"]?.sections.map(([title]) => title),
    ).toEqual(["Done", "In Progress", "Blockers"]);
  });

  it.each([
    "syntheo-general",
    "syntheo-compliance",
    "syntheo-project",
    "syntheo-standup",
  ])("fait encore basculer %s publié en 0.7.3", (id) => {
    const published = LEGACY_DEFAULT_TEMPLATES_EN[id]![0]!;
    // Texte de 0.7.3 : titre actuel, sections en casse de phrase.
    expect(published.title).toBe(DEFAULT_TEMPLATES_EN[id]?.title);
    expect(published.sections).not.toEqual(DEFAULT_TEMPLATES_EN[id]?.sections);
    const stored = storedTemplateColumns(published);
    const matches = (statement: { params: string[] }) =>
      statement.params[5] === id &&
      JSON.stringify(statement.params.slice(6)) === JSON.stringify(stored);

    const toFrench = buildDefaultTemplateLocaleStatements("fr").find(matches);
    expect(toFrench?.params.slice(0, 5)).toEqual(
      storedTemplateColumns(DEFAULT_TEMPLATES_FR[id]!),
    );

    const toEnglish = buildDefaultTemplateLocaleStatements("en").find(matches);
    expect(toEnglish?.params.slice(0, 5)).toEqual(
      storedTemplateColumns(DEFAULT_TEMPLATES_EN[id]!),
    );
  });
});
