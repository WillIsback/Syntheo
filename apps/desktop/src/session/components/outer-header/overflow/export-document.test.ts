import { i18n } from "@lingui/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildMarkdownExport,
  buildOrgExport,
  buildPdfExport,
  buildTextExport,
  type ExportDocument,
  formatExportDuration,
  NBSP,
} from "./export-document";

import { messages as enMessages } from "~/i18n/locales/en/messages";
import { messages as frMessages } from "~/i18n/locales/fr/messages";

// Heure locale : le rendu ne dépend pas du fuseau de la machine de test.
const CREATED_AT = new Date(2026, 10, 8, 22, 28).toISOString();

const doc: ExportDocument = {
  title: "EuroLeague et bilan de Luka Doncic",
  createdAt: CREATED_AT,
  participants: [],
  duration: formatExportDuration(0, 11 * 60_000),
  memoMd: "Notes",
  summaryMd: "# Prochaines étapes\n\n- Revoir le match",
  transcript: [
    { speaker: "Speaker 1", text: "Bonsoir." },
    { speaker: "You", text: "Salut." },
    { speaker: "Alice", text: "Coucou." },
    { speaker: null, text: "Sans locuteur." },
  ],
};

function activate(locale: "en" | "fr") {
  i18n.load(locale, locale === "fr" ? frMessages : enMessages);
  i18n.activate(locale);
}

describe("export dans la langue de l'interface", () => {
  afterEach(() => activate("en"));

  it("écrit le Markdown en français", () => {
    activate("fr");
    expect(buildMarkdownExport(doc)).toBe(
      [
        "# EuroLeague et bilan de Luka Doncic",
        `- Créé le${NBSP}: dimanche 8 novembre 2026 à 22:28`,
        `- Durée${NBSP}: 11 min`,
        "",
        "## Mémo",
        "Notes",
        "",
        "## Synthèse",
        "# Prochaines étapes\n\n- Revoir le match",
        "",
        "## Transcription",
        `Locuteur 1${NBSP}: Bonsoir.\n\nVous${NBSP}: Salut.\n\nAlice${NBSP}: Coucou.\n\nSans locuteur.`,
      ].join("\n"),
    );
  });

  it("écrit le Markdown en anglais", () => {
    activate("en");
    const markdown = buildMarkdownExport(doc);
    expect(markdown).toContain(
      "- Created: Sunday, November 8, 2026 at 10:28 PM",
    );
    expect(markdown).toContain("- Duration: 11 min");
    expect(markdown).toContain("## Summary\n");
    expect(markdown).toContain(
      "## Transcript\nSpeaker 1: Bonsoir.\n\nYou: Salut.",
    );
  });

  it("traduit aussi le texte, l'Org et le PDF", () => {
    activate("fr");
    expect(buildTextExport(doc)).toContain(
      `Transcription\n-------------\nLocuteur 1${NBSP}: Bonsoir.`,
    );
    const org = buildOrgExport(doc);
    expect(org).toContain("* Métadonnées");
    expect(org).toContain("- Créé le :: dimanche 8 novembre 2026 à 22:28");
    expect(org).toContain("* Synthèse");

    const pdf = buildPdfExport(doc);
    expect(pdf.metadata?.createdAt).toBe("dimanche 8 novembre 2026 à 22:28");
    expect(pdf.labels).toEqual({
      memo: "Mémo",
      summary: "Synthèse",
      transcript: "Transcription",
      participants: "Participants",
      unknownSpeaker: "Locuteur inconnu",
    });
    expect(pdf.transcript?.items.map((item) => item.speaker)).toEqual([
      "Locuteur 1",
      "Vous",
      "Alice",
      null,
    ]);
  });

  it("met la durée en forme", () => {
    expect(formatExportDuration(0, 59_000)).toBe("0 min");
    expect(formatExportDuration(0, 65 * 60_000)).toBe("1 h 05");
  });
});
