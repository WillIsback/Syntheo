import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "filled" | "outline" | "ghost" | "icon";
}

/** Pill-shaped action button. `filled` = primary blue, `outline` = default doc action, `icon` = circular icon-only. */
export function Button({
  variant = "outline",
  className,
  children,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded-(--syn-radius-pill) border border-transparent px-3.5 py-1.75 font-(--syn-font-ui) text-[13px] font-medium transition-colors disabled:cursor-default disabled:opacity-50";
  const variantClass: Record<"filled" | "outline" | "ghost" | "icon", string> =
    {
      outline:
        "border-(--syn-border) bg-(--syn-surface) text-(--syn-blue) hover:not-disabled:bg-(--syn-blue-light)",
      filled:
        "border-(--syn-blue) bg-(--syn-blue) text-white hover:not-disabled:bg-(--syn-blue-dark)",
      ghost:
        "rounded-[20px] border-transparent bg-transparent px-3 py-1.5 text-(--syn-text-2) hover:not-disabled:bg-(--syn-bg)",
      icon: "rounded-full border-(--syn-border) bg-(--syn-surface) px-2 py-1.75 text-(--syn-text-2) hover:not-disabled:bg-(--syn-bg)",
    };

  return (
    <button
      className={[base, variantClass[variant], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
