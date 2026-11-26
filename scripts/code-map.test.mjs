import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateLinks,
  buildMap,
  docLinks,
  filterLinks,
  isTestZone,
  lastVersionTag,
  layerOf,
  layout,
  render,
  zoneLines,
} from "./code-map.mjs";
import { categoryOf, zoneOf } from "./menage-lignes.mjs";

// Données synthétiques : l'index .codegraph/ n'existe pas en CI.
const file = (path, lines) => ({
  path,
  lines,
  cat: categoryOf(path),
  zone: zoneOf(path),
});
const FILES = [
  file("apps/desktop/src/session/a.tsx", 400),
  file("apps/desktop/src/session/a.test.tsx", 900),
  file("crates/audio/src/lib.rs", 300),
  file("plugins/db/src/lib.rs", 200),
  file("plugins/db/js/bindings.gen.ts", 50),
  file("packages/ui/src/button.tsx", 100),
  file("e2e/specs/note.ts", 80),
];
const ROWS = [
  {
    sf: "apps/desktop/src/session/a.tsx",
    tf: "plugins/db/js/bindings.gen.ts",
    n: 12,
  },
  {
    sf: "apps/desktop/src/session/a.tsx",
    tf: "packages/ui/src/button.tsx",
    n: 3,
  },
  { sf: "plugins/db/src/lib.rs", tf: "crates/audio/src/lib.rs", n: 9 },
  { sf: "plugins/db/src/other.rs", tf: "crates/audio/src/lib.rs", n: 1 },
  {
    sf: "apps/desktop/src/session/a.test.tsx",
    tf: "crates/audio/src/lib.rs",
    n: 40,
  },
  { sf: "plugins/db/js/bindings.gen.ts", tf: "crates/audio/src/lib.rs", n: 5 },
  { sf: "crates/audio/src/lib.rs", tf: "crates/audio/src/dsp.rs", n: 7 },
  { sf: "crates/audio/src/lib.rs", tf: "deploy/run.py", n: 2 },
];

test("range les zones par couche et écarte les zones de tests", () => {
  assert.equal(layerOf("apps/desktop/src/session"), "apps");
  assert.equal(layerOf("crates/audio"), "crates");
  assert.equal(layerOf("scripts"), "autres");
  assert.equal(isTestZone("e2e"), true);
  assert.equal(isTestZone("crates/audio"), false);
  const lines = zoneLines(FILES);
  assert.equal(lines.get("apps/desktop/src/session"), 400);
  assert.equal(lines.get("plugins/db"), 200);
  assert.equal(lines.has("e2e"), false);
});

test("agrège les arêtes entre zones distinctes", () => {
  const zones = new Set(zoneLines(FILES).keys());
  const { links, dropped } = aggregateLinks(ROWS, zones);
  assert.deepEqual(
    links,
    [
      { source: "plugins/db", cible: "crates/audio", poids: 10 },
      { source: "apps/desktop/src/session", cible: "plugins/db", poids: 12 },
      { source: "apps/desktop/src/session", cible: "packages/ui", poids: 3 },
    ].sort((a, b) => b.poids - a.poids),
  );
  assert.deepEqual(dropped, { tests: 40, generated: 5, unknown: 2 });
});

test("filtre les liens faibles", () => {
  const links = [
    { source: "a", cible: "b", poids: 10 },
    { source: "a", cible: "c", poids: 2 },
  ];
  const { kept, weak } = filterLinks(links, 5);
  assert.deepEqual(
    kept.map((l) => l.cible),
    ["b"],
  );
  assert.deepEqual(
    weak.map((l) => l.cible),
    ["c"],
  );
});

test("la disposition est déterministe et reste dans le cadre", () => {
  const zones = [
    { id: "crates/audio", couche: "crates", lignes: 300 },
    { id: "plugins/db", couche: "plugins", lignes: 200 },
    { id: "apps/desktop/src/session", couche: "apps", lignes: 400 },
    { id: "packages/ui", couche: "packages", lignes: 100 },
  ];
  const links = [{ source: "plugins/db", cible: "crates/audio", poids: 10 }];
  const a = layout(zones, links);
  const b = layout([...zones].reverse(), links);
  assert.deepEqual(a, b);
  for (const z of a) {
    assert.ok(z.x - z.r >= 0 && z.x + z.r <= 1000, z.id);
    assert.ok(z.y - z.r >= 0 && z.y + z.r <= 700, z.id);
    assert.equal(Math.round(z.x * 10) / 10, z.x);
  }
});

test("relie chaque zone à la première page qui la cite", () => {
  const mdx = [
    "| Page | Sources |",
    "| --- | --- |",
    "| [Réunions](/fr/meetings) | `crates/audio`<br />`apps/desktop/src/session/a.tsx` |",
    "| [Notes](/fr/notes) | `crates/audio`<br />`crates/db-app (session_ops)`<br />`apps/cli/src/mcp/` |",
    "| [Syntheo](/fr) | Contenu éditorial. |",
  ].join("\n");
  const links = docLinks(mdx);
  assert.deepEqual(links.get("crates/audio"), {
    titre: "Réunions",
    href: "/fr/meetings",
  });
  assert.equal(links.get("apps/desktop/src/session").href, "/fr/meetings");
  assert.equal(links.get("crates/db-app").href, "/fr/notes");
  assert.equal(links.get("apps/cli/src/mcp").href, "/fr/notes");
});

test("retient le dernier tag de version", () => {
  assert.equal(
    lastVersionTag([
      "v0.7.10",
      "v0.8.1",
      "v0.8.0",
      "speech-models-1",
      "v0.9.0-alpha.1",
    ]),
    "v0.8.1",
  );
});

test("deux rendus des mêmes données donnent le même snippet", () => {
  const docs = {
    fr: docLinks("| [Réunions](/fr/meetings) | `crates/audio` |"),
  };
  const meta = { version: "v0.8.1", date: "2026-11-26", commit: "04a4e00c" };
  const one = render(
    buildMap({ files: FILES, rows: ROWS, minWeight: 5, docs }),
    "fr",
    meta,
  );
  const two = render(
    buildMap({ files: FILES, rows: ROWS, minWeight: 5, docs }),
    "fr",
    meta,
  );
  assert.equal(one, two);
  assert.match(one, /^export const CodeMap = /m);
  assert.match(one, /"href":"\/fr\/meetings"/);
  assert.doesNotMatch(one, /packages\/ui","poids/);
  const en = render(
    buildMap({ files: FILES, rows: ROWS, minWeight: 5 }),
    "en",
    meta,
  );
  assert.match(en, /"locale":"en-US"/);
  const code = en
    .split("\n")
    .filter((l) => !l.startsWith("//"))
    .join("\n");
  assert.doesNotMatch(code, /[éèàêç]/);
});
