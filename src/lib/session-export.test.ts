import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReportFormatted,
  buildReportMarkdown,
  buildTranscriptPlain,
  buildTranscriptText,
} from "./session-export";

const blocks = [
  {
    id: "b1",
    segId: "s1",
    speakerId: "sp1",
    ts: "00:01:00",
    text: "Bonjour à tous.",
  },
  {
    id: "b2",
    segId: "s1",
    speakerId: "sp2",
    ts: "00:01:15",
    text: "Merci de votre présence.",
  },
  {
    id: "b3",
    segId: "s2",
    speakerId: "sp1",
    ts: "00:02:00",
    text: "Passons au premier point.",
  },
];

const speakerNames: Record<string, string> = {
  sp1: "Alice Dupont",
  sp2: "Marc Lebrun",
};

test("buildTranscriptText — inclut horodatage et nom intervenant", () => {
  const result = buildTranscriptText(blocks, speakerNames);
  assert.ok(result.includes("[00:01:00] Alice Dupont : Bonjour à tous."));
  assert.ok(
    result.includes("[00:01:15] Marc Lebrun : Merci de votre présence."),
  );
  assert.ok(
    result.includes("[00:02:00] Alice Dupont : Passons au premier point."),
  );
});

test("buildTranscriptText — repli sur l'id si nom inconnu", () => {
  const result = buildTranscriptText(blocks, { sp1: "Alice Dupont" });
  assert.ok(result.includes("[00:01:15] sp2 : Merci de votre présence."));
});

test("buildTranscriptPlain — texte uniquement, sans métadonnées", () => {
  const result = buildTranscriptPlain(blocks);
  assert.ok(!result.includes("[00:01:00]"));
  assert.ok(!result.includes("Alice"));
  assert.ok(result.includes("Bonjour à tous."));
  assert.ok(result.includes("Merci de votre présence."));
});

const report = {
  templateId: "t1",
  templateName: "Réunion standard",
  modelTag: "gpt-4o",
  sections: [
    { title: "Résumé", body: "La réunion a porté sur le budget Q3." },
    { title: "Actions", body: "Alice envoie le récapitulatif avant vendredi." },
  ],
};

test("buildReportFormatted — sans balises markdown, titres en majuscules", () => {
  const result = buildReportFormatted(report);
  assert.ok(!result.includes("##"));
  assert.ok(result.includes("RÉSUMÉ"));
  assert.ok(result.includes("La réunion a porté sur le budget Q3."));
  assert.ok(result.includes("ACTIONS"));
});

test("buildReportMarkdown — balises ## et corps verbatim", () => {
  const result = buildReportMarkdown(report);
  assert.ok(result.includes("## Résumé"));
  assert.ok(result.includes("La réunion a porté sur le budget Q3."));
  assert.ok(result.includes("## Actions"));
  assert.ok(!result.includes("RÉSUMÉ"));
});
