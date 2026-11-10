// Étape « Envoyer vers une adresse » : la seule étape qui sort de la machine.
// L'adresse est choisie par l'utilisateur (n8n, Home Assistant, serveur
// maison) ; elle doit être en http ou https, sans identifiants dans l'URL.

export const DEFAULT_WEBHOOK_BODY = `{
  "title": "{{title}}",
  "date": "{{date}}",
  "summary": "{{summary}}"
}`;

export const WEBHOOK_TIMEOUT_MS = 15_000;

const TOKEN_PATTERN = /\{\{\s*(?:step:[\w-]+|[a-z_]+)\s*\}\}/g;

export function parseWebhookUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (!url.hostname || url.username || url.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/** Le corps reste du JSON valide une fois les variables remplacées. */
export function isWebhookBodyTemplateValid(body: string): boolean {
  if (!body.trim()) {
    return false;
  }
  try {
    JSON.parse(body.replace(TOKEN_PATTERN, ""));
    return true;
  } catch {
    return false;
  }
}

/** Une valeur insérée dans une chaîne JSON : guillemets et retours échappés. */
export function escapeJsonStringContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}
