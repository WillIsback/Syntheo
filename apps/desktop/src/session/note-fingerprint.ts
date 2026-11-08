// Empreinte de la note brute (issue 415). Gardée dans les métadonnées de
// génération d'une synthèse, elle dit si la note a changé depuis : la vue
// « Mes notes » propose alors « Régénérer avec mes notes ». Seul le texte
// compte : mise en forme et lignes vides ne changent pas l'empreinte.

import { md2json } from "@syntheo/editor/markdown";

const FINGERPRINT_VERSION = "v1";

type JsonNode = {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown> | null;
  content?: unknown;
};

function parseNoteDocument(body: string, format: string): unknown {
  if (!body) {
    return null;
  }
  if (format === "markdown") {
    try {
      return md2json(body);
    } catch {
      return { type: "doc", content: [{ type: "text", text: body }] };
    }
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return { type: "doc", content: [{ type: "text", text: body }] };
  }
}

function collectLines(node: unknown, lines: string[], current: string[]) {
  if (!node || typeof node !== "object") {
    return;
  }
  const { text, attrs, content } = node as JsonNode;
  if (typeof text === "string") {
    current.push(text);
    return;
  }
  const label = attrs?.label ?? attrs?.name;
  if (typeof label === "string" && !Array.isArray(content)) {
    current.push(label);
    return;
  }
  if (!Array.isArray(content)) {
    return;
  }
  const inline = content.every(
    (child) =>
      child &&
      typeof child === "object" &&
      !Array.isArray((child as JsonNode).content),
  );
  if (inline) {
    const line: string[] = [];
    for (const child of content) {
      collectLines(child, lines, line);
    }
    lines.push(line.join(""));
    return;
  }
  for (const child of content) {
    collectLines(child, lines, current);
  }
}

function noteText(body: string, format: string): string {
  const lines: string[] = [];
  const loose: string[] = [];
  collectLines(parseNoteDocument(body, format), lines, loose);
  if (loose.length > 0) {
    lines.push(loose.join(""));
  }
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// cyrb53 : hachage court et stable, suffisant pour détecter un changement.
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, "0");
}

export function noteFingerprint(
  body: string,
  format = "prosemirror_json",
): string {
  return `${FINGERPRINT_VERSION}:${hash(noteText(body, format))}`;
}

// Sans empreinte (synthèse générée avant l'issue 415), on ne sait pas : pas
// de bandeau plutôt qu'un bandeau à tort.
export function noteChangedSinceSummary(
  rawMd: string,
  sourceNoteFingerprint: string | null | undefined,
): boolean {
  if (!sourceNoteFingerprint) {
    return false;
  }
  return noteFingerprint(rawMd) !== sourceNoteFingerprint;
}
