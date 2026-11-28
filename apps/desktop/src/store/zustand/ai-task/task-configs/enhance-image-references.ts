export type EnhanceImageContext = {
  base64: string;
  mimeType: string;
  filename?: string;
};

export type ImageReference = {
  attachmentId?: string;
  filename?: string;
  dataUrl?: { base64: string; mimeType: string };
};

export type IndexedImageReference = ImageReference & {
  index: number;
};

export const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const EXTENSION_TO_MIME: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g;

export function collectImageReferences(rawContent: string): ImageReference[] {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{")) {
    try {
      return collectJsonImageReferences(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }

  return collectMarkdownImageReferences(trimmed);
}

type NoteJsonNode = {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown[];
};

/**
 * Image de la note : nœud `image`, ou pièce jointe dont le type ou
 * l'extension désigne une image. Même règle pour la collecte des images et
 * pour leur remplacement dans le texte, pour que leurs numéros concordent.
 */
function isNoteImageNode(node: NoteJsonNode): boolean {
  if (node.type !== "image" && node.type !== "fileAttachment") {
    return false;
  }
  const mimeType =
    typeof node.attrs?.mimeType === "string" ? node.attrs.mimeType : "";
  const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
  return (
    node.type === "image" ||
    mimeType.startsWith("image/") ||
    !!getImageMimeType(getPathExtension(src))
  );
}

function collectJsonImageReferences(node: unknown): ImageReference[] {
  const references: ImageReference[] = [];

  function visit(value: unknown) {
    if (!value || typeof value !== "object") {
      return;
    }

    const node = value as NoteJsonNode;
    if (isNoteImageNode(node)) {
      references.push(referenceFromAttrs(node.attrs));
    }

    node.content?.forEach(visit);
  }

  visit(node);
  return references;
}

/** Blocs de texte : une image y est en ligne, au fil du texte. */
const TEXTBLOCK_TYPES = new Set(["paragraph", "heading"]);

/**
 * Copie du contenu JSON de la note où chaque image devient un texte lisible
 * (issue 750) : `label(position)` reçoit la position de l'image dans la note
 * (0, 1…), dans l'ordre de `collectImageReferences`. Sans ce remplacement, le
 * Markdown de la note porte `![]( "char-editor-width=80")` : l'image jointe par
 * identifiant n'a pas d'adresse. Une image en bloc (hors d'un paragraphe ou
 * d'un titre) devient un paragraphe : un simple texte entre deux blocs serait
 * collé au paragraphe suivant dans le Markdown (issue 770).
 */
export function replaceNoteImages(
  doc: unknown,
  label: (position: number) => string,
): unknown {
  let position = 0;

  function visit(value: unknown, parentType: unknown): unknown {
    if (!value || typeof value !== "object") {
      return value;
    }
    const node = value as NoteJsonNode;
    if (isNoteImageNode(node)) {
      const text = { type: "text", text: label(position++) };
      return typeof parentType === "string" && TEXTBLOCK_TYPES.has(parentType)
        ? text
        : { type: "paragraph", content: [text] };
    }
    if (!Array.isArray(node.content)) {
      return node;
    }
    return {
      ...node,
      content: node.content.map((child) => visit(child, node.type)),
    };
  }

  return visit(doc, undefined);
}

function collectMarkdownImageReferences(markdown: string): ImageReference[] {
  const references: ImageReference[] = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const src = unwrapMarkdownUrl(match[1]);
    references.push(referenceFromSrc(src));
  }
  return references;
}

function referenceFromAttrs(
  attrs: Record<string, unknown> | undefined,
): ImageReference {
  const attachmentId =
    typeof attrs?.attachmentId === "string" && attrs.attachmentId.length > 0
      ? attrs.attachmentId
      : undefined;
  const src = typeof attrs?.src === "string" ? attrs.src : "";
  const path = typeof attrs?.path === "string" ? attrs.path : "";
  const srcRef = referenceFromSrc(src);

  return {
    attachmentId,
    dataUrl: srcRef.dataUrl,
    filename: srcRef.filename ?? getAttachmentFilename(path),
  };
}

function referenceFromSrc(src: string): ImageReference {
  const dataUrl = parseImageDataUrl(src);
  if (dataUrl) {
    return { dataUrl };
  }

  return { filename: getAttachmentFilename(src) };
}

function parseImageDataUrl(src: string): EnhanceImageContext | null {
  const match = src.match(
    /^data:(image\/(?:gif|jpe?g|png|webp));base64,(.+)$/i,
  );
  if (!match) {
    return null;
  }

  const mimeType =
    match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1];
  const base64 = match[2];
  if (getBase64ByteLength(base64) > MAX_SOURCE_IMAGE_BYTES) {
    return null;
  }

  return { base64, mimeType };
}

function unwrapMarkdownUrl(src: string): string {
  const unwrapped =
    src.startsWith("<") && src.endsWith(">") ? src.slice(1, -1) : src;
  return unwrapped.replace(/\\([()])/g, "$1");
}

export function getImageMimeType(extension: string | undefined): string | null {
  if (!extension) {
    return null;
  }

  return EXTENSION_TO_MIME[extension.toLowerCase()] ?? null;
}

function getPathExtension(path: string): string | undefined {
  const filename = getPathFilename(path);
  const dotIndex = filename?.lastIndexOf(".") ?? -1;
  return dotIndex >= 0 ? filename?.slice(dotIndex + 1) : undefined;
}

export function getPathFilename(path: string): string | undefined {
  const normalized = normalizePathLike(path);
  const filename = normalized.split(/[\\/]/).filter(Boolean).pop();
  return filename ? decodePathPart(filename) : undefined;
}

function getAttachmentFilename(src: string): string | undefined {
  const trimmed = src.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === "asset:" || url.protocol === "file:") {
      return getPathFilename(trimmed);
    }

    return undefined;
  } catch {}

  const normalized = normalizePathLike(trimmed);
  if (
    !normalized.includes("/attachments/") &&
    !normalized.includes("\\attachments\\")
  ) {
    return undefined;
  }

  return getPathFilename(normalized);
}

function normalizePathLike(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === "asset:" || url.protocol === "file:") {
      return decodePathPart(url.pathname);
    }
  } catch {}

  return decodePathPart(trimmed);
}

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getBase64ByteLength(base64: string): number {
  const normalized = base64.replace(/\s/g, "");
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}
