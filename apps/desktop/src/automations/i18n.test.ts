import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatRelativeTime } from "./labels";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

// Textes des automatisations : traduits en français, sans reste de l'époque
// cloud (Zapier, « destinations », étape non prise en charge).
describe("automation texts in French", () => {
  beforeEach(() => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
  });

  afterEach(() => {
    i18n.activate("en");
  });

  it("translates the page, the editor and the launch points", () => {
    expect(t`Start from a template`).toBe("Partir d'un modèle");
    expect(t`My automations`).toBe("Mes automatisations");
    expect(t`Export as Markdown`).toBe("Exporter en Markdown");
    expect(t`Extract tasks`).toBe("Extraire les tâches");
    expect(t`When you launch it from a note`).toBe(
      "Quand vous la lancez depuis une note",
    );
    expect(t`Launched by hand`).toBe("Lancée à la main");
    expect(t`Meeting summary ready`).toBe("Synthèse prête");
    expect(t`Run an automation`).toBe("Lancer une automatisation");
    expect(t`Untitled automation`).toBe("Automatisation sans titre");
    const stepNumber = 2;
    expect(t`Remove step ${stepNumber}`).toBe("Retirer l'étape 2");
    expect(t({ message: "Summary", context: "automation variable" })).toBe(
      "Synthèse",
    );
    expect(t({ message: "Transcript", context: "automation variable" })).toBe(
      "Transcription",
    );
  });

  it("formats last runs as relative dates in the interface language", () => {
    const now = Date.parse("2026-11-09T12:00:00.000Z");
    expect(formatRelativeTime("2026-11-08T16:00:00.000Z", "fr", now)).toBe(
      "il y a 20 heures",
    );
    expect(formatRelativeTime("2026-11-08T12:00:00.000Z", "fr", now)).toBe(
      "hier",
    );
    expect(formatRelativeTime("2026-11-09T11:59:40.000Z", "fr", now)).toBe(
      "cette minute-ci",
    );
  });

  it.each([
    "automations/labels.ts",
    "automations/launch.tsx",
    "settings/automations/index.tsx",
    "settings/automations/workflow-builder.tsx",
    "sidebar/automations.tsx",
  ])("keeps %s free of hardcoded or cloud-era texts", (file) => {
    const source = readFileSync(resolve(__dirname, "..", file), "utf8");
    expect(source).not.toMatch(/Zapier|destination|Unsupported step/i);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/"Untitled automation"/);
  });
});
