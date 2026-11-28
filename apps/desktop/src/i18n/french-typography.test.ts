import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WELCOME_NOTES } from "~/onboarding/welcome-note.constants";

/**
 * Typographie française du catalogue fr (issue 765) : une espace insécable
 * (U+00A0 ou U+202F) précède « : ; ! ? » et suit « / précède ». Une espace
 * simple laisse le navigateur renvoyer la ponctuation en début de ligne.
 */
const CATALOG = join(
  process.cwd(),
  "src",
  "i18n",
  "locales",
  "fr",
  "messages.po",
);
const NON_BREAKING = /[  ]/u;

/**
 * Textes français écrits en dur hors du catalogue, contrôlés de la même façon.
 * Restent hors liste : le message d'annonce posté dans les réunions
 * (stt/meeting-disclosure.ts), reconnu tel quel dans le chat de la réunion, et
 * les modèles de synthèse par défaut, recopiés par une migration de la base.
 */
const HARDCODED_FRENCH_TEXTS: Record<string, string> = {
  "onboarding/welcome-note.constants.ts (titre)": WELCOME_NOTES.fr.title,
  "onboarding/welcome-note.constants.ts (texte)": WELCOME_NOTES.fr.body,
};

/** Retire ce qui n'est pas de la prose : URL, entités HTML, variables, balises. */
function stripNonProse(text: string): string {
  return text
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/giu, "URL")
    .replace(/&#?\w+;/gu, "ENTITE")
    .replace(/\{[\w.]+\}/gu, "VAR")
    .replace(/<\/?\d+\/?>/gu, "");
}

function findFrenchTypographyIssues(text: string): string[] {
  const prose = stripNonProse(text);
  const issues: string[] = [];
  // « ; ! ? » en fin de mot (suivis d'une fin, d'une espace ou d'une ponctuation),
  // sauf dans une suite comme « ?! » ; « : » seulement suivi d'une espace ou d'une
  // fin, pour laisser passer les heures (10:30) et les notations techniques.
  // « } » ferme une branche ICU (plural, select) : la ponctuation qui la
  // précède termine une phrase et se vérifie aussi.
  for (const match of prose.matchAll(/(.)([;!?])(?=$|[\s»"'<).,}  ])/gu)) {
    if (!NON_BREAKING.test(match[1]) && !/[;!?]/u.test(match[1]))
      issues.push(match[0]);
  }
  for (const match of prose.matchAll(/(.):(?=$|[\s»"'<)}  ])/gu)) {
    if (!NON_BREAKING.test(match[1])) issues.push(match[0]);
  }
  for (const match of prose.matchAll(/«(.?)/gu)) {
    if (!NON_BREAKING.test(match[1])) issues.push(match[0]);
  }
  for (const match of prose.matchAll(/(.?)»/gu)) {
    if (!NON_BREAKING.test(match[1])) issues.push(match[0]);
  }
  return issues;
}

/** Lit les msgstr (y compris sur plusieurs lignes) avec leur numéro de ligne. */
function readMsgstrs(po: string): { line: number; text: string }[] {
  const entries: { line: number; parts: string[] }[] = [];
  let current: { line: number; parts: string[] } | null = null;
  po.split("\n").forEach((raw, index) => {
    if (raw.startsWith("msgstr ")) {
      current = {
        line: index + 1,
        parts: [JSON.parse(raw.slice(7)) as string],
      };
      entries.push(current);
    } else if (current && raw.startsWith('"')) {
      current.parts.push(JSON.parse(raw) as string);
    } else {
      current = null;
    }
  });
  // La première entrée est l'en-tête du fichier (msgid vide), pas une traduction.
  return entries
    .slice(1)
    .map(({ line, parts }) => ({ line, text: parts.join("") }));
}

describe("typographie française du catalogue fr", () => {
  it("repère les espaces simples ou absentes devant la ponctuation haute", () => {
    expect(findFrenchTypographyIssues("Version : 2")).toEqual([" :"]);
    expect(findFrenchTypographyIssues("Source: Orion")).toEqual(["e:"]);
    expect(findFrenchTypographyIssues("Prêt ?")).toEqual([" ?"]);
    expect(findFrenchTypographyIssues("Fini !")).toEqual([" !"]);
    expect(findFrenchTypographyIssues("a ; b")).toEqual([" ;"]);
    expect(findFrenchTypographyIssues("« Orion »")).toEqual(["« ", " »"]);
    expect(findFrenchTypographyIssues("«Orion»")).toEqual(["«O", "n»"]);
  });

  it("vérifie la ponctuation en fin de branche ICU", () => {
    expect(
      findFrenchTypographyIssues("{n, plural, one {Prêt ?} other {x}}"),
    ).toEqual([" ?"]);
    expect(
      findFrenchTypographyIssues("{n, select, a {Note :} other {x}}"),
    ).toEqual([" :"]);
    expect(
      findFrenchTypographyIssues("{n, plural, one {Prêt\u00a0?} other {x}}"),
    ).toEqual([]);
  });

  it("accepte les espaces insécables et ignore URL, heures, variables et entités", () => {
    expect(findFrenchTypographyIssues("Version : 2 ; prêt ?!")).toEqual([]);
    expect(findFrenchTypographyIssues("« {title} »")).toEqual([]);
    expect(
      findFrenchTypographyIssues("Utilisez https://exemple.fr/a?b=1 à 10:30"),
    ).toEqual([]);
    expect(
      findFrenchTypographyIssues("Codes HTML (comme &eacute;) restants"),
    ).toEqual([]);
    expect(findFrenchTypographyIssues("Raccourci {shortcut}")).toEqual([]);
  });

  // Issue 765 : la note de bienvenue (texte en dur) gardait des espaces simples.
  it("n'a aucune espace simple dans les textes français écrits en dur", () => {
    const offenders = Object.entries(HARDCODED_FRENCH_TEXTS)
      .map(([source, text]) => ({
        source,
        issues: findFrenchTypographyIssues(text),
      }))
      .filter(({ issues }) => issues.length > 0)
      .map(({ source, issues }) => `${source} ${JSON.stringify(issues)}`);

    expect(offenders).toEqual([]);
  });

  it("n'a aucune espace simple devant « : ; ! ? » ni dans « … » dans les msgstr", () => {
    const offenders = readMsgstrs(readFileSync(CATALOG, "utf8"))
      .map(({ line, text }) => ({
        line,
        issues: findFrenchTypographyIssues(text),
      }))
      .filter(({ issues }) => issues.length > 0)
      .map(
        ({ line, issues }) => `messages.po:${line} ${JSON.stringify(issues)}`,
      );

    expect(offenders).toEqual([]);
  });
});
