export const SESSION_NAME_MAX_LENGTH = 200;

/**
 * Accepte tout sauf : caractères de contrôle (0x00–0x1f) et les chars
 * invalides en nom de fichier sur Windows/Linux : < > : " / \ | ? *
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally rejects control characters in session names
export const SESSION_NAME_RE = /^[^<>:"/\\|?*\x00-\x1f]+$/;

/**
 * Retourne un message d'erreur localisé si le nom est invalide, null sinon.
 * Le nom passé doit déjà être trimmé.
 */
export function validateSessionName(name: string): string | null {
  if (!name) return "Le nom ne peut pas être vide";
  if (name.length > SESSION_NAME_MAX_LENGTH)
    return `Le nom ne peut pas dépasser ${SESSION_NAME_MAX_LENGTH} caractères`;
  if (!SESSION_NAME_RE.test(name))
    return String.raw`Le nom contient des caractères non autorisés (< > : " / \ | ? *)`;
  return null;
}
