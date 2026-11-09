import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryOf,
  countLines,
  isGenerated,
  langOf,
  measure,
  POINT_BAS,
  zoneOf,
} from "./menage-lignes.mjs";

test("retient les langages mesurés et exclut les générés", () => {
  assert.equal(langOf("apps/desktop/src/a.tsx"), "ts");
  assert.equal(langOf("crates/x/src/lib.rs"), "rust");
  assert.equal(langOf("README.md"), null);
  assert.equal(isGenerated("plugins/tray/js/bindings.gen.ts"), true);
  assert.equal(isGenerated("apps/desktop/src/routeTree.gen.ts"), true);
  assert.equal(isGenerated("apps/desktop/src/vite-env.d.ts"), true);
  assert.equal(
    isGenerated("apps/desktop/src/i18n/locales/fr/messages.ts"),
    true,
  );
  assert.equal(isGenerated("apps/desktop/src/session/index.ts"), false);
});

test("sépare le code des tests", () => {
  assert.equal(categoryOf("apps/desktop/src/a.test.tsx"), "tests");
  assert.equal(categoryOf("crates/x/tests/it.rs"), "tests");
  assert.equal(categoryOf("crates/x/src/tests.rs"), "tests");
  assert.equal(categoryOf("e2e/specs/note.ts"), "tests");
  assert.equal(categoryOf("crates/x/src/lib.rs"), "code");
});

test("range les fichiers par zone", () => {
  assert.equal(
    zoneOf("apps/desktop/src/session/a/b.ts"),
    "apps/desktop/src/session",
  );
  assert.equal(
    zoneOf("apps/desktop/src-tauri/src/lib.rs"),
    "apps/desktop/src-tauri",
  );
  assert.equal(zoneOf("crates/storage/src/lib.rs"), "crates/storage");
  assert.equal(zoneOf("plugins/tray/src/lib.rs"), "plugins/tray");
});

test("compte les lignes comme wc -l", () => {
  assert.equal(countLines(Buffer.from("a\nb\n")), 2);
  assert.equal(countLines(Buffer.from("a\nb")), 1);
});

test(
  "retrouve le point bas de référence",
  { skip: !process.env.MENAGE_POINT_BAS },
  () => {
    assert.equal(measure(POINT_BAS).total, 444344);
  },
);
