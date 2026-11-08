// Balises de provenance de la synthèse (issue 417). La consigne demande au
// modèle d'entourer de ⟦ et ⟧ chaque passage tiré des notes de l'utilisateur.
// Ces deux caractères (crochets blancs mathématiques, U+27E6 et U+27E7)
// n'existent ni dans la syntaxe Markdown ni dans la ponctuation d'aucune
// langue courante : ils ne cassent ni les titres ni les listes, ne se
// confondent avec rien que l'utilisateur écrit, et chaque côté est un seul
// caractère, facile à reproduire pour un petit modèle local et à repérer
// quand il manque.
//
// Les balises ne sortent jamais : elles sont retirées dès la réception de la
// génération, avant toute autre étape (titre, étiquettes, enregistrement).
// La synthèse enregistrée n'en contient aucune ; les passages validés sont
// rangés à part, dans les métadonnées de génération.

import { md2json } from "@syntheo/editor/markdown";

export const NOTE_MARK_OPEN = "⟦";
export const NOTE_MARK_CLOSE = "⟧";

// Une balise et les blancs que le modèle a mis à l'intérieur : « ⟦ nom ⟧ ».
const MARKS = /⟦[ \t]*|[ \t]*⟧/g;

/** Retire toutes les balises, fermées ou non, sans laisser de trace. */
export function stripNoteMarks(text: string): string {
  return text.replace(MARKS, "");
}

export type ExtractedNoteMarks = {
  /** Le texte sans aucune balise. */
  text: string;
  /**
   * Le texte affiché de chaque passage balisé, dans l'ordre ; `null` quand le
   * modèle n'a fermé aucune balise (l'affichage se replie sur les fragments).
   */
  passages: string[] | null;
};

type JSONNode = { type?: string; text?: string; content?: JSONNode[] };

function collectText(node: JSONNode, parts: string[]) {
  if (typeof node.text === "string") parts.push(node.text);
  for (const child of node.content ?? []) collectText(child, parts);
  if (node.content && node.type !== "doc") parts.push(" ");
}

// Le passage tel qu'il s'affichera : « **Budget** » devient « Budget ».
function displayedText(markdown: string): string {
  let doc: JSONNode;
  try {
    doc = md2json(markdown) as JSONNode;
  } catch {
    return "";
  }
  const parts: string[] = [];
  collectText(doc, parts);
  return parts.join("").replace(/\s+/g, " ").trim();
}

// Passages d'une ligne : une balise ouverte et jamais fermée est ignorée ;
// une balise ouverte dans une autre ne garde que la plus intérieure.
function linePassages(line: string, passages: string[]) {
  let start = -1;
  let closed = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === NOTE_MARK_OPEN) {
      start = index + 1;
    } else if (char === NOTE_MARK_CLOSE && start >= 0) {
      closed += 1;
      const text = displayedText(stripNoteMarks(line.slice(start, index)));
      if (/[\p{L}\p{N}]/u.test(text)) passages.push(text);
      start = -1;
    }
  }
  return closed;
}

/** Sépare le texte généré de ses balises de provenance. */
export function extractNoteMarks(markdown: string): ExtractedNoteMarks {
  if (
    !markdown.includes(NOTE_MARK_OPEN) &&
    !markdown.includes(NOTE_MARK_CLOSE)
  ) {
    return { text: markdown, passages: null };
  }
  const passages: string[] = [];
  let closed = 0;
  for (const line of markdown.split("\n")) {
    closed += linePassages(line, passages);
  }
  return {
    text: stripNoteMarks(markdown),
    passages: closed > 0 ? passages : null,
  };
}
