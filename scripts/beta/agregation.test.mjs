// Tests de l'agrégation des exports de mesure (issue 673), sur des exports
// synthétiques générés ici : aucune donnée réelle.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  aggregate,
  bootstrapByTester,
  checkExport,
  csvCell,
  dictionaryTerms,
  insufficientMessage,
  loadDirectory,
  median,
  renderCsv,
  renderMarkdown,
  resolveDuplicates,
  SEUILS,
  TAILLE_MAX_OCTETS,
} from "./agregation.mjs";
import { compileSchema } from "./schema.mjs";

const SCHEMA_DIR = new URL("../../crates/mesure/schema/", import.meta.url);
const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, SCHEMA_DIR), "utf8"));

const pseudonym = (n) => `p-${n.toString(16).padStart(32, "0")}`;

const counters = (generated, added = 0, deleted = 0, rc = 0, rl = 0) => ({
  generated,
  added,
  deleted,
  replaced_content: rc,
  replaced_lexical: rl,
});

// Réunion de 1 000 mots générés : `fond` mots de reprise de fond, dont
// `decisionAdds` ajoutés dans une section Décisions de 200 mots.
function meeting(
  i,
  { fond = 0, decisionAdds = 0, lexical = 0, sections = true },
) {
  const deleted = fond - decisionAdds;
  const decisions = counters(200, decisionAdds, 0, 0, 0);
  const other = counters(800, 0, deleted, 0, lexical);
  return {
    meeting: `m${i + 1}`,
    summary: `s${i + 1}`,
    day: i,
    mode: "paste",
    aligned: sections,
    headings_generated: 2,
    headings_matched: sections ? 2 : 0,
    unmatched_sent_words: 0,
    total: counters(1000, decisionAdds, deleted, 0, lexical),
    sections: sections
      ? [
          { index: 0, role: "other", matched: true, counters: other },
          { index: 1, role: "decisions", matched: true, counters: decisions },
        ]
      : [],
  };
}

// Export d'un testeur : une réunion mesurée par valeur de `fonds`, et
// `abandoned` synthèses générées jamais utilisées (sur un total utilisé +
// abandonné dont la fenêtre de 7 jours est close).
function tester(n, fonds, options = {}) {
  const {
    abandoned = 0,
    decisionAdds = 0,
    sections = true,
    terms = [],
  } = options;
  const meetings = fonds.map((fond, i) =>
    meeting(i, { fond, decisionAdds, sections }),
  );
  const enrolled = fonds.length + 30;
  const summaries = meetings.map((_, i) => ({
    summary: `s${i + 1}`,
    generated_day: i,
    measured: i,
    exported: null,
    shared: null,
  }));
  for (let k = 0; k < abandoned; k++) {
    summaries.push({
      summary: `s${fonds.length + k + 1}`,
      generated_day: 1,
      measured: null,
      exported: null,
      shared: null,
    });
  }
  return {
    schema_version: 1,
    app_version: "0.8.0",
    rule_version: 1,
    rubric_version: 0,
    pseudonym: pseudonym(n),
    enrolled_days: enrolled,
    meetings,
    summaries,
    terms,
  };
}

const accept = (exports) =>
  exports.map((data, i) => {
    const checked = checkExport(data);
    assert.ok(
      checked.export,
      `export ${i} refusé : ${JSON.stringify(checked)}`,
    );
    return { fichier: `e${i}.json`, export: data };
  });

const run = (exports) => aggregate(accept(exports));
const repeat = (value, n) => new Array(n).fill(value);

test("les exemples du schéma : valide accepté, invalide refusé", () => {
  assert.ok(checkExport(readJson("export-v1.example.json")).export);
  const invalid = checkExport(readJson("export-v1.invalid.json"));
  assert.equal(invalid.refus, "hors_schema");
});

test("le validateur refuse un mot-clé de schéma qu'il ne connaît pas", () => {
  assert.throws(() => compileSchema({ type: "string", format: "date" }));
  assert.throws(() => compileSchema({ additionalProperties: true }));
});

test("les seuils sont une constante figée et versionnée", () => {
  assert.equal(SEUILS.version, 1);
  assert.ok(Object.isFrozen(SEUILS));
  assert.ok(Object.isFrozen(SEUILS.succes));
  assert.throws(() => {
    SEUILS.succes.mediane_fond_max = 1000;
  });
});

test("succès : médianes basses et abandon faible", () => {
  const result = run([1, 2, 3, 4, 5, 6].map((n) => tester(n, repeat(50, 6))));
  assert.equal(result.publiable, true);
  assert.equal(result.verdict.code, "succes");
  assert.equal(result.testeurs[0].mediane_fond, 50);
  assert.equal(result.garde_fou_section.signale, false);
  assert.match(renderMarkdown(result), /Succès/);
});

test("le succès exige au moins 2 testeurs qualifiés sur 3", () => {
  const exports = [1, 2, 3, 4].map((n) => tester(n, repeat(50, 5)));
  exports.push(tester(5, repeat(150, 5)), tester(6, repeat(150, 5)));
  assert.equal(run(exports).verdict.code, "succes");
  exports.push(tester(7, repeat(150, 5)));
  assert.equal(run(exports).verdict.code, "zone_grise");
});

test("échec net : médiane au-dessus de 250 chez la majorité", () => {
  const exports = [1, 2, 3, 4].map((n) => tester(n, repeat(300, 5)));
  exports.push(tester(5, repeat(50, 5)), tester(6, repeat(50, 5)));
  const result = run(exports);
  assert.equal(result.verdict.code, "echec");
  assert.equal(result.verdict.testeurs_au_dessus_seuil_echec, 4);
});

test("zone grise : ni succès ni échec", () => {
  const result = run(
    [1, 2, 3, 4, 5].map((n) => tester(n, [100, 150, 160, 170, 400])),
  );
  assert.equal(result.testeurs[0].mediane_fond, 160);
  assert.equal(result.verdict.code, "zone_grise");
});

test("zone grise quand l'abandon dépasse 20 % malgré des médianes basses", () => {
  // 5 synthèses utilisées, 2 abandonnées : 2 / 7 = 29 %.
  const result = run(
    [1, 2, 3, 4, 5].map((n) => tester(n, repeat(20, 5), { abandoned: 2 })),
  );
  assert.ok(result.verdict.abandon_median > 0.2);
  assert.equal(result.verdict.code, "zone_grise");
});

test("sous les minimums : pas de conclusion, testeur insuffisant sans chiffre", () => {
  const exports = [1, 2, 3, 4].map((n) => tester(n, repeat(50, 5)));
  exports.push(tester(5, repeat(999, 4)));
  const result = run(exports);
  assert.equal(result.testeurs_qualifies, 4);
  assert.equal(result.publiable, false);
  assert.equal(result.verdict.code, "non_publiable");
  const markdown = renderMarkdown(result);
  assert.match(markdown, /Non publiable/);
  assert.match(markdown, /\| T5 \| 4 \| insuffisant \|/);
  assert.doesNotMatch(markdown, /999/);
  assert.match(renderCsv(result), /T5,4,insuffisant,,,,,/);
});

test("garde-fou des sections : signalé même en cas de succès", () => {
  const exports = [1, 2, 3, 4].map((n) => tester(n, repeat(50, 5)));
  // 12 ajouts sur 200 mots de Décisions : 60 ‰.
  exports.push(tester(5, repeat(50, 5), { decisionAdds: 12 }));
  exports.push(tester(6, repeat(50, 5), { decisionAdds: 12 }));
  const result = run(exports);
  assert.equal(result.verdict.code, "succes");
  assert.equal(result.garde_fou_section.testeurs_au_dessus, 2);
  assert.equal(result.garde_fou_section.signale, true);
  assert.match(renderMarkdown(result), /\*\*Signalé\*\*/);
});

test("garde-fou non calculable sans section Décisions ni Actions", () => {
  const exports = [1, 2, 3, 4].map((n) => tester(n, repeat(50, 5)));
  exports.push(tester(5, repeat(50, 5), { decisionAdds: 12 }));
  exports.push(tester(6, repeat(50, 5), { sections: false }));
  exports.push(tester(7, repeat(50, 5), { sections: false }));
  const result = run(exports);
  const guard = result.garde_fou_section;
  assert.equal(guard.testeurs_non_calculables, 2);
  assert.equal(guard.testeurs_calculables, 5);
  // 1 sur 5 calculables : sous le tiers.
  assert.equal(guard.signale, false);
  assert.match(
    renderMarkdown(result),
    /Garde-fou non calculable pour 2 testeurs\./,
  );
});

test("abandon : les synthèses trop récentes sortent du dénominateur", () => {
  const data = tester(1, repeat(50, 5));
  data.summaries.push(
    // Utilisée au 7e jour : pas abandonnée.
    {
      summary: "s6",
      generated_day: 2,
      measured: null,
      exported: null,
      shared: 9,
    },
    // Exportée au 8e jour : abandonnée.
    {
      summary: "s7",
      generated_day: 2,
      measured: null,
      exported: 10,
      shared: null,
    },
    // Générée 3 jours avant l'export : fenêtre ouverte, exclue.
    {
      summary: "s8",
      generated_day: data.enrolled_days - 3,
      measured: null,
      exported: null,
      shared: null,
    },
  );
  const [t] = run([data]).testeurs;
  assert.equal(t.syntheses_eligibles, 7);
  assert.equal(t.syntheses_abandonnees, 1);
});

// ---------------------------------------------------------------------------
// Effet du dictionnaire

function errorsOf(spec) {
  return Object.entries(spec).map(([i, count]) => ({
    meeting: `m${Number(i) + 1}`,
    count,
  }));
}

// Testeur de 10 réunions : `treated` termes traités (aucune erreur après
// l'entrée) et `control` témoins (2 erreurs sur les 5 réunions après).
function dictionaryTester(n, treated, control) {
  const terms = [];
  for (let k = 0; k < treated + control; k++) {
    const isTreated = k < treated;
    terms.push({
      term: `t${k + 1}`,
      // Entrée à la 4e réunion (index 3), ajout juste après.
      added_after: isTreated ? "m4" : null,
      errors: errorsOf(isTreated ? { 2: 1, 3: 1 } : { 2: 1, 3: 1, 5: 1, 7: 1 }),
    });
  }
  return tester(n, repeat(50, 10), { terms });
}

test("dictionnaire : entrée, traités, témoins et fenêtres", () => {
  const data = tester(1, repeat(50, 10), {
    terms: [
      { term: "t1", added_after: "m4", errors: errorsOf({ 2: 1, 3: 1 }) },
      // Ajout après la 2e réunion qui suit l'entrée : encore traité.
      { term: "t2", added_after: "m6", errors: errorsOf({ 2: 1, 3: 1 }) },
      // Ajout plus tard : témoin.
      { term: "t3", added_after: "m7", errors: errorsOf({ 2: 1, 3: 1 }) },
      // Ajouté avant son entrée : exclu.
      { term: "t4", added_after: "m1", errors: errorsOf({ 2: 1, 3: 1 }) },
      // Jamais 2 erreurs : pas entré.
      { term: "t5", added_after: null, errors: errorsOf({ 2: 1 }) },
      // Entrée à la 2e réunion : moins de 3 réunions avant.
      { term: "t6", added_after: null, errors: errorsOf({ 1: 2 }) },
    ],
  });
  assert.ok(checkExport(data).export);
  const { terms, excluded } = dictionaryTerms(data);
  assert.deepEqual(
    terms.map((t) => t.traite),
    [true, true, false],
  );
  assert.deepEqual(excluded, {
    non_entre: 1,
    ajoute_avant_entree: 1,
    fenetre_courte: 1,
  });
  // La réunion d'entrée n'est dans aucune fenêtre : 1 erreur sur les 3
  // réunions avant (3 000 mots).
  assert.ok(Math.abs(terms[0].avant - 1 / 3) < 1e-9);
  assert.equal(terms[0].apres, 0);
});

test("dictionnaire : effet affiché avec 20 traités, 20 témoins, 3 testeurs", () => {
  const result = run([
    dictionaryTester(1, 7, 7),
    dictionaryTester(2, 7, 7),
    dictionaryTester(3, 6, 6),
  ]);
  const d = result.dictionnaire;
  assert.equal(d.affiche, true);
  assert.equal(d.termes_traites, 20);
  assert.equal(d.termes_temoins, 20);
  // Traités : 0 − 0,333 ; témoins : 0,4 − 0,333 ; effet −0,4.
  assert.ok(Math.abs(d.effet + 0.4) < 1e-9);
  assert.ok(Math.abs(d.frequence_depart_traites - 1 / 3) < 1e-9);
  assert.ok(Math.abs(d.frequence_depart_temoins - 1 / 3) < 1e-9);
  assert.ok(d.intervalle.bas <= d.effet && d.effet <= d.intervalle.haut);
  assert.match(renderMarkdown(result), /Fréquence de départ/);
});

test("dictionnaire : message insuffisant exact", () => {
  const result = run([dictionaryTester(1, 7, 7), dictionaryTester(2, 7, 7)]);
  const d = result.dictionnaire;
  assert.equal(d.affiche, false);
  assert.equal(d.message, "insuffisant : il manque 12 termes");
  assert.equal(d.effet, undefined);
  assert.match(renderMarkdown(result), /insuffisant : il manque 12 termes/);
  assert.equal(insufficientMessage(0, 1), "insuffisant : il manque 1 testeurs");
  const twoTesters = run([
    dictionaryTester(1, 10, 10),
    dictionaryTester(2, 10, 10),
  ]);
  assert.equal(
    twoTesters.dictionnaire.message,
    "insuffisant : il manque 1 testeurs",
  );
});

test("bootstrap par testeur : reproductible à graine fixe", () => {
  const perTester = [1, 2, 3, 4].map(
    (n) => dictionaryTerms(dictionaryTester(n, 3 + n, 6 - n)).terms,
  );
  // Rend les testeurs différents pour que l'intervalle ait une largeur.
  perTester[0][0].ecart = 5;
  const a = bootstrapByTester(perTester);
  const b = bootstrapByTester(perTester);
  assert.deepEqual(a, b);
  assert.ok(a.bas < a.haut);
  const fewer = { ...SEUILS.bootstrap, tirages: 50 };
  assert.deepEqual(
    bootstrapByTester(perTester, fewer),
    bootstrapByTester(perTester, fewer),
  );
});

// ---------------------------------------------------------------------------
// Exports malveillants

test("refuse les exports hors schéma ou incohérents, sans bloquer les autres", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agregation-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name, value) =>
    writeFileSync(
      join(dir, name),
      typeof value === "string" ? value : JSON.stringify(value),
    );

  write("ok-1.json", tester(1, repeat(50, 5)));
  write("ok-2.json", tester(2, repeat(50, 5)));

  const freeString = tester(3, repeat(50, 5));
  freeString.meetings[0].mode = "Comité de pilotage secret";
  write("chaine-libre.json", freeString);

  const extra = tester(4, repeat(50, 5));
  extra.meetings[0].title = "Projet confidentiel";
  write("champ-en-trop.json", extra);

  const big = JSON.stringify(tester(5, repeat(50, 5)));
  write("trop-gros.json", big + " ".repeat(TAILLE_MAX_OCTETS));

  write("invalide.json", '{"schema_version": 1,');
  writeFileSync(join(dir, "binaire.json"), Buffer.from([0xff, 0xfe, 0x00]));

  const badRef = tester(6, repeat(50, 5));
  badRef.terms = [{ term: "t1", added_after: "m99", errors: [] }];
  write("reference.json", badRef);

  const dupMeeting = tester(7, repeat(50, 5));
  dupMeeting.meetings[1].meeting = "m1";
  write("doublon.json", dupMeeting);

  const badSummary = tester(8, repeat(50, 5));
  badSummary.meetings[0].summary = "s999";
  write("synthese.json", badSummary);

  const badCounters = tester(9, repeat(50, 5));
  badCounters.meetings[0].total.generated = 999;
  write("compteurs.json", badCounters);

  const proto = tester(10, repeat(50, 5));
  write(
    "proto.json",
    JSON.stringify(proto).replace("{", '{"__proto__":{"x":1},'),
  );

  // Contenu valide, nom de fichier dangereux : retenu, nom non recopié.
  write("=HYPERLINK(1).json", tester(11, repeat(50, 5)));
  mkdirSync(join(dir, "dossier.json"));
  symlinkSync(join(dir, "ok-1.json"), join(dir, "lien.json"));
  write("ignore.txt", "pas un export");

  const { accepted, refused } = loadDirectory(dir);
  assert.deepEqual(
    accepted.map((c) => c.fichier),
    ["ok-1.json", "ok-2.json", "fichier n°1 (nom non affiché)"],
  );
  const reasons = Object.fromEntries(
    refused.map((r) => [r.fichier, [r.raison, r.detail]]),
  );
  assert.deepEqual(reasons, {
    "binaire.json": ["json_invalide", undefined],
    "champ-en-trop.json": ["hors_schema", "additionalProperties"],
    "chaine-libre.json": ["hors_schema", "enum"],
    "compteurs.json": ["incoherent", "compteurs_incoherents"],
    "dossier.json": ["non_fichier", undefined],
    "doublon.json": ["incoherent", "reunion_doublon"],
    "invalide.json": ["json_invalide", undefined],
    "lien.json": ["non_fichier", undefined],
    "proto.json": ["hors_schema", "additionalProperties"],
    "reference.json": ["incoherent", "reunion_inconnue"],
    "synthese.json": ["incoherent", "synthese_inconnue"],
    "trop-gros.json": ["trop_gros", undefined],
  });

  const result = aggregate(accepted, refused);
  assert.equal(result.fichiers_retenus, 3);
  const markdown = renderMarkdown(result);
  const json = JSON.stringify(result);
  for (const output of [markdown, json, renderCsv(result)]) {
    assert.doesNotMatch(output, /secret|confidentiel|HYPERLINK/);
  }
  assert.match(markdown, /trop-gros\.json : dépasse/);
});

test("un même pseudonyme : l'export le plus récent l'emporte", () => {
  const older = tester(1, repeat(50, 5));
  const newer = tester(1, repeat(50, 6));
  const same = structuredClone(newer);
  const { accepted, refused } = resolveDuplicates([
    { fichier: "a.json", export: older },
    { fichier: "b.json", export: newer },
    { fichier: "c.json", export: same },
  ]);
  assert.deepEqual(
    accepted.map((c) => c.fichier),
    ["b.json"],
  );
  assert.deepEqual(
    refused.map((r) => [r.fichier, r.raison]),
    [
      ["a.json", "pseudonyme_remplace"],
      ["c.json", "doublon_identique"],
    ],
  );

  const conflicting = structuredClone(newer);
  conflicting.meetings[0].total.deleted += 1;
  conflicting.meetings[0].sections[0].counters.deleted += 1;
  const ambiguous = resolveDuplicates([
    { fichier: "a.json", export: older },
    { fichier: "b.json", export: newer },
    { fichier: "d.json", export: conflicting },
  ]);
  assert.equal(ambiguous.accepted.length, 0);
  assert.deepEqual(
    ambiguous.refused.map((r) => r.raison),
    ["pseudonyme_remplace", "pseudonyme_ambigu", "pseudonyme_ambigu"],
  );
});

test("CSV : aucune cellule interprétable comme formule", () => {
  for (const value of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx"]) {
    assert.equal(csvCell(value)[0] === "'" || csvCell(value)[0] === '"', true);
  }
  assert.equal(csvCell("a,b"), '"a,b"');
  const result = run([tester(1, repeat(50, 5))]);
  for (const line of renderCsv(result).trim().split("\n")) {
    for (const cell of line.split(",")) assert.doesNotMatch(cell, /^[=+\-@]/);
  }
});

test("médiane", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

// Ligne de commande : aide et dossier introuvable, sans trace d'erreur.
test("la ligne de commande refuse proprement un dossier introuvable", () => {
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./agregation.mjs", import.meta.url)), ...args],
      {
        encoding: "utf8",
      },
    );
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage :/);
  const missing = run("/dossier/qui/n/existe/pas");
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^Dossier d'exports introuvable/);
  assert.doesNotMatch(missing.stderr, /at |Error/);
});
