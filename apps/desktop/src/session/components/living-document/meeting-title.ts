// Normalisation des titres de réunion (issue 498), partagée par la
// suggestion « même titre » de l'étape Préparer et par la règle de suggestion
// après la réunion (issue 499). Sans dépendance : le script de mesure
// `scripts/mesure-suggestion-dossier.mjs` l'importe directement dans Node.

const MONTHS = [
  "janvier",
  "janv",
  "fevrier",
  "fevr",
  "fev",
  "mars",
  "avril",
  "avr",
  "mai",
  "juin",
  "juillet",
  "juil",
  "aout",
  "septembre",
  "sept",
  "octobre",
  "novembre",
  "decembre",
  "january",
  "jan",
  "february",
  "feb",
  "march",
  "mar",
  "april",
  "apr",
  "may",
  "june",
  "jun",
  "july",
  "jul",
  "august",
  "aug",
  "september",
  "sep",
  "october",
  "oct",
  "november",
  "nov",
  "december",
  "dec",
].join("|");

// Un mois n'est retiré que collé à un nombre (« 2 nov. », « 1er mars »,
// « nov 2026 ») : « Point mars » garde son mot.
const DATE_WITH_MONTH = new RegExp(
  `\\d+(?:er)?\\s*(?:${MONTHS})\\b|\\b(?:${MONTHS})\\s*\\d+`,
  "g",
);
// Nombres (dates, numéros de séance), ordinal compris (« 2e », « 3rd »).
const NUMBER = /\d+(?:er|re|eme|e|st|nd|rd|th)?\b|\d+/g;

export function normalizeMeetingTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr")
    .replace(DATE_WITH_MONTH, " ")
    .replace(NUMBER, " ")
    .replace(/[^\p{L}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
