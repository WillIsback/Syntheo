import { ArrowClockwise, Heart } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import { TemplateIconGlyph, type TemplateIcon } from "~/templates";

export function TemplateSection({
  title,
  children,
  icon,
  uppercase = true,
  showHeader = true,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  uppercase?: boolean;
  showHeader?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {showHeader ? (
        <div className="flex items-center gap-2 px-2">
          {icon}
          <p
            className={cn([
              "text-muted-foreground font-mono text-[11px] font-medium tracking-wide",
              uppercase && "uppercase",
            ])}
          >
            {title}
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-0">{children}</div>
    </div>
  );
}

export function TemplateResultButton({
  buttonRef,
  title,
  icon,
  isFavorite = false,
  onClick,
  onKeyDown,
  regenerateLabel,
  isRegenerating = false,
  onRegenerate,
}: {
  buttonRef?: React.Ref<HTMLButtonElement>;
  title: string;
  icon: TemplateIcon;
  isFavorite?: boolean;
  onClick: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  regenerateLabel?: string;
  isRegenerating?: boolean;
  onRegenerate?: () => void;
}) {
  return (
    <div
      className={cn([
        "hover:bg-accent focus-within:bg-muted h-8 w-full rounded-md px-2.5",
        "flex items-center gap-1.5",
      ])}
    >
      <button
        ref={buttonRef}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus:outline-hidden"
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <TemplateIconGlyph icon={icon} className="size-4 text-sm" />
        <span className="text-foreground min-w-0 truncate text-sm font-medium">
          {title}
        </span>
        {isFavorite ? (
          <Heart aria-hidden className="text-primary size-3.5 shrink-0" />
        ) : null}
      </button>
      {regenerateLabel && onRegenerate ? (
        <button
          type="button"
          aria-label={regenerateLabel}
          disabled={isRegenerating}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRegenerate();
          }}
          className={cn([
            "text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            isRegenerating ? "cursor-not-allowed opacity-70" : "cursor-pointer",
          ])}
        >
          <ArrowClockwise
            className={cn(["size-3", isRegenerating && "animate-spin"])}
          />
          {regenerateLabel}
        </button>
      ) : null}
    </div>
  );
}
