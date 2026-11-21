import { parseImageMetadata } from "@syntheo/editor/node-views";
import { cn } from "@syntheo/utils";

import { isLocalImageSrc, RemoteImage } from "~/shared/safe-markdown";

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
  // Image distante : jamais chargée d'office (issue 642).
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { editorWidth, title } = parseImageMetadata(props.title);
    const className = cn(["max-w-full", props.className]);
    const style = {
      ...(editorWidth ? { width: `${editorWidth}%` } : {}),
      ...(props.style || {}),
    };

    if (typeof props.src !== "string" || !props.src) {
      return props.alt ? <span>{props.alt}</span> : null;
    }
    if (!isLocalImageSrc(props.src)) {
      return (
        <RemoteImage
          src={props.src}
          alt={props.alt}
          title={title}
          className={className}
          style={style}
        />
      );
    }
    return <img {...props} title={title} className={className} style={style} />;
  },
} as const;
