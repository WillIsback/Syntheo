import { resolveDisplayLocale } from "~/i18n/locales";

// Documentation publique de Syntheo (Mintlify), bilingue : `/en/…` et `/fr/…`.
// Les pages vivent dans `docs/` du dépôt : garder ces chemins alignés sur
// `docs/docs.json`.
export const DOCUMENTATION_URL = "https://docs.syntheo.studio";

// `locale` : la langue de l'interface active (`i18n.locale`). Le français a
// sa documentation, toute autre locale ouvre la version anglaise.
export function documentationUrl(locale: string, page?: string): string {
  const language = resolveDisplayLocale(locale, null);
  return page
    ? `${DOCUMENTATION_URL}/${language}/${page}`
    : `${DOCUMENTATION_URL}/${language}`;
}
