import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DOCUMENTATION_URL, documentationUrl } from "./documentation";

describe("documentationUrl", () => {
  it("pointe vers la documentation Mintlify dans la langue de l'interface", () => {
    expect(DOCUMENTATION_URL).toBe("https://docs.syntheo.studio");
    expect(documentationUrl("fr")).toBe("https://docs.syntheo.studio/fr");
    expect(documentationUrl("en")).toBe("https://docs.syntheo.studio/en");
    expect(documentationUrl("fr", "import-recordings")).toBe(
      "https://docs.syntheo.studio/fr/import-recordings",
    );
    expect(documentationUrl("en", "agents/overview")).toBe(
      "https://docs.syntheo.studio/en/agents/overview",
    );
  });

  it("retombe sur l'anglais pour une locale sans documentation", () => {
    expect(documentationUrl("de", "chat")).toBe(
      "https://docs.syntheo.studio/en/chat",
    );
    expect(documentationUrl("fr-FR", "chat")).toBe(
      "https://docs.syntheo.studio/fr/chat",
    );
  });

  it("vise des pages déclarées dans la navigation de docs.json", () => {
    // Vitest s'exécute avec cwd = apps/desktop.
    const docs = readFileSync(
      resolve(process.cwd(), "../../docs/docs.json"),
      "utf8",
    );
    // Doc bilingue : chaque page existe en anglais (`en/…`) et en français
    // (`fr/…`).
    for (const page of [
      "index",
      "import-recordings",
      "agents/overview",
      "chat",
    ]) {
      expect(docs).toContain(`"en/${page}"`);
      expect(docs).toContain(`"fr/${page}"`);
    }
  });
});
