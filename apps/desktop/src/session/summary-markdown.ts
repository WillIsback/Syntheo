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
