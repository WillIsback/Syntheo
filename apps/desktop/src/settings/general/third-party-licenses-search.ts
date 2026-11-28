// Recherche de la page des licences (issue 774). Une recherche par
// sous-chaîne était trop large : « MPL » remontait « …-impl » et « …sample ».
// La licence se cherche sur ses identifiants SPDX, en mots entiers ; le nom,
// sur le début de ses segments.

const SPDX_OPERATORS = new Set(["and", "or", "with"]);
const NAME_SEPARATOR = /[-_/@.\s:+]/;

/**
 * Identifiants d'une expression SPDX, en minuscules : « (MIT OR Apache-2.0)
 * AND Unicode-3.0 » donne « mit », « apache-2.0 », « unicode-3.0 ». Les
 * champs `license` non normalisés (« MIT/Apache-2.0 », « MIT, Apache-2.0 »)
 * se découpent aussi sur / et sur la virgule.
 */
export function spdxIdentifiers(expression: string): string[] {
  return expression
    .toLowerCase()
    .split(/[\s()/,]+/)
    .filter((token) => token !== "" && !SPDX_OPERATORS.has(token));
}

/**
 * Vrai si l'identifiant `identifier` est `wanted` ou une version de la même
 * famille : « mpl » trouve « mpl-2.0 », « bsd » trouve « bsd-3-clause »,
 * « gpl » trouve « gpl-3.0-only ». La suite doit commencer par un chiffre,
 * sauf si la recherche en contient déjà un (« bsd-3 » trouve
 * « bsd-3-clause »). Un suffixe « 0 » seul désigne une licence distincte :
 * « mit » ne trouve pas « mit-0 ».
 */
function identifierMatches(identifier: string, wanted: string): boolean {
  if (identifier === wanted) return true;
  if (!identifier.startsWith(`${wanted}-`)) return false;
  const suffix = identifier.slice(wanted.length + 1);
  if (suffix === "0") return false;
  return /^\d/.test(suffix) || /\d/.test(wanted);
}

/**
 * Vrai si chaque identifiant de `query` (en minuscules, sans espaces autour)
 * correspond à un identifiant de l'expression (voir identifierMatches). Une
 * expression entière (« mit or apache-2.0 ») correspond aussi à elle-même.
 */
export function licenseMatches(expression: string, query: string): boolean {
  if (!query) return true;
  const identifiers = spdxIdentifiers(expression);
  const queryIdentifiers = spdxIdentifiers(query);
  if (queryIdentifiers.length === 0) return false;
  return queryIdentifiers.every((wanted) =>
    identifiers.some((identifier) => identifierMatches(identifier, wanted)),
  );
}

/**
 * Vrai si `query` (en minuscules) commence le nom ou l'un de ses segments
 * (séparés par - _ / @ . etc.) : « dom » trouve « react-dom », « giscus »
 * trouve « @giscus/react », mais « mpl » ne trouve pas « serde-impl ».
 */
export function nameMatches(name: string, query: string): boolean {
  if (!query) return true;
  const lower = name.toLowerCase();
  for (let index = 0; index < lower.length; index += 1) {
    const atStart = index === 0 || NAME_SEPARATOR.test(lower.charAt(index - 1));
    if (atStart && lower.startsWith(query, index)) return true;
  }
  return false;
}

/**
 * Filtre d'un composant : par nom ou par licence. `licenseLabel` est le
 * libellé affiché quand il diffère de l'identifiant (licence inconnue,
 * traduite : issue 775).
 */
export function componentMatches(
  component: { name: string; license: string },
  query: string,
  licenseLabel: string = component.license,
): boolean {
  if (!query) return true;
  return (
    nameMatches(component.name, query) ||
    licenseMatches(component.license, query) ||
    (licenseLabel !== component.license && licenseMatches(licenseLabel, query))
  );
}
