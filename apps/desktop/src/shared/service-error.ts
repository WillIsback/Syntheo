import { t } from "@lingui/core/macro";

// Erreurs des serveurs (synthèse, chat, transcription, import) montrées à
// l'utilisateur (issue 713) : un message traduit et utile, jamais l'URL
// complète ni une clé d'API. Les messages bruts du transport (« error sending
// request for url (http://…) », « UnexpectedStatus { status: 500 } »,
// « end of stream »…) et les phrases anglaises du code Rust sont reconnus ;
// un message inconnu est affiché nettoyé (adresses réduites à l'hôte, jetons
// masqués, 200 caractères au plus).

const URL_PATTERN = /\bhttps?:\/\/[^\s)"'<>]+/gi;
const SECRET_PATTERNS = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:api[_-]?key|token|secret)\s*[=:]\s*[^\s,;&]+/gi,
];

/** Le texte d'une erreur, quelle que soit sa forme. */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

/** Adresses réduites à leur hôte, jetons masqués. */
export function sanitizeErrorText(text: string): string {
  let out = text.replace(URL_PATTERN, (url) => {
    try {
      return new URL(url).host;
    } catch {
      return "…";
    }
  });
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "***");
  }
  out = out.replace(/\s+/g, " ").trim();
  return out.length > 200 ? `${out.slice(0, 199)}…` : out;
}

function statusOf(text: string): number | null {
  const match =
    /status(?:\s*code)?\s*[:=]?\s*\{?\s*(?:status\s*:\s*)?(\d{3})\b/i.exec(
      text,
    ) ?? /\b(?:HTTP|error|code)\s*([45]\d{2})\b/i.exec(text);
  return match ? Number(match[1]) : null;
}

/** Message traduit pour une erreur d'un serveur. */
export function describeServiceError(error: unknown): string {
  const raw = errorText(error);
  const text = raw.toLowerCase();
  const status = statusOf(raw);

  if (
    status === 401 ||
    text.includes("unauthorized") ||
    text.includes("authentication failed") ||
    text.includes("invalid api key") ||
    text.includes("incorrect api key")
  ) {
    return t`The server rejected the API key. Check it in Settings.`;
  }
  if (
    status === 403 ||
    text.includes("forbidden") ||
    text.includes("access denied")
  ) {
    return t`The server refused the request. Check that the API key is allowed to use this model.`;
  }
  if (
    status === 429 ||
    text.includes("rate limit") ||
    text.includes("too many requests")
  ) {
    return t`The server is busy or the quota is reached. Try again in a few minutes.`;
  }
  if (text.includes("timed out") || text.includes("timeout")) {
    return t`The server took too long to answer. Try again.`;
  }
  if (
    text.includes("error sending request") ||
    text.includes("connection refused") ||
    text.includes("failed to connect") ||
    text.includes("could not connect") ||
    text.includes("failed to fetch") ||
    text.includes("dns") ||
    text.includes("network error") ||
    text.includes("no route to host")
  ) {
    return t`The server could not be reached. Check that it is running and that its address in Settings is correct.`;
  }
  if (
    text.includes("end of stream") ||
    text.includes("unexpected eof") ||
    text.includes("connection reset") ||
    text.includes("connection closed")
  ) {
    return t`The connection to the server was interrupted. Try again.`;
  }
  if (status !== null && status >= 500) {
    return t`The server returned an error (${status}). Try again later, or check the server logs.`;
  }
  if (status === 400 || status === 413 || status === 422) {
    return t`The server could not process this request (${status}). Check the model and the server settings.`;
  }
  if (text.includes("not enough transcript")) {
    return t`Not enough transcript was recorded to write a summary.`;
  }
  if (text.includes("proposal is stale")) {
    return t`This proposal is out of date: the meeting changed after it was created.`;
  }
  const cleaned = sanitizeErrorText(raw);
  return cleaned || t`Something went wrong. Try again.`;
}
