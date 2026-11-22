import type { DifferenceRow } from "@syntheo/plugin-mesure";

// Mode Calibrage (étape 0 de la bêta, issue 671) : accord entre la classe
// automatique d'une différence (fond ou lexical) et la classe choisie à la
// main. Les ajouts et suppressions sont toujours du fond pour la règle ; ils
// sont classés comme les remplacements. Seuls ces compteurs sont enregistrés.

export type TrueClass = "content" | "lexical";

export type AgreementMatrix = {
  ruleVersion: number;
  autoContentTrueContent: number;
  autoContentTrueLexical: number;
  autoLexicalTrueContent: number;
  autoLexicalTrueLexical: number;
};

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
  };
  rows.forEach((row, index) => {
    const label = labels.get(index);
    if (!label) return;
    if (row.lexical) {
      if (label === "lexical") matrix.autoLexicalTrueLexical += 1;
      else matrix.autoLexicalTrueContent += 1;
    } else if (label === "lexical") matrix.autoContentTrueLexical += 1;
    else matrix.autoContentTrueContent += 1;
  });
  return matrix;
}

export function labeledCount(matrix: AgreementMatrix): number {
  return (
    matrix.autoContentTrueContent +
    matrix.autoContentTrueLexical +
    matrix.autoLexicalTrueContent +
    matrix.autoLexicalTrueLexical
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

/** Matrice en TSV, nombres seulement, à coller dans un tableur. */
export function matrixToTsv(matrix: AgreementMatrix): string {
  const percent = agreementPercent(matrix);
  return [
    ["rule_version", matrix.ruleVersion],
    ["auto_fond_vrai_fond", matrix.autoContentTrueContent],
    ["auto_fond_vrai_lexical", matrix.autoContentTrueLexical],
    ["auto_lexical_vrai_fond", matrix.autoLexicalTrueContent],
    ["auto_lexical_vrai_lexical", matrix.autoLexicalTrueLexical],
    ["classees", labeledCount(matrix)],
    ["accord_pourcent", percent === null ? "-" : percent.toFixed(1)],
  ]
    .map(([key, value]) => `${key}\t${value}`)
    .join("\n");
}
