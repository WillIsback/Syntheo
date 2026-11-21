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
 * Image servie par l'application elle-même : protocole asset (pièces jointes,
 * médias), `data:image`, `blob:` ou chemin relatif. Toute autre adresse est
 * distante.
 */
export function isLocalImageSrc(src: unknown): boolean {
  if (typeof src !== "string") return false;
  const value = src.trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (
    lower.startsWith("asset:") ||
    lower.startsWith("http://asset.localhost/") ||
    lower.startsWith("https://asset.localhost/") ||
    lower.startsWith("data:image/") ||
    lower.startsWith("blob:")
  ) {
    return true;
  }
  // Chemin relatif ou absolu de l'application, sans schéma ni hôte.
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//");
}

// Contenu généré (issue 642) : une image distante émettrait une requête à
// chaque affichage. Elle est remplacée par son texte alternatif, s'il existe.
function stripRemoteImageNodes(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    if (node.type === "image" && !isLocalImageSrc(node.attrs?.src)) {
      const alt =
        typeof node.attrs?.alt === "string" ? node.attrs.alt.trim() : "";
      if (alt) out.push({ type: "text", text: alt });
      continue;
    }
    out.push(
      node.content
        ? { ...node, content: stripRemoteImageNodes(node.content) }
        : node,
    );
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
