import { t } from "@lingui/core/macro";

import type { Segment, SegmentKey } from "~/stt/live-segment";

// Issue 321 : « Nommer les intervenants ». Tout est calculé ici, en local et
// de façon déterministe (longueur, mots propres au locuteur) : aucun appel au
// modèle pour choisir les extraits.

/** Libellés produits par le rendu pour un locuteur sans nom (`crates/transcript/src/label.rs`). */
const ANONYMOUS_LABEL = /^Speaker (\d+|[ABC])$/;

// Mentions d'un locuteur anonyme dans une synthèse, en français ou en anglais.
const ANONYMOUS_MENTION =
  /\b(?:speaker|locut(?:eur|rice)|intervenante?|orat(?:eur|rice))\s+(?:n[°º]\s*)?\d+\b/iu;

const MAX_EXCERPTS = 2;
const MIN_SENTENCE_WORDS = 3;
const MAX_SCORED_WORDS = 25;
const DISTINCTIVE_WEIGHT = 3;
const MAX_EXCERPT_CHARS = 180;

// Mots courants (4 lettres et plus) qui ne disent rien de qui parle.
const STOPWORDS = new Set([
  "alors",
  "après",
  "aussi",
  "autre",
  "autres",
  "avant",
  "avec",
  "avoir",
  "bien",
  "cela",
  "celle",
  "celui",
  "cette",
  "ceux",
  "chez",
  "chose",
  "choses",
  "comme",
  "dans",
  "depuis",
  "donc",
  "elle",
  "elles",
  "encore",
  "entre",
  "était",
  "être",
  "fait",
  "faire",
  "leur",
  "leurs",
  "mais",
  "même",
  "moment",
  "nous",
  "parce",
  "pendant",
  "peut",
  "plus",
  "pour",
  "quand",
  "quoi",
  "sans",
  "sont",
  "sous",
  "tous",
  "tout",
  "toute",
  "très",
  "vers",
  "voilà",
  "vous",
  "about",
  "have",
  "just",
  "like",
  "okay",
  "really",
  "that",
  "there",
  "their",
  "they",
  "think",
  "this",
  "well",
  "what",
  "which",
  "with",
  "would",
  "yeah",
]);

export type SpeakerTarget = { key: SegmentKey; wordIds: string[] };

export type SpeakerCard = {
  /** Identifiant stable de la carte : capture + libellé. */
  id: string;
  transcriptId: string;
  /** Numéro du locuteur dans sa capture (« 2 » pour « Speaker 2 »). */
  number: string;
  /** Rang de la capture (1, 2…) quand la note en a plusieurs, sinon `null`. */
  part: number | null;
  turns: number;
  excerpts: string[];
  /** Clés et mots à réattribuer dans cette capture. */
  targets: SpeakerTarget[];
};

type CaptureSegments = {
  transcriptId: string;
  segments: readonly Segment[];
};

export function isAnonymousSpeakerLabel(label: string | undefined): boolean {
  return ANONYMOUS_LABEL.test(label ?? "");
}

/**
 * Libellé affiché d'un locuteur. Le rendu (Rust et `SegmentKeyUtils`) produit
 * « Speaker N » et « You » : ces valeurs restent telles quelles dans les
 * données, les comparaisons et le contexte du modèle ; seul l'affichage est
 * traduit.
 */
export function displaySpeakerLabel(label: string): string {
  const number = ANONYMOUS_LABEL.exec(label)?.[1];
  if (number) {
    return t`Speaker ${number}`;
  }
  if (label === "You") {
    return t`You`;
  }
  return label;
}

export function summaryMentionsAnonymousSpeakers(markdown: string): boolean {
  return ANONYMOUS_MENTION.test(markdown);
}

function tokenize(text: string): string[] {
  return (
    text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []
  );
}

function isMeaningful(token: string): boolean {
  return token.length >= 4 && !STOPWORDS.has(token) && !/^\d+$/.test(token);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function shorten(sentence: string): string {
  if (sentence.length <= MAX_EXCERPT_CHARS) return sentence;
  const cut = sentence.slice(0, MAX_EXCERPT_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Deux phrases qui permettent de reconnaître le locuteur, dans l'ordre où il
 * les a dites. Score : nombre de mots (plafonné) + poids des mots que lui
 * seul emploie. Les phrases trop courtes (« Oui. ») ne servent qu'à défaut.
 */
export function pickSpeakerExcerpts(
  texts: readonly string[],
  distinctiveWords: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const sentences = texts.flatMap(splitSentences).flatMap((text, order) => {
    const normalized = text.toLowerCase();
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    const tokens = tokenize(text);
    const distinctive = new Set(
      tokens.filter((token) => distinctiveWords.has(token)),
    ).size;
    return [
      {
        text,
        order,
        words: tokens.length,
        score:
          Math.min(tokens.length, MAX_SCORED_WORDS) +
          DISTINCTIVE_WEIGHT * distinctive,
      },
    ];
  });
  const long = sentences.filter(
    (sentence) => sentence.words >= MIN_SENTENCE_WORDS,
  );
  const pool = long.length > 0 ? long : sentences;

  return [...pool]
    .sort(
      (a, b) =>
        b.score - a.score || b.text.length - a.text.length || a.order - b.order,
    )
    .slice(0, MAX_EXCERPTS)
    .sort((a, b) => a.order - b.order)
    .map((sentence) => shorten(sentence.text));
}

type Group = {
  label: string;
  turns: number;
  firstOrder: number;
  texts: string[];
  targets: Map<string, SpeakerTarget>;
};

function keyId(key: SegmentKey): string {
  return JSON.stringify([
    key.channel,
    key.speaker_index ?? null,
    key.speaker_human_id ?? null,
  ]);
}

function groupCapture(segments: readonly Segment[]): Group[] {
  const groups = new Map<string, Group>();
  segments.forEach((segment, order) => {
    const label = segment.speaker_label ?? "";
    if (segment.words.length === 0 || !label) return;
    let group = groups.get(label);
    if (!group) {
      group = {
        label,
        turns: 0,
        firstOrder: order,
        texts: [],
        targets: new Map(),
      };
      groups.set(label, group);
    }
    group.turns += 1;
    group.texts.push(segment.text);
    const id = keyId(segment.key);
    const target = group.targets.get(id) ?? { key: segment.key, wordIds: [] };
    for (const word of segment.words) {
      if (typeof word.id === "string" && word.id) target.wordIds.push(word.id);
    }
    group.targets.set(id, target);
  });
  return [...groups.values()];
}

// Mots qu'un seul locuteur de la capture emploie.
function distinctiveWordsByLabel(groups: Group[]): Map<string, Set<string>> {
  const speakersByWord = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const token of tokenize(group.texts.join(" "))) {
      if (!isMeaningful(token)) continue;
      const speakers = speakersByWord.get(token) ?? new Set<string>();
      speakers.add(group.label);
      speakersByWord.set(token, speakers);
    }
  }
  const result = new Map<string, Set<string>>();
  for (const [token, speakers] of speakersByWord) {
    if (speakers.size !== 1) continue;
    const [label] = speakers;
    if (!label) continue;
    const words = result.get(label) ?? new Set<string>();
    words.add(token);
    result.set(label, words);
  }
  return result;
}

/**
 * Une carte par locuteur anonyme et par capture : un même index n'est pas la
 * même personne d'une capture à l'autre (une pause d'écoute, issue 353, crée
 * une nouvelle capture). Ordre : du plus présent au moins présent.
 */
export function buildSpeakerCards(
  captures: readonly CaptureSegments[],
): SpeakerCard[] {
  const withWords = captures.filter((capture) =>
    capture.segments.some((segment) => segment.words.length > 0),
  );
  const multiple = withWords.length > 1;
  const cards = withWords.flatMap((capture, captureIndex) => {
    const groups = groupCapture(capture.segments);
    const distinctive = distinctiveWordsByLabel(groups);
    return groups
      .filter((group) => isAnonymousSpeakerLabel(group.label))
      .map((group) => ({
        card: {
          id: `${capture.transcriptId}:${group.label}`,
          transcriptId: capture.transcriptId,
          number: group.label.replace(/^Speaker /, ""),
          part: multiple ? captureIndex + 1 : null,
          turns: group.turns,
          excerpts: pickSpeakerExcerpts(
            group.texts,
            distinctive.get(group.label) ?? new Set(),
          ),
          targets: [...group.targets.values()],
        } satisfies SpeakerCard,
        captureIndex,
        firstOrder: group.firstOrder,
      }));
  });

  return cards
    .sort(
      (a, b) =>
        b.card.turns - a.card.turns ||
        a.captureIndex - b.captureIndex ||
        a.firstOrder - b.firstOrder,
    )
    .map(({ card }) => card);
}
