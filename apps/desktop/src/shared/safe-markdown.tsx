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
function buildSafeRehypePlugins({
  attachmentImages = false,
}: { attachmentImages?: boolean } = {}): StreamdownProps["rehypePlugins"] {
  const sanitize = defaultRehypePlugins.sanitize;
  if (!Array.isArray(sanitize) || sanitize.length < 2) return undefined;
  const [sanitizePlugin, sanitizeSchema] = sanitize as [
    unknown,
    Record<string, unknown> & { protocols?: Record<string, string[]> },
  ];
  const protocols = attachmentImages
    ? {
        ...sanitizeSchema.protocols,
        src: [...(sanitizeSchema.protocols?.src ?? []), "attachment"],
      }
    : sanitizeSchema.protocols;
  return [
    defaultRehypePlugins.raw,
    [
      sanitizePlugin,
      { ...sanitizeSchema, protocols, clobberPrefix: "user-content-" },
    ],
    defaultRehypePlugins.harden,
  ] as NonNullable<StreamdownProps["rehypePlugins"]>;
}

export const safeRehypePlugins = buildSafeRehypePlugins();

// Vues en lecture seule d'une synthèse (version précédente, relecture d'une
// proposition ; issue 697) : l'adresse `attachment://<id>` d'une image jointe
// passe le nettoyage, pour que le rendu `img` la résolve parmi les pièces
// jointes de la session. Aucune autre adresse n'est ouverte : `asset:`,
// `file:` et les adresses distantes restent refusées par ce rendu.
export const summaryRehypePlugins = buildSafeRehypePlugins({
  attachmentImages: true,
});
