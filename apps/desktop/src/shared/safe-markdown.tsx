import { defaultRehypePlugins, type StreamdownProps } from "streamdown";

import { isGeneratedImageSrc } from "@syntheo/editor/markdown";

// Rendu des contenus générés (synthèses, chat, propositions) : seule une image
// `data:image` est affichée. Toute autre adresse, distante (issue 642, chargée
// au clic jusqu'à l'issue 678, désormais retirée) ou de fichier local (issue
// 677), est remplacée par son texte alternatif : aucune requête ne part.

export { isGeneratedImageSrc };

/** `img` des rendus Markdown de contenu généré. */
export function SafeMarkdownImage(
  props: React.ImgHTMLAttributes<HTMLImageElement>,
) {
  if (isGeneratedImageSrc(props.src)) {
    return <img {...props} />;
  }
  return props.alt ? <span>{props.alt}</span> : null;
}

// Mêmes plugins que Streamdown, mais les `id` et `name` du HTML brut sont
// préfixés : un élément ne peut plus masquer une propriété de `document`
// (clobbering).
function buildSafeRehypePlugins(): StreamdownProps["rehypePlugins"] {
  const sanitize = defaultRehypePlugins.sanitize;
  if (!Array.isArray(sanitize) || sanitize.length < 2) return undefined;
  const [sanitizePlugin, sanitizeSchema] = sanitize as [
    unknown,
    Record<string, unknown>,
  ];
  return [
    defaultRehypePlugins.raw,
    [sanitizePlugin, { ...sanitizeSchema, clobberPrefix: "user-content-" }],
    defaultRehypePlugins.harden,
  ] as NonNullable<StreamdownProps["rehypePlugins"]>;
}

export const safeRehypePlugins = buildSafeRehypePlugins();
