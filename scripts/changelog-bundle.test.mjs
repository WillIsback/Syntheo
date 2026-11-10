import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { changelog } from "../apps/desktop/plugins/changelog.ts";

const dir = new URL("../packages/changelog/content/desktop/", import.meta.url);

async function loadEntries(version) {
  if (version === undefined) delete process.env.VITE_APP_VERSION;
  else process.env.VITE_APP_VERSION = version;
  const module = await changelog().load.call({}, "\0virtual:changelog");
  const prefix = "export const entries = ";
  assert.ok(module.startsWith(prefix));
  return JSON.parse(module.slice(prefix.length).replace(/;$/, ""));
}

test("le bundle embarque le journal de la ligne de version", async (t) => {
  const previous = process.env.VITE_APP_VERSION;
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_APP_VERSION;
    else process.env.VITE_APP_VERSION = previous;
  });

  await t.test(
    "0.7.0 : la ligne 0.7 jusqu'à la version installée",
    async () => {
      const entries = await loadEntries("0.7.0");
      assert.deepEqual(
        entries.map((e) => e.version),
        ["0.7.0"],
      );
      const [entry] = entries;
      assert.equal(entry.date, "2026-11-10");
      assert.ok(entry.summary);
      // Frontmatter retiré au build.
      assert.ok(!entry.content.startsWith("---"));
      assert.ok(
        readFileSync(new URL("0.7.0.md", dir), "utf8").includes(entry.content),
      );
    },
  );

  await t.test(
    "une alpha montre le journal en cours de rédaction",
    async () => {
      const entries = await loadEntries("0.7.1-2");
      assert.deepEqual(
        entries.map((e) => e.version),
        ["0.7.1", "0.7.0"],
      );
    },
  );

  await t.test("une ligne passée n'embarque rien d'autre", async () => {
    const entries = await loadEntries("0.6.0");
    assert.deepEqual(
      entries.map((e) => e.version),
      ["0.6.0"],
    );
  });

  await t.test("sans version : la plus haute présente", async () => {
    const highest = readdirSync(dir)
      .filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f))
      .map((f) => f.slice(0, -3))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    const entries = await loadEntries(undefined);
    assert.equal(entries[0].version, highest);
  });
});
