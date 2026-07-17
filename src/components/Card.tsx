import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly padded?: boolean;
}

/** Generic white surface card — base for transcript blocks, report sections, session cards. */
export function Card({
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "rounded-(--syn-radius-lg) border border-(--syn-border) bg-(--syn-surface) transition-[border-color,box-shadow,opacity] duration-100 hover:border-(--syn-blue)",
        padded && "px-4.5 py-3.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
