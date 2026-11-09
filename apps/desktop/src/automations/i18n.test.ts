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

  it("translates the local actions and their messages", () => {
    expect(t`Generate with the local model`).toBe(
      "Générer avec le modèle local",
    );
    expect(t`Write to the vault`).toBe("Écrire dans le coffre");
    expect(t`Copy to the clipboard`).toBe("Copier dans le presse-papiers");
    expect(t`Ready to paste into a message or a document.`).toBe(
      "Prêt à coller dans un message ou un document.",
    );
    expect(t`System notification`).toBe("Notification système");
    expect(t`Send to an address (webhook)`).toBe(
      "Envoyer vers une adresse (webhook)",
    );
    expect(t`Run a command`).toBe("Lancer une commande");
    expect(t`Advanced`).toBe("Avancé");
    expect(t`Generated text`).toBe("Texte généré");
    expect(t`Run this command?`).toBe("Lancer cette commande ?");
    expect(
      t`No local model is configured. Choose one in Settings › Synthesis.`,
    ).toBe(
      "Aucun modèle local n'est configuré. Choisissez-en un dans Paramètres › Synthèse.",
    );
  });

  it("translates the test panel", () => {
    expect(t({ message: "Test", context: "automation" })).toBe("Tester");
    expect(t`Test on a note`).toBe("Tester sur une note");
    expect(t`Simulate the steps with real effects`).toBe(
      "Simuler les étapes à effet réel",
    );
    expect(t`This is a real test: these steps really act.`).toBe(
      "C'est un test réel : ces étapes agissent vraiment.",
    );
    expect(t`The next steps were not run.`).toBe(
      "Les étapes suivantes n'ont pas été lancées.",
    );
    expect(t`Not run`).toBe("Non lancée");
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
    "automations/action-runners.ts",
    "automations/command-confirmation-dialog.tsx",
    "automations/labels.ts",
    "automations/launch.tsx",
    "settings/automations/add-step-menu.tsx",
    "settings/automations/step-forms.tsx",
    "settings/automations/variable-field.tsx",
    "settings/automations/index.tsx",
    "settings/automations/workflow-builder.tsx",
    "settings/automations/workflow-test-panel.tsx",
    "settings/automations/workflow-test-result.tsx",
    "sidebar/automations.tsx",
  ])("keeps %s free of hardcoded or cloud-era texts", (file) => {
    const source = readFileSync(resolve(__dirname, "..", file), "utf8");
    expect(source).not.toMatch(/Zapier|destination|Unsupported step/i);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/"Untitled automation"/);
  });
});
