import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DOCUMENTATION_URL, documentationUrl } from "./documentation";

describe("documentationUrl", () => {
  it("pointe vers la documentation Mintlify", () => {
    expect(DOCUMENTATION_URL).toBe("https://docs.syntheo.studio");
    expect(documentationUrl()).toBe(DOCUMENTATION_URL);
    expect(documentationUrl("import-recordings")).toBe(
      "https://docs.syntheo.studio/import-recordings",
    );
  });

  it("vise des pages déclarées dans la navigation de docs.json", () => {
    // Vitest s'exécute avec cwd = apps/desktop.
    const docs = readFileSync(
      resolve(process.cwd(), "../../docs/docs.json"),
      "utf8",
    );
    // Doc bilingue : chaque page existe en anglais (`en/…`) et en français
    // (`fr/…`) ; les adresses sans préfixe redirigent vers `/fr/…` (docs.json).
    for (const page of ["import-recordings", "agents/overview", "chat"]) {
      expect(docs).toContain(`"en/${page}"`);
      expect(docs).toContain(`"fr/${page}"`);
      expect(docs).toContain(`"source": "/${page}"`);
    }
  });
});
