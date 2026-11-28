import levenshtein from "js-levenshtein-esm";

import type { EnhanceTemplate } from "@syntheo/plugin-template";

import { stripNoteMarks } from "~/session/note-marks";
import type {
  EarlyValidationResult,
  EarlyValidatorFn,
} from "~/store/zustand/ai-task/shared/validate";

// Issue 779 : chaque refus de la validation précoce coupe le flux et envoie
// une seconde requête au serveur LLM. Les règles ci-dessous ne refusent donc
// qu'un début de réponse qui ignore vraiment le format attendu.

// Au-delà, une introduction sans titre n'est plus attendue : la réponse est
// jugée telle quelle.
const MAX_PREAMBLE_CHARS = 200;
// Titre de niveau 1 ou 2 en tête de réponse.
const LEADING_HEADING = /^#{1,2} /;
const LEADING_HEADING_MARKER = /^#{1,2}\s*/;

export function normalizeForComparison(text: string): string {
  return (
    text
      // « Résumé » et « Resume » se comparent pareil : accents retirés, pas
      // les lettres qui les portent.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

type PipeStep = (text: string) => { text: string } | EarlyValidationResult;

function pipe(...fns: PipeStep[]): EarlyValidatorFn {
  return (text) => {
    let current = text;
    for (const fn of fns) {
      const result = fn(current);
      if ("pending" in result) return result;
      if ("valid" in result && !result.valid) return result;
      if ("text" in result) current = result.text;
    }
    return { valid: true };
  };
}

function stripPreamble(): (text: string) => { text: string } {
  return (text) => {
    const idx = text.indexOf("#");
    if (idx > 0) {
      return { text: text.slice(idx) };
    }
    return { text };
  };
}

// Une seule ligne non vide, sans titre : peut-être une courte introduction
// (« Voici le compte rendu : ») dont le titre arrive juste après.
function mayStillBePreamble(text: string): boolean {
  if (text.includes("#") || text.length >= MAX_PREAMBLE_CHARS) {
    return false;
  }
  return text.split("\n").filter((line) => line.trim()).length <= 1;
}

function requireLeadingHeading(): PipeStep {
  return (text) => {
    if (LEADING_HEADING.test(text.trim())) {
      return { valid: true };
    }
    if (mayStillBePreamble(text)) {
      return { pending: true };
    }
    return {
      valid: false,
      feedback: "Output must start with a markdown h1 heading (# Title).",
    };
  };
}

function matchSectionHeading(title: string): EarlyValidatorFn {
  const expectedStart = `# ${title}`;
  const expectedNormalized = normalizeForComparison(title);

  return (text) => {
    const trimmed = text.trim();

    if (
      expectedStart.startsWith(trimmed) ||
      trimmed.startsWith(expectedStart)
    ) {
      return { valid: true };
    }

    // Seule la ligne du titre compte, pas le début de la section qui suit ;
    // une ligne encore incomplète se compare au début du titre attendu.
    const [headingLine = ""] = trimmed
      .replace(LEADING_HEADING_MARKER, "")
      .split("\n");
    const lineComplete = trimmed.includes("\n");
    const actualNormalized = normalizeForComparison(headingLine);
    const expected = lineComplete
      ? expectedNormalized
      : expectedNormalized.slice(0, actualNormalized.length);
    const distance = levenshtein(expected, actualNormalized);
    const threshold = Math.floor(expectedNormalized.length * 0.3);
    if (distance <= threshold) {
      return { valid: true };
    }

    return {
      valid: false,
      feedback: `Output must start with the first template section heading: "${expectedStart}"`,
    };
  };
}

export function createEnhanceValidator(
  template: EnhanceTemplate | null,
  {
    overrideTemplateFormatting = false,
  }: { overrideTemplateFormatting?: boolean } = {},
): EarlyValidatorFn {
  // Les balises de provenance (issue 417) ne font pas partie du format.
  const steps: PipeStep[] = [
    (text) => ({ text: stripNoteMarks(text) }),
    stripPreamble(),
  ];

  if (!overrideTemplateFormatting) {
    steps.push(requireLeadingHeading());

    if (template?.sections?.length) {
      steps.push(matchSectionHeading(template.sections[0].title));
    }
  }

  return pipe(...steps);
}
