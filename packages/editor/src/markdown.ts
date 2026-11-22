import { Node as PMNode } from "prosemirror-model";

import { getParser } from "./markdown/parser";
import { markdownSchema } from "./markdown/schema";
import { getSerializer } from "./markdown/serializer";

export { markdownSchema } from "./markdown/schema";

// ---------------------------------------------------------------------------

function liftBlockImages(doc: JSONContent): JSONContent {
  if (!doc.content) return doc;

  const out: JSONContent[] = [];
  for (const node of doc.content) {
    if (
      node.type === "paragraph" &&
      node.content &&
      node.content.length === 1 &&
      node.content[0].type === "image"
    ) {
      out.push(node.content[0]);
    } else {
      out.push(node);
    }
  }
  return { ...doc, content: out };
}

function wrapBlockImages(doc: JSONContent): JSONContent {
  if (!doc.content) return doc;

  const out: JSONContent[] = [];
  for (const node of doc.content) {
    if (node.type === "image") {
      out.push({ type: "paragraph", content: [node] });
    } else {
      out.push(node);
    }
  }
  return { ...doc, content: out };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export interface JSONContent {
  type?: string;
  attrs?: Record<string, any>;
  content?: JSONContent[];
  marks?: { type: string; attrs?: Record<string, any> }[];
  text?: string;
}

export const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function isValidContent(content: unknown): content is JSONContent {
  if (!content || typeof content !== "object") {
    return false;
  }
  const obj = content as Record<string, unknown>;
  return obj.type === "doc" && Array.isArray(obj.content);
}

export function parseJsonContent(raw: string | undefined | null): JSONContent {
  if (typeof raw !== "string" || !raw.trim()) {
    return EMPTY_DOC;
  }
  try {
    const parsed = JSON.parse(raw);
    return isValidContent(parsed) ? parsed : EMPTY_DOC;
  } catch {
    return EMPTY_DOC;
  }
}

/**
 * Image qu'un contenu généré peut afficher (issues 642 et 677) : seulement
 * `data:image`. Une adresse de fichier local (protocole asset, `file:`, chemin,
 * chemin réseau) ou distante n'est jamais rendue d'office.
 */
export function isGeneratedImageSrc(src: unknown): boolean {
  return (
    typeof src === "string" &&
    src.trim().toLowerCase().startsWith("data:image/")
  );
}

const ATTACHMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function attachmentIdOf(node: JSONContent): string | null {
  const id = node.attrs?.attachmentId;
  return typeof id === "string" && ATTACHMENT_ID.test(id) ? id : null;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Image que le parseur Markdown a laissée en texte brut (adresse `file:` refusée
// par markdown-it, HTML non interprété) : seul son texte alternatif reste
// (QA 0.8.0-1, issue 678). Jamais dans du code.
const RAW_MARKDOWN_IMAGE = /!\[([^\]\n]*)\]\([^)\n]*\)/g;
const RAW_HTML_IMAGE = /<img\b[^>]*>/gi;
const HTML_ALT = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

function scrubRawImages(text: string): string {
  return text
    .replace(RAW_MARKDOWN_IMAGE, (_, alt: string) => alt.trim())
    .replace(RAW_HTML_IMAGE, (tag) => {
      const match = HTML_ALT.exec(tag);
      return (match?.[1] ?? match?.[2] ?? "").trim();
    });
}

function isCode(node: JSONContent): boolean {
  return (
    node.type === "codeBlock" ||
    (node.marks ?? []).some((mark) => mark.type === "code")
  );
}

// Contenu généré : une image n'est gardée que si elle est en `data:image` ou si
// c'est une pièce jointe désignée par son identifiant (sans adresse) ; sinon,
// son texte alternatif la remplace. Une pièce jointe de fichier n'est gardée
// que par identifiant ; une adresse de fichier local laisse le nom seul.
function stripRemoteImageNodes(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    if (node.type === "image" || node.type === "fileAttachment") {
      const attachmentId = attachmentIdOf(node);
      if (attachmentId) {
        const { src: _src, path: _path, ...attrs } = node.attrs ?? {};
        out.push({ ...node, attrs: { ...attrs, attachmentId } });
        continue;
      }
      if (node.type === "image" && isGeneratedImageSrc(node.attrs?.src)) {
        out.push(node);
        continue;
      }
      const label = textOf(
        node.type === "image" ? node.attrs?.alt : node.attrs?.name,
      );
      if (label) out.push({ type: "text", text: label });
      continue;
    }
    if (
      node.type === "text" &&
      typeof node.text === "string" &&
      !isCode(node)
    ) {
      const text = scrubRawImages(node.text);
      if (text) out.push(text === node.text ? node : { ...node, text });
      continue;
    }
    if (!node.content || isCode(node)) {
      out.push(node);
      continue;
    }
    const content = stripRemoteImageNodes(node.content);
    if (content.length > 0) {
      out.push({ ...node, content });
    } else {
      const { content: _content, ...rest } = node;
      out.push(rest);
    }
  }
  return out;
}

export function stripRemoteImages(doc: JSONContent): JSONContent {
  if (!doc.content) return doc;
  // Une image de bloc retirée laisse son texte alternatif dans un paragraphe.
  const content = stripRemoteImageNodes(doc.content).map((node) =>
    node.type === "text" ? { type: "paragraph", content: [node] } : node,
  );
  return {
    ...doc,
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

export function md2json(
  markdown: string,
  options: { stripRemoteImages?: boolean } = {},
): JSONContent {
  try {
    const doc = getParser().parse(markdown);
    const json = doc.toJSON() as JSONContent;
    if (!json.content || json.content.length === 0) {
      return { type: "doc", content: [{ type: "paragraph" }] };
    }
    const lifted = liftBlockImages(json);
    return options.stripRemoteImages ? stripRemoteImages(lifted) : lifted;
  } catch (error) {
    console.error(error);
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: markdown }],
        },
      ],
    };
  }
}

export function json2md(jsonContent: JSONContent): string {
  try {
    const wrapped = wrapBlockImages(jsonContent);
    const doc = PMNode.fromJSON(markdownSchema, wrapped);
    return getSerializer().serialize(doc);
  } catch (error) {
    console.error(error);
    return "";
  }
}
