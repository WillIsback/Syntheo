import {
  parseImageMetadata,
  useAttachmentResolver,
} from "@syntheo/editor/node-views";
import { cn } from "@syntheo/utils";

import { attachmentIdFromImageSrc } from "~/session/summary-markdown";
import { isGeneratedImageSrc } from "~/shared/safe-markdown";

// Contenu généré : seule une image `data:image` est affichée ; toute autre
// adresse (distante ou de fichier local) laisse son texte alternatif, sans
// aucune requête (issues 642, 677 et 678). Exception (issue 697) : une image
// désignée par l'identifiant de sa pièce jointe (`attachment://<id>`)
// s'affiche si la session la connaît ; son adresse locale vient alors du
// résolveur de la session, jamais du Markdown. Sans résolveur fourni (rendu
// en direct de la synthèse), elle laisse aussi son texte alternatif.
function StreamdownImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const resolveAttachment = useAttachmentResolver();
  const attachmentId = attachmentIdFromImageSrc(props.src);
  const src = attachmentId
    ? (resolveAttachment?.(attachmentId)?.src ?? null)
    : isGeneratedImageSrc(props.src)
      ? props.src
      : null;
  if (!src) {
    return props.alt ? <span>{props.alt}</span> : null;
  }
  const { editorWidth, title } = parseImageMetadata(props.title);
  const className = cn(["max-w-full", props.className]);
  const style = {
    ...(editorWidth ? { width: `${editorWidth}%` } : {}),
    ...(props.style || {}),
  };
  return (
    <img
      {...props}
      src={src}
      title={title}
      className={className}
      style={style}
    />
  );
}

// Typography comes from the shared `.note-typography` scope (see
// packages/editor styles) so the streaming view matches the editor exactly;
// only structural concerns live here.
export const streamdownComponents = {
  // Streamdown's built-in li carries `py-1` (4px/side); the editor's rhythm is
  // 0.125em/side on `li > p`. Padding the li itself (with `[&>p]:inline` so
  // loose lists don't double-pad) keeps the flat streaming gap identical.
  // A nested list breaks that equivalence: the li's padding wraps the whole
  // li (text + sublist), while the editor pads only the text row. Shifting
  // the li's share onto the sublist via margins (mt adds the missing half
  // above, -mb cancels the li's bottom pad below) restores the 0.25em rhythm
  // without stretching the sublist's guide rail. `!` because note-typography's
  // `ul { margin-block: 0 }` reset is unlayered and outranks plain utilities.
  li: ({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li
      {...props}
      className={cn([
        "py-[0.125em] [&>p]:inline",
        "[&>:is(ul,ol)]:mt-[0.125em]! [&>:is(ul,ol)]:-mb-[0.125em]!",
        className,
      ])}
    />
  ),
  img: StreamdownImage,
} as const;
