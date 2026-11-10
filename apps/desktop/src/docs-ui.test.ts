import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

// Vitest s'exécute depuis apps/desktop : la racine du dépôt est deux niveaux
// au-dessus.
const ROOT = join(process.cwd(), "..", "..");

// Les reproductions de l'app dans la doc (docs/snippets/*.gen.jsx en
// français, docs/snippets/en/*.gen.jsx en anglais) suivent les couleurs, les
// libellés et les icônes de l'app : si l'un d'eux change, relancer
// `node scripts/sync-docs-ui.mjs` (issues 512 et 528). generate() échoue
// aussi quand un libellé cité n'existe plus dans messages.po, ou quand du
// texte français reste dans une sortie anglaise (scripts/docs-ui/en.json).
it("docs_ui_snippets_match_app_sources", async () => {
  const { generate, OUTPUT_DIR } = await import(
    pathToFileURL(join(ROOT, "scripts/sync-docs-ui.mjs")).href
  );
  const outputs: Record<string, string> = await generate(ROOT);
  expect(Object.keys(outputs).length).toBeGreaterThan(0);
  for (const [name, expected] of Object.entries(outputs)) {
    const current = readFileSync(join(ROOT, OUTPUT_DIR, name), "utf8");
    expect(
      current === expected,
      `${OUTPUT_DIR}/${name} n'est plus à jour`,
    ).toBe(true);
  }
});

const exportsOf = (source: string) =>
  [...source.matchAll(/^export const (\w+)/gm)].map((m) => m[1]).sort();

// Les pages anglaises importent /snippets/en/<nom>.gen.jsx avec les mêmes
// composants que les pages françaises.
it("docs_ui_snippets_exist_in_french_and_english", async () => {
  const { generate } = await import(
    pathToFileURL(join(ROOT, "scripts/sync-docs-ui.mjs")).href
  );
  const outputs: Record<string, string> = await generate(ROOT);
  const french = Object.keys(outputs).filter((name) => !name.includes("/"));
  expect(french.length).toBeGreaterThan(0);
  for (const name of french) {
    const english = outputs[`en/${name}`];
    expect(english, `en/${name} manquant`).toBeDefined();
    expect(exportsOf(english)).toEqual(exportsOf(outputs[name]));
    expect(english).toContain('const SYN_LOCALE = "en-US"');
  }
});
