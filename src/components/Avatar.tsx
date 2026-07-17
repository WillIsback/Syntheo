export interface AvatarProps {
  /** 1-3 letter initials, e.g. "MR" */
  readonly initials: string;
  /** Hex or CSS color for the background, e.g. speakerPalette[i].fg */
  readonly color: string;
  readonly size?: number;
  readonly className?: string;
}

export function Avatar({ initials, color, size = 30, className }: AvatarProps) {
  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-full font-(--syn-font-ui) text-white",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: color,
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
    >
      {initials}
    </div>
  );
}
