export interface SpeakerChipProps {
  readonly name: string;
  readonly color: string;
  readonly bg: string;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
}

/** Clickable speaker legend tag — used to filter a transcript by speaker. */
export function SpeakerChip({
  name,
  color,
  bg,
  selected,
  onClick,
  className,
}: SpeakerChipProps) {
  const chipClass = [
    "inline-flex select-none items-center gap-1.5 rounded-(--syn-radius-pill) border border-transparent px-2.5 py-1 font-(--syn-font-ui) text-[12px] font-medium",
    "hover:border-current",
    selected && "border-current",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        className={chipClass}
        style={{ background: bg, color }}
        onClick={onClick}
      >
        <span className="size-2 rounded-full bg-current" />
        {name}
      </button>
    );
  }

  return (
    <div className={chipClass} style={{ background: bg, color }}>
      <span className="size-2 rounded-full bg-current" />
      {name}
    </div>
  );
}
