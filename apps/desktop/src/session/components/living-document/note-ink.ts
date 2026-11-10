// Ce qui passe en vert dans le compte rendu (issues 365 et 417). Trois
// sources, toutes déterministes et calculées à l'affichage seulement :
//
// 1. Les phrases entières attribuées à une note (`findNoteSentenceRanges`).
// 2. Les passages que le modèle a balisés comme tirés des notes, validés à la
//    réception puis de nouveau ici contre la note actuelle
//    (`validateNotePassage`). On les retrouve dans l'ordre où le modèle les a
//    écrits.
// 3. Toujours, et seul repli quand la synthèse n'a aucune balise (modèle peu
//    discipliné, synthèse antérieure) : les fragments venus des notes,
//    c'est-à-dire les noms propres, les nombres et les suites d'au moins deux
//    mots significatifs présents dans une note. Jamais un mot courant isolé :
//    pas de vert moucheté.
//
// Au moindre doute, le passage reste noir. Rien n'est écrit dans le compte
// rendu : export, copie, impression et lecteurs externes n'en voient rien.

import type { Node as PMNode } from "prosemirror-model";

import {
  findNoteSentenceRanges,
  fold,
  NUMBER,
  type NoteInkRange,
  normalizeNumber,
  type PreparedNote,
  prepareNotes,
  splitSentences,
  stem,
  textblockText,
  validateNotePassage,
  WORD,
  wordMatches,
} from "./note-attribution";
import { STOPWORDS } from "./note-attribution-words";

/** Mots significatifs consécutifs exigés pour colorer une expression. */
const MIN_PHRASE_WORDS = 2;
/** Lettres exigées au total dans une expression colorée. */
const MIN_PHRASE_LETTERS = 8;
/** Lettres exigées pour un nom propre (un sigle en capitales : 2). */
const MIN_NAME_LETTERS = 3;
/** Chiffres exigés pour un nombre (« 2 » seul est trop courant). */
const MIN_NUMBER_DIGITS = 2;

type FragmentIndex = {
  /** Mots des notes, sans accents ni majuscules. */
  words: ReadonlySet<string>;
  /** Mots écrits avec une majuscule dans les notes, hors début de ligne. */
  names: ReadonlySet<string>;
  numbers: ReadonlySet<string>;
  /** Racines de chaque ligne dans l'ordre ; `null` coupe la suite (nombre). */
  lines: Array<Array<string | null>>;
};

type NoteInkSource = {
  notes: readonly PreparedNote[];
  /** Passages balisés et validés ; `null` : aucune balise, repli. */
  passages: readonly string[] | null;
  fragments: FragmentIndex;
};

type Token = {
  start: number;
  end: number;
  raw: string;
  folded: string;
  /** Racines des parties (« porte-parole »), vide pour un mot vide. */
  stems: string[];
  hasDigit: boolean;
  atStart: boolean;
};

function tokenize(text: string, sentenceStarts: ReadonlySet<number>): Token[] {
  const tokens: Token[] = [];
  let previousEnd = 0;
  let sentence = -1;
  const starts = [...sentenceStarts].sort((a, b) => a - b);
  for (const match of text.matchAll(WORD)) {
    const raw = match[0];
    const start = match.index;
    const between = text.slice(previousEnd, start);
    previousEnd = start + raw.length;
    const currentSentence = starts.filter((value) => value <= start).length;
    const atStart = currentSentence !== sentence || between.includes(":");
    sentence = currentSentence;
    const folded = fold(raw);
    const hasDigit = /\d/.test(raw);
    const stems = hasDigit
      ? []
      : folded
          .split(/[-'’]/)
          .filter((part) => part.length >= 2 && !STOPWORDS.has(part))
          .map(stem);
    tokens.push({
      start,
      end: start + raw.length,
      raw,
      folded,
      stems,
      hasDigit,
      atStart,
    });
  }
  return tokens;
}

function sentenceStartsOf(text: string): Set<number> {
  return new Set(splitSentences(text).map(([start]) => start));
}

function buildFragmentIndex(lines: readonly string[]): FragmentIndex {
  const words = new Set<string>();
  const names = new Set<string>();
  const numbers = new Set<string>();
  const stemLines: Array<Array<string | null>> = [];
  for (const line of lines) {
    for (const match of line.matchAll(NUMBER)) {
      numbers.add(normalizeNumber(match[0]));
    }
    const sequence: Array<string | null> = [];
    for (const token of tokenize(line, new Set([0]))) {
      words.add(token.folded);
      if (!token.atStart && /^\p{Lu}/u.test(token.raw)) names.add(token.folded);
      if (token.hasDigit) sequence.push(null);
      else sequence.push(...token.stems);
    }
    stemLines.push(sequence);
  }
  return { words, names, numbers, lines: stemLines };
}

/**
 * Prépare l'encre des notes : les notes brutes (une par ligne) et les
 * passages balisés de la synthèse, revalidés contre la note actuelle.
 */
export function prepareNoteInk(
  lines: readonly string[],
  passages: readonly string[] | null,
): NoteInkSource {
  const notes = prepareNotes(lines);
  return {
    notes,
    passages:
      passages === null
        ? null
        : passages.filter((passage) => validateNotePassage(passage, notes)),
    fragments: buildFragmentIndex(lines),
  };
}

// --- Repli : noms, nombres et expressions venus des notes ------------------

function isName(token: Token, index: FragmentIndex): boolean {
  if (token.hasDigit || !/^\p{Lu}/u.test(token.raw)) return false;
  if (STOPWORDS.has(token.folded)) return false;
  const isAcronym =
    token.raw.length >= 2 && token.raw === token.raw.toUpperCase();
  if (!isAcronym && token.folded.length < MIN_NAME_LETTERS) return false;
  if (!index.words.has(token.folded)) return false;
  // En tête de phrase, une majuscule ne dit rien : il faut que la note
  // l'écrive elle-même comme un nom.
  return !token.atStart || index.names.has(token.folded);
}

const UNIT = /^(?:[   ]?(?:%|€|\$|£)|k(?![\p{L}\p{N}]))/u;

function numberFragments(text: string, index: FragmentIndex) {
  const ranges: Array<[number, number]> = [];
  for (const match of text.matchAll(NUMBER)) {
    const raw = match[0];
    const start = match.index;
    if (/[\p{L}]/u.test(text[start - 1] ?? "")) continue;
    const digits = raw.replace(/\D/g, "").length;
    if (digits < MIN_NUMBER_DIGITS && !/[.,]/.test(raw)) continue;
    if (!index.numbers.has(normalizeNumber(raw))) continue;
    const end = start + raw.length;
    const unit = UNIT.exec(text.slice(end))?.[0] ?? "";
    ranges.push([start, end + unit.length]);
  }
  return ranges;
}

type Item = { stem: string; start: number; end: number; sentence: number };

function phraseFragments(tokens: readonly Token[], index: FragmentIndex) {
  const items: Array<Item | null> = [];
  let sentence = 0;
  for (const token of tokens) {
    if (token.atStart) sentence += 1;
    if (token.hasDigit) items.push(null);
    for (const value of token.stems) {
      items.push({ stem: value, start: token.start, end: token.end, sentence });
    }
  }

  const runLength = (
    from: number,
    line: ReadonlyArray<string | null>,
    at: number,
  ) => {
    let length = 0;
    const first = items[from];
    while (true) {
      const item = items[from + length];
      const noteStem = line[at + length];
      if (!item || !first || item.sentence !== first.sentence) break;
      if (!noteStem || !wordMatches(noteStem, item.stem)) break;
      length += 1;
    }
    return length;
  };

  const ranges: Array<[number, number]> = [];
  let position = 0;
  while (position < items.length) {
    let best = 0;
    for (const line of index.lines) {
      for (let at = 0; at < line.length; at += 1) {
        best = Math.max(best, runLength(position, line, at));
      }
    }
    const run = items.slice(position, position + best) as Item[];
    const letters = run.reduce((sum, item) => sum + item.stem.length, 0);
    if (best >= MIN_PHRASE_WORDS && letters >= MIN_PHRASE_LETTERS) {
      ranges.push([run[0]!.start, run[run.length - 1]!.end]);
      position += best;
    } else {
      position += 1;
    }
  }
  return ranges;
}

// Réunit les fragments voisins (« Jean » « Dupond », « 12 » « 03 »).
const JOINABLE_GAP = /^[   /\-–]{0,2}$/;

function mergeTextRanges(text: string, ranges: Array<[number, number]>) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      (start <= last[1] || JOINABLE_GAP.test(text.slice(last[1], start)))
    ) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function fragmentRanges(text: string, index: FragmentIndex) {
  const tokens = tokenize(text, sentenceStartsOf(text));
  const names = tokens
    .filter((token) => isName(token, index))
    .map((token): [number, number] => [token.start, token.end]);
  return mergeTextRanges(text, [
    ...names,
    ...numberFragments(text, index),
    ...phraseFragments(tokens, index),
  ]);
}

// --- Passages balisés : retrouvés dans l'ordre -----------------------------

const isWordChar = (char: string | undefined) =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char);

function findWord(text: string, needle: string, from: number): number {
  let at = text.indexOf(needle, from);
  while (at >= 0) {
    if (!isWordChar(text[at - 1]) && !isWordChar(text[at + needle.length])) {
      return at;
    }
    at = text.indexOf(needle, at + 1);
  }
  return -1;
}

type Block = {
  text: string;
  positions: number[];
  ranges: Array<[number, number]>;
};

function placePassages(blocks: readonly Block[], passages: readonly string[]) {
  let block = 0;
  let offset = 0;
  for (const passage of passages) {
    for (let candidate = block; candidate < blocks.length; candidate += 1) {
      const target = blocks[candidate]!;
      const at = findWord(
        target.text,
        passage,
        candidate === block ? offset : 0,
      );
      if (at < 0) continue;
      target.ranges.push([at, at + passage.length]);
      block = candidate;
      offset = at + passage.length;
      break;
    }
  }
}

/** Les plages vertes du compte rendu ; le titre du document n'est jamais coloré. */
export function findNoteInkRanges(
  doc: PMNode,
  source: NoteInkSource,
): NoteInkRange[] {
  if (source.notes.length === 0) return [];
  const blocks: Block[] = [];
  const title = doc.firstChild;
  const skipTitle = title?.type.name === "heading" && title.attrs.level === 1;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (!(skipTitle && pos === 0)) {
      blocks.push({ ...textblockText(node, pos), ranges: [] });
    }
    return false;
  });

  // Les fragments venus des notes sont toujours colorés, balises ou non : un
  // nom de la note reste vert même pris dans une balise rejetée.
  for (const block of blocks) {
    block.ranges.push(...fragmentRanges(block.text, source.fragments));
  }
  if (source.passages !== null) placePassages(blocks, source.passages);

  const ranges = [
    ...findNoteSentenceRanges(doc, source.notes),
    ...blocks.flatMap(({ positions, ranges: textRanges }) =>
      textRanges.map(([start, end]) => ({
        from: positions[start]!,
        to: positions[end - 1]! + 1,
      })),
    ),
  ].sort((a, b) => a.from - b.from || a.to - b.to);

  const merged: NoteInkRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}
