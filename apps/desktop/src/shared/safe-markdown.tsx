import { Trans } from "@lingui/react/macro";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useEffect, useState } from "react";
import { defaultRehypePlugins, type StreamdownProps } from "streamdown";

import {
  isGeneratedImageSrc,
  isRemoteWebImageSrc,
} from "@syntheo/editor/markdown";
import { cn } from "@syntheo/utils";

// Rendu des contenus générés (synthèses, chat, propositions) : une image
// distante n'est jamais chargée d'office, elle émettrait une requête vers un
// serveur tiers à chaque affichage (issue 642). Elle n'est récupérée qu'au
// clic, par le client HTTP de l'application, puis affichée depuis un `blob:`
// (seule origine distante permise par la CSP pour les images : aucune).

const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;

export { isGeneratedImageSrc, isRemoteWebImageSrc };

async function loadRemoteImage(src: string): Promise<string> {
  const url = new URL(src);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("unsupported protocol");
  }
  const response = await tauriFetch(url.href, { method: "GET" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("image/")) {
    throw new Error("not an image");
  }
  const blob = await response.blob();
  if (blob.size > MAX_REMOTE_IMAGE_BYTES) throw new Error("image too large");
  return URL.createObjectURL(blob);
}

export function RemoteImage({
  src,
  alt,
  title,
  className,
  style,
}: {
  src: string;
  alt?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [state, setState] = useState<
    | { phase: "idle" | "loading" | "failed" }
    | { phase: "loaded"; objectUrl: string }
  >({ phase: "idle" });

  useEffect(
    () => () => {
      if (state.phase === "loaded") URL.revokeObjectURL(state.objectUrl);
    },
    [state],
  );

  if (state.phase === "loaded") {
    return (
      <img
        src={state.objectUrl}
        alt={alt ?? ""}
        title={title}
        className={className}
        style={style}
      />
    );
  }

  let host = "";
  try {
    host = new URL(src).host;
  } catch {
    host = "";
  }

  return (
    <span
      data-remote-image
      className="border-border text-muted-foreground my-1 inline-flex max-w-full flex-wrap items-center gap-2 rounded-md border border-dashed px-2 py-1 text-xs"
    >
      {alt ? <span className="truncate">{alt}</span> : null}
      {host ? <span className="truncate opacity-70">{host}</span> : null}
      <button
        type="button"
        className={cn([
          "text-foreground underline underline-offset-2",
          "disabled:opacity-50",
        ])}
        disabled={state.phase === "loading"}
        onClick={() => {
          setState({ phase: "loading" });
          loadRemoteImage(src).then(
            (objectUrl) => setState({ phase: "loaded", objectUrl }),
            () => setState({ phase: "failed" }),
          );
        }}
      >
        {state.phase === "failed" ? (
          <Trans>Image unavailable</Trans>
        ) : (
          <Trans>Load image</Trans>
        )}
      </button>
    </span>
  );
}

/**
 * `img` des rendus Markdown de contenu généré : `data:image` affichée, image
 * web chargée au clic, toute autre adresse (fichier local, chemin réseau)
 * remplacée par son texte alternatif (issue 677).
 */
export function SafeMarkdownImage(
  props: React.ImgHTMLAttributes<HTMLImageElement>,
) {
  const { src, alt, title, className, style } = props;
  if (isGeneratedImageSrc(src)) {
    return <img {...props} />;
  }
  if (typeof src !== "string" || !isRemoteWebImageSrc(src)) {
    return alt ? <span>{alt}</span> : null;
  }
  return (
    <RemoteImage
      src={src}
      alt={alt}
      title={title}
      className={className}
      style={style}
    />
  );
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
