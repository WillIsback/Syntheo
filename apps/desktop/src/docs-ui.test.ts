import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

// Vitest s'exécute depuis apps/desktop : la racine du dépôt est deux niveaux
// au-dessus.
const ROOT = join(process.cwd(), "..", "..");

// Les reproductions de l'app dans la doc (docs/snippets/app.gen.jsx) suivent
// les couleurs, les libellés et les icônes de l'app : si l'un d'eux change,
// relancer `node scripts/sync-docs-ui.mjs` (issue 512).
it("docs_ui_snippet_matches_app_sources", async () => {
  const { generate, OUTPUT_PATH } = await import(
    pathToFileURL(join(ROOT, "scripts/sync-docs-ui.mjs")).href
  );
  const expected = await generate(ROOT);
  const current = readFileSync(join(ROOT, OUTPUT_PATH), "utf8");
  expect(current === expected, `${OUTPUT_PATH} n'est plus à jour`).toBe(true);
});
