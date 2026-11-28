import { json2md } from "@syntheo/editor/markdown";

// Image jointe dans le Markdown d'une synthèse affiché en lecture seule
// (version précédente, relecture d'une proposition ; issue 697) : elle est
// désignée par l'identifiant de sa pièce jointe, `attachment://<id>`, jamais
// par une adresse de fichier. Seul le rendu de ces vues la résout, et
// seulement si la session connaît cette pièce jointe.
const ATTACHMENT_IMAGE_PREFIX = "attachment://";

type JsonNode = {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
  [key: string]: unknown;
};

function imageAttachmentId(node: JsonNode): string | null {
  // Même ordre que l'affichage de la note (`ResizableImageView`).
  for (const key of ["sharedAttachmentId", "attachmentId"]) {
    const value = node.attrs?.[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/** Adresse `attachment://` d'une pièce jointe (identifiant encodé). */
export function attachmentImageSrc(attachmentId: string): string {
  return (
    ATTACHMENT_IMAGE_PREFIX +
    encodeURIComponent(attachmentId).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    )
  );
}

/** Identifiant de pièce jointe d'une adresse `attachment://`, sinon null. */
export function attachmentIdFromImageSrc(src: unknown): string | null {
  if (typeof src !== "string" || !src.startsWith(ATTACHMENT_IMAGE_PREFIX)) {
    return null;
  }
  try {
    const id = decodeURIComponent(src.slice(ATTACHMENT_IMAGE_PREFIX.length));
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function withAttachmentImageSources(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const node = value as JsonNode;
  const attachmentId = node.type === "image" ? imageAttachmentId(node) : null;
  const content = Array.isArray(node.content)
    ? node.content.map(withAttachmentImageSources)
    : node.content;
  return {
    ...node,
    ...(attachmentId
      ? { attrs: { ...node.attrs, src: attachmentImageSrc(attachmentId) } }
      : {}),
    ...(content !== undefined ? { content } : {}),
  };
}

/**
 * Markdown d'un corps de synthèse pour les vues en lecture seule : comme
 * `json2md`, mais une image jointe y garde l'identifiant de sa pièce jointe
 * (`attachment://<id>`) au lieu d'une adresse locale, ou de rien du tout
 * quand la note n'enregistre que l'identifiant (issue 661).
 */
export function summaryBodyToMarkdown(body: string, format: string): string {
  if (!body || format === "markdown") return body ?? "";
  try {
    return json2md(
      withAttachmentImageSources(JSON.parse(body)) as Parameters<
        typeof json2md
      >[0],
    );
  } catch (error) {
    console.error("[session] failed to read a summary body", error);
    return "";
  }
}

type NoteImage = { alt: string; attachmentId: string | null };

function collectNoteImages(value: unknown, images: NoteImage[]): void {
  if (!value || typeof value !== "object") return;
  const node = value as JsonNode;
  if (node.type === "image") {
    const alt = node.attrs?.alt;
    images.push({
      alt: typeof alt === "string" ? alt : "",
      attachmentId: imageAttachmentId(node),
    });
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectNoteImages(child, images);
  }
}

// `![alt](destination "titre")` tel qu'écrit par json2md ou par la
// sérialisation Rust (`<>` pour une destination vide ou avec espaces).
const MARKDOWN_IMAGE =
  /!\[((?:\\.|[^\\\]])*)\]\(\s*(?:<(?:\\.|[^\\>\n])*>|[^\s()]*)((?:\s+(?:"(?:\\.|[^\\"])*"|'(?:\\.|[^\\'])*'))?)\s*\)/g;

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

/**
 * Markdown d'une synthèse enregistré ailleurs (proposition du CLI ou du MCP,
 * calculée côté Rust ; issue 697) : chaque image y est rapprochée, dans
 * l'ordre et par son texte alternatif, des images du corps de la note.
 * Une image jointe de la note est alors désignée par `attachment://<id>`,
 * quelle que soit l'adresse écrite dans le Markdown. Une image sans
 * correspondance garde son adresse, que le rendu continue de bloquer.
 */
export function withSummaryAttachmentImages(
  markdown: string,
  noteBody: string | null | undefined,
): string {
  if (!markdown || !noteBody) return markdown;
  const images: NoteImage[] = [];
  try {
    collectNoteImages(JSON.parse(noteBody), images);
  } catch {
    return markdown;
  }
  if (images.length === 0) return markdown;

  let next = 0;
  return markdown.replace(
    MARKDOWN_IMAGE,
    (token, rawAlt: string, title: string) => {
      const alt = unescapeMarkdown(rawAlt);
      const index = images.findIndex(
        (image, position) => position >= next && image.alt === alt,
      );
      if (index < 0) return token;
      next = index + 1;
      const { attachmentId } = images[index];
      return attachmentId
        ? `![${rawAlt}](${attachmentImageSrc(attachmentId)}${title})`
        : token;
    },
  );
}
