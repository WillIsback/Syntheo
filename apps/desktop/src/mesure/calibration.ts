import type { DifferenceRow } from "@syntheo/plugin-mesure";

// Mode Calibrage (étape 0 de la bêta, issue 671) : accord entre la classe
// automatique d'une différence (fond ou lexical) et la classe choisie à la
// main. Les ajouts et suppressions sont toujours du fond pour la règle ; ils
// sont classés comme les remplacements. Seuls ces compteurs sont enregistrés.
//
// Issue 735 : une troisième classe, « artefact », marque une différence qui
// n'en est pas une (entité, découpage, tableau). Elle est exclue de la matrice
// lexical/fond et comptée à part. L'accord est aussi rendu pondéré en mots
// (`weight` de chaque différence). Seules les quatre cases par différence
// sont enregistrées en base ; les artefacts et l'accord pondéré sont affichés
// et copiés dans le TSV.

export type TrueClass = "content" | "lexical" | "artefact";

export type AgreementMatrix = {
  ruleVersion: number;
  autoContentTrueContent: number;
  autoContentTrueLexical: number;
  autoLexicalTrueContent: number;
  autoLexicalTrueLexical: number;
  /** Mêmes cases, pondérées en mots. */
  words: {
    autoContentTrueContent: number;
    autoContentTrueLexical: number;
    autoLexicalTrueContent: number;
    autoLexicalTrueLexical: number;
  };
  /** Différences étiquetées « artefact », hors matrice, et leurs mots. */
  artefacts: number;
  artefactWords: number;
};

type Cell =
  | "autoContentTrueContent"
  | "autoContentTrueLexical"
  | "autoLexicalTrueContent"
  | "autoLexicalTrueLexical";

export function agreementMatrix(
  rows: readonly DifferenceRow[],
  labels: ReadonlyMap<number, TrueClass>,
  ruleVersion: number,
): AgreementMatrix {
  const matrix: AgreementMatrix = {
    ruleVersion,
    autoContentTrueContent: 0,
    autoContentTrueLexical: 0,
    autoLexicalTrueContent: 0,
    autoLexicalTrueLexical: 0,
    words: {
      autoContentTrueContent: 0,
      autoContentTrueLexical: 0,
      autoLexicalTrueContent: 0,
      autoLexicalTrueLexical: 0,
    },
    artefacts: 0,
    artefactWords: 0,
  };
  rows.forEach((row, index) => {
    const label = labels.get(index);
    if (!label) return;
    if (label === "artefact") {
      matrix.artefacts += 1;
      matrix.artefactWords += row.weight;
      return;
    }
    const cell: Cell = row.lexical
      ? label === "lexical"
        ? "autoLexicalTrueLexical"
        : "autoLexicalTrueContent"
      : label === "lexical"
        ? "autoContentTrueLexical"
        : "autoContentTrueContent";
    matrix[cell] += 1;
    matrix.words[cell] += row.weight;
  });
  return matrix;
}

/** Différences classées fond ou lexical (artefacts exclus). */
export function labeledCount(matrix: AgreementMatrix): number {
  return (
    matrix.autoContentTrueContent +
    matrix.autoContentTrueLexical +
    matrix.autoLexicalTrueContent +
    matrix.autoLexicalTrueLexical
  );
}

/** Mots des différences classées fond ou lexical (artefacts exclus). */
export function labeledWords(matrix: AgreementMatrix): number {
  const w = matrix.words;
  return (
    w.autoContentTrueContent +
    w.autoContentTrueLexical +
    w.autoLexicalTrueContent +
    w.autoLexicalTrueLexical
  );
}

/** Part d'accord, en pourcentage ; `null` sans différence classée. */
export function agreementPercent(matrix: AgreementMatrix): number | null {
  const total = labeledCount(matrix);
  if (total === 0) return null;
  return (
    ((matrix.autoContentTrueContent + matrix.autoLexicalTrueLexical) / total) *
    100
  );
}

/** Part d'accord pondérée en mots ; `null` sans mot classé. */
export function weightedAgreementPercent(
  matrix: AgreementMatrix,
): number | null {
  const total = labeledWords(matrix);
  if (total === 0) return null;
  const w = matrix.words;
  return ((w.autoContentTrueContent + w.autoLexicalTrueLexical) / total) * 100;
}

const percentCell = (percent: number | null) =>
  percent === null ? "-" : percent.toFixed(1);

/** Matrice en TSV, nombres seulement, à coller dans un tableur. */
export function matrixToTsv(matrix: AgreementMatrix): string {
  const w = matrix.words;
  return [
    ["rule_version", matrix.ruleVersion],
    ["auto_fond_vrai_fond", matrix.autoContentTrueContent],
    ["auto_fond_vrai_lexical", matrix.autoContentTrueLexical],
    ["auto_lexical_vrai_fond", matrix.autoLexicalTrueContent],
    ["auto_lexical_vrai_lexical", matrix.autoLexicalTrueLexical],
    ["classees", labeledCount(matrix)],
    ["accord_pourcent", percentCell(agreementPercent(matrix))],
    ["mots_auto_fond_vrai_fond", w.autoContentTrueContent],
    ["mots_auto_fond_vrai_lexical", w.autoContentTrueLexical],
    ["mots_auto_lexical_vrai_fond", w.autoLexicalTrueContent],
    ["mots_auto_lexical_vrai_lexical", w.autoLexicalTrueLexical],
    ["mots_classes", labeledWords(matrix)],
    ["accord_pondere_pourcent", percentCell(weightedAgreementPercent(matrix))],
    ["artefacts", matrix.artefacts],
    ["mots_artefacts", matrix.artefactWords],
  ]
    .map(([key, value]) => `${key}\t${value}`)
    .join("\n");
}
