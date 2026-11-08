// Rapprochement déterministe entre le compte rendu et les notes brutes
// (issue 365). Le modèle reformule les notes : une comparaison exacte est
// impossible. On découpe le compte rendu en phrases (ou puces, ou titres) et
// les notes en lignes ; une phrase n'est attribuée aux notes que si elle
// correspond à une seule note, au-dessus d'un seuil strict, et si les nombres,
// dates et noms propres des deux côtés concordent. Au moindre doute, la phrase
// reste attribuée à Syntheo : jamais de vert sur un passage qui ne vient pas
// des notes. Calcul d'affichage seulement, rien n'est écrit dans les notes ni
// dans le compte rendu.

import type { Node as PMNode } from "prosemirror-model";

import { ABBREVIATIONS, STOPWORDS, SUFFIXES } from "./note-attribution-words";

/**
 * Part minimale des mots d'une note retrouvés dans la phrase, et des mots de
 * la phrase retrouvés dans la note. Les deux doivent l'atteindre.
 */
export const NOTE_MATCH_THRESHOLD = 0.6;

/** Mots communs exigés (ramené au nombre de mots de la note s'il est plus petit). */
export const MIN_SHARED_WORDS = 2;

/** Un mot abrégé de la note (« perf ») peut couvrir un mot entier (« performance »). */
const MIN_PREFIX_LENGTH = 4;

const MIN_STEM_LENGTH = 3;

export const WORD = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
// « 50 000 », « 3,5 », « 12 » ; « 12/03 » donne deux nombres.
export const NUMBER = /\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?!\d)|\d+(?:[.,]\d+)?/g;

export type PreparedNote = {
  stems: string[];
  stemSet: ReadonlySet<string>;
  numbers: ReadonlySet<string>;
  names: string[];
};

type PreparedSentence = PreparedNote;

export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

export function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (
      word.endsWith(suffix) &&
      word.length - suffix.length >= MIN_STEM_LENGTH
    ) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

export function normalizeNumber(raw: string): string {
  const compact = raw.replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
  const [integer = "", decimals] = compact.split(".");
  const trimmed = integer.replace(/^0+(?=\d)/, "");
  return decimals === undefined ? trimmed : `${trimmed}.${decimals}`;
}

type Analysis = {
  stems: string[];
  numbers: Set<string>;
  // Mots à majuscule (noms propres, sigles), déjà racinisés.
  names: string[];
};

export function analyze(
  text: string,
  { skipLeadingName }: { skipLeadingName: boolean },
): Analysis {
  const numbers = new Set<string>();
  for (const match of text.matchAll(NUMBER)) {
    numbers.add(normalizeNumber(match[0]));
  }

  const stems: string[] = [];
  const names: string[] = [];
  let atStart = true;
  let previousEnd = 0;
  for (const match of text.matchAll(WORD)) {
    const raw = match[0];
    const between = text.slice(previousEnd, match.index);
    previousEnd = match.index + raw.length;
    // Une phrase reprend après un deux-points : « Décision : Le budget… ».
    if (between.includes(":")) atStart = true;
    const leading = atStart;
    atStart = false;

    for (const part of fold(raw).split(/[-'’]/)) {
      if (part.length < 2 || STOPWORDS.has(part) || /\d/.test(part)) continue;
      stems.push(stem(part));
    }

    const isName = /^\p{Lu}/u.test(raw) && !/\d/.test(raw);
    if (isName && !(leading && skipLeadingName)) {
      for (const part of fold(raw).split(/[-'’]/)) {
        if (part.length < 2 || STOPWORDS.has(part)) continue;
        names.push(stem(part));
      }
    }
  }

  return { stems, numbers, names };
}

export function prepareNotes(lines: readonly string[]): PreparedNote[] {
  return lines.flatMap((line) => {
    // Côté notes, une majuscule en tête de ligne compte : mieux vaut exiger
    // un mot de trop qu'attribuer à tort.
    const { stems, numbers, names } = analyze(line, { skipLeadingName: false });
    if (stems.length === 0) return [];
    return [{ stems, stemSet: new Set(stems), numbers, names }];
  });
}

function prepareSentence(text: string): PreparedSentence {
  const { stems, numbers, names } = analyze(text, { skipLeadingName: true });
  return { stems, stemSet: new Set(stems), numbers, names };
}

export function wordMatches(noteStem: string, sentenceStem: string): boolean {
  return (
    noteStem === sentenceStem ||
    (noteStem.length >= MIN_PREFIX_LENGTH && sentenceStem.startsWith(noteStem))
  );
}

function lexicalScore(sentence: PreparedSentence, note: PreparedNote) {
  const noteWords = [...note.stemSet];
  const sentenceWords = [...sentence.stemSet];
  const noteCovered = noteWords.filter((n) =>
    sentenceWords.some((s) => wordMatches(n, s)),
  ).length;
  const sentenceCovered = sentenceWords.filter((s) =>
    noteWords.some((n) => wordMatches(n, s)),
  ).length;
  if (noteWords.length === 0 || sentenceWords.length === 0) return 0;
  if (noteCovered < Math.min(MIN_SHARED_WORDS, noteWords.length)) return 0;
  return Math.min(
    noteCovered / noteWords.length,
    sentenceCovered / sentenceWords.length,
  );
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((v) => right.has(v));
}

function strictTermsAgree(sentence: PreparedSentence, note: PreparedNote) {
  // Nombres et dates : les mêmes des deux côtés, ni changés ni ajoutés.
  if (!sameSet(sentence.numbers, note.numbers)) return false;
  // Noms propres et sigles de la note : tous présents dans la phrase.
  if (!note.names.every((name) => sentence.stemSet.has(name))) return false;
  // Noms propres de la phrase : déjà dans la note (sinon ajout de Syntheo).
  return sentence.names.every((name) =>
    note.stems.some((n) => wordMatches(n, name)),
  );
}

/**
 * Un passage balisé par le modèle (issue 417) est-il appuyé par les notes ?
 * Ses nombres et ses noms propres doivent tous s'y trouver, et assez de ses
 * mots (au moins `NOTE_MATCH_THRESHOLD`) doivent venir des notes. Le passage
 * peut reprendre plusieurs lignes de notes : on compare à l'ensemble des
 * notes, pas à une seule. Au moindre doute, la balise est rejetée et le
 * passage reste noir.
 */
export function validateNotePassage(
  passage: string,
  notes: readonly PreparedNote[],
): boolean {
  if (notes.length === 0) return false;
  const { stems, numbers, names } = analyze(passage, { skipLeadingName: true });
  if (stems.length === 0 && numbers.size === 0) return false;

  const noteNumbers = new Set(notes.flatMap((note) => [...note.numbers]));
  if (![...numbers].every((value) => noteNumbers.has(value))) return false;

  const noteStems = [...new Set(notes.flatMap((note) => note.stems))];
  const backed = (word: string) =>
    noteStems.some((noteStem) => wordMatches(noteStem, word));
  if (!names.every(backed)) return false;
  if (stems.length === 0) return true;

  const words = [...new Set(stems)];
  return words.filter(backed).length / words.length >= NOTE_MATCH_THRESHOLD;
}

/**
 * Index de la seule note dont vient la phrase, ou `null` au moindre doute :
 * sous le seuil, plusieurs notes candidates, nombre ou nom différent.
 */
export function matchSentenceToNote(
  text: string,
  notes: readonly PreparedNote[],
): number | null {
  if (notes.length === 0) return null;
  const sentence = prepareSentence(text);
  if (sentence.stems.length === 0) return null;

  const candidates: number[] = [];
  notes.forEach((note, index) => {
    if (lexicalScore(sentence, note) >= NOTE_MATCH_THRESHOLD) {
      candidates.push(index);
    }
  });
  if (candidates.length !== 1) return null;
  const [index] = candidates as [number];
  return strictTermsAgree(sentence, notes[index]!) ? index : null;
}

// --- Notes brutes : une note par ligne ---------------------------------------

type JSONNode = {
  type?: string;
  text?: string;
  content?: JSONNode[];
};

function collectLines(node: JSONNode, lines: string[]) {
  const children = node.content ?? [];
  const isTextblock = children.some(
    (child) => child.type === "text" || child.type === "hardBreak",
  );
  if (!isTextblock) {
    children.forEach((child) => collectLines(child, lines));
    return;
  }
  let current = "";
  for (const child of children) {
    if (child.type === "text") current += child.text ?? "";
    else if (child.type === "hardBreak") current += "\n";
    else current += " ";
  }
  lines.push(...current.split("\n"));
}

/** Les lignes non vides des notes brutes (document ProseMirror en JSON). */
export function extractNoteLines(rawMd: string): string[] {
  if (!rawMd.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMd);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const lines: string[] = [];
  collectLines(parsed as JSONNode, lines);
  return lines.map((line) => line.trim()).filter(Boolean);
}

// --- Compte rendu : une phrase, une puce ou un titre à la fois -------------

export type NoteInkRange = { from: number; to: number };

function isSentenceEnd(text: string, index: number): boolean {
  const char = text[index];
  if (char === "!" || char === "?" || char === "…" || char === ";") {
    return /\s/.test(text[index + 1] ?? " ");
  }
  if (char !== ".") return false;
  if (!/\s/.test(text[index + 1] ?? " ")) return false;
  const word = /([\p{L}]+)$/u.exec(text.slice(0, index))?.[1] ?? "";
  // « M. Dupont », « etc. » : pas une fin de phrase.
  return word.length > 1 && !ABBREVIATIONS.has(fold(word));
}

/** Découpe un texte en phrases ; bornes [début, fin) sans blancs autour. */
export function splitSentences(text: string): Array<[number, number]> {
  const sentences: Array<[number, number]> = [];
  const push = (start: number, end: number) => {
    while (start < end && /\s/.test(text[start]!)) start += 1;
    while (end > start && /\s/.test(text[end - 1]!)) end -= 1;
    if (end > start) sentences.push([start, end]);
  };
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      push(start, index);
      start = index + 1;
    } else if (isSentenceEnd(text, index)) {
      push(start, index + 1);
      start = index + 1;
    }
  }
  push(start, text.length);
  return sentences;
}

export function textblockText(node: PMNode, pos: number) {
  let text = "";
  const positions: number[] = [];
  node.forEach((child, offset) => {
    const childPos = pos + 1 + offset;
    if (child.isText) {
      const value = child.text ?? "";
      for (let i = 0; i < value.length; i += 1) {
        text += value[i];
        positions.push(childPos + i);
      }
    } else {
      text += child.type.name === "hardBreak" ? "\n" : " ";
      positions.push(childPos);
    }
  });
  return { text, positions };
}

/**
 * Les plages du compte rendu attribuées aux notes. Le titre du document
 * (premier titre de niveau 1) n'est jamais coloré.
 */
export function findNoteSentenceRanges(
  doc: PMNode,
  notes: readonly PreparedNote[],
): NoteInkRange[] {
  if (notes.length === 0) return [];
  const ranges: NoteInkRange[] = [];
  const title = doc.firstChild;
  const skipTitle = title?.type.name === "heading" && title.attrs.level === 1;

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (skipTitle && pos === 0) return false;
    const { text, positions } = textblockText(node, pos);
    for (const [start, end] of splitSentences(text)) {
      if (matchSentenceToNote(text.slice(start, end), notes) === null) continue;
      ranges.push({ from: positions[start]!, to: positions[end - 1]! + 1 });
    }
    return false;
  });

  return ranges;
}
