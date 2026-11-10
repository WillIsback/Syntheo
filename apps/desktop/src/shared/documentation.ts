// Documentation publique de Syntheo (Mintlify). Les pages vivent dans `docs/`
// du dépôt : garder ces chemins alignés sur `docs/docs.json`.
export const DOCUMENTATION_URL = "https://docs.syntheo.studio";

export function documentationUrl(page?: string): string {
  return page ? `${DOCUMENTATION_URL}/${page}` : DOCUMENTATION_URL;
}
