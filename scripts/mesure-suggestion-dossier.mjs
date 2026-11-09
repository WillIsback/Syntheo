// Mesure de la suggestion de dossier après la réunion (issue 499).
//
// Rejoue la règle de l'application sur les notes déjà rangées d'une base
// Syntheo : chaque note rangée est virtuellement retirée de son dossier, puis
// on regarde si la règle propose le bon dossier. La base est ouverte en
// lecture seule ; travaillez de préférence sur une copie (avec ses fichiers
// -wal et -shm). Hors CI : à lancer à la main.
//
// N'affiche que des chiffres agrégés : jamais de titre, de participant ni de
// contenu de note.
//
// Usage :
//   node scripts/mesure-suggestion-dossier.mjs <chemin/app.db> [--json]

import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

const SUGGESTION_DIR = new URL(
  "../apps/desktop/src/folders/suggestion/",
  import.meta.url,
);

async function loadRule() {
  const [measure, sql] = await Promise.all([
    import(new URL("measure.ts", SUGGESTION_DIR).href),
    import(new URL("sql.ts", SUGGESTION_DIR).href),
  ]);
  return { ...measure, ...sql };
}

function hasColumn(db, table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
}

export async function measureDatabase(path) {
  const rule = await loadRule();
  const url = `${pathToFileURL(resolve(path)).href}?mode=ro`;
  const db = new DatabaseSync(url, { readOnly: true });
  try {
    const notes = rule.mapSuggestionNoteRows(
      db.prepare(rule.SUGGESTION_NOTES_SQL).all(),
    );
    // Une base antérieure à la 0.7.0 n'a pas encore de modèle par dossier.
    const folderTemplates = hasColumn(db, "folders", "template_id")
      ? rule.mapSuggestionFolderTemplateRows(
          db.prepare(rule.SUGGESTION_FOLDER_TEMPLATES_SQL).all(),
        )
      : new Map();
    const measure = rule.measureFolderSuggestion({ notes, folderTemplates });
    return {
      ...measure,
      folderTemplates: folderTemplates.size,
      threshold: rule.FOLDER_SUGGESTION_MIN_PRECISION,
      reliable: rule.isFolderSuggestionReliable(measure.precision),
    };
  } finally {
    db.close();
  }
}

function percent(value) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)} %`;
}

function report(result) {
  const lines = [
    `Notes rangées            : ${result.filedNotes}`,
    `Dossiers (avec notes)    : ${result.folders}`,
    `Dossiers avec un modèle  : ${result.folderTemplates}`,
    `Suggestions faites       : ${result.suggestions}`,
    `Suggestions justes       : ${result.correct}`,
    `Précision                : ${percent(result.precision)}`,
    `Rappel                   : ${percent(result.recall)}`,
    `Notes sans suggestion    : ${result.withoutSuggestion}`,
    "Raisons (faites / justes) :",
    ...Object.entries(result.reasons).map(
      ([reason, count]) =>
        `  ${reason.padEnd(13)}: ${count.made} / ${count.correct}`,
    ),
    "Échecs :",
    `  mauvais dossier        : ${result.failures.wrongFolder}` +
      ` (dont bon dossier aussi candidat : ${result.failures.wrongFolderTrueWasCandidate})`,
    `  aucune suggestion      : ${result.failures.noSuggestion}` +
      ` (dont seule note du dossier : ${result.failures.noSuggestionAloneInFolder},` +
      ` sans participant : ${result.failures.noSuggestionWithoutParticipants})`,
    `Seuil d'activation       : ${percent(result.threshold)}`,
    `Bannière activable       : ${result.reliable ? "oui" : "non"}`,
  ];
  return lines.join("\n");
}

async function main(argv) {
  const json = argv.includes("--json");
  const path = argv.find((arg) => !arg.startsWith("--"));
  if (!path) {
    console.error(
      "Usage : node scripts/mesure-suggestion-dossier.mjs <chemin/app.db> [--json]",
    );
    process.exitCode = 2;
    return;
  }
  const result = await measureDatabase(path);
  console.log(json ? JSON.stringify(result, null, 2) : report(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2));
}
