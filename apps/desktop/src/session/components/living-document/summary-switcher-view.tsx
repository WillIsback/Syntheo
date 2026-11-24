import { useLingui } from "@lingui/react/macro";
import type { ReactNode, Ref } from "react";

import {
  ArrowClockwise,
  CaretDown,
  ChartBar,
  Copy,
  Sparkle,
  Swap,
  Trash,
} from "@syntheo/ui/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@syntheo/ui/components/ui/dropdown-menu";
import { Spinner } from "@syntheo/ui/components/ui/spinner";
import { cn, safeParseDate } from "@syntheo/utils";

import { iconHeaderViewClassName } from "~/session/components/note-input/header-shared";

// Ce que l'étape Synthèse affiche (issue 415) : la note brute, la synthèse
// actuelle, ou une version remplacée en lecture seule.
export type SynthesisView =
  | { kind: "notes" }
  | { kind: "summary" }
  | { kind: "version"; versionId: string };

type SummaryVersionOption = {
  id: string;
  version: number;
  date: string | null;
};

const CURRENT_VERSION = "current";

const SEGMENT_FOCUS_CLASS =
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

export function formatVersionDate(
  iso: string | null | undefined,
  locale: string,
): string | null {
  const date = safeParseDate(iso);
  if (!date) {
    return null;
  }
  return date.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Partie visible du sélecteur « Mes notes | Synthèse · vN ▾ », sans accès aux
// données : le conteneur (summary-switcher.tsx) lui passe tout.
export function SummarySwitcherView({
  ref,
  view,
  onSelectView,
  currentVersion,
  currentDate,
  versions,
  isGenerating,
  summaryItems,
  currentNoteId,
  onSelectNote,
  canCopy,
  canRemove,
  onRegenerate,
  onChangeTemplate,
  onCopy,
  onMeasure,
  measureOutdated = false,
  onRemove,
  onMenuCloseAutoFocus,
  menuOpen,
  onMenuOpenChange,
  hasSummary = true,
}: {
  // Élément d'ancrage du sélecteur de modèle (issue 431) : sans lui, Radix
  // n'a rien sur quoi placer le sélecteur et le laisse hors de l'écran.
  ref?: Ref<HTMLDivElement>;
  view: SynthesisView;
  onSelectView: (view: SynthesisView) => void;
  currentVersion: number;
  currentDate: string | null;
  // Versions remplacées, la plus récente en tête.
  versions: readonly SummaryVersionOption[];
  isGenerating: boolean;
  // Une entrée par synthèse (une par modèle) quand il y en a plusieurs.
  summaryItems?: ReactNode;
  currentNoteId: string;
  onSelectNote: (enhancedNoteId: string) => void;
  canCopy: boolean;
  canRemove: boolean;
  // Absents quand la synthèse est coupée (issue 707) : entrées retirées.
  onRegenerate?: () => void;
  onChangeTemplate?: () => void;
  onCopy: () => void;
  /** Bêta (issue 671) : absent quand la mesure est désactivée. */
  onMeasure?: () => void;
  /** Seules des mesures d'une règle antérieure existent (issue 734). */
  measureOutdated?: boolean;
  onRemove: () => void;
  onMenuCloseAutoFocus?: (event: Event) => void;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /**
   * Aucune synthèse encore (issue 719) : ni « · v1 » ni « v1 Actuelle », qui
   * laissaient croire qu'une synthèse existait.
   */
  hasSummary?: boolean;
}) {
  const { t } = useLingui();
  const viewedVersion =
    view.kind === "version"
      ? versions.find((version) => version.id === view.versionId)
      : undefined;
  const shownVersion = viewedVersion?.version ?? currentVersion;
  // Contexte propre (passe QA 0.8.1-2) : « Summary » seul est traduit
  // « Résumé » ailleurs ; l'onglet s'appelle « Synthèse », comme « Synthèse ·
  // vN ».
  const summaryLabel = hasSummary
    ? t`Summary · v${shownVersion}`
    : t({ message: "Summary", context: "note view tab" });
  const showVersions = hasSummary || versions.length > 0;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={t`Note view`}
      data-tauri-drag-region="false"
      className="bg-foreground/10 dark:bg-accent/55 rounded-pill flex h-7 w-fit items-center gap-[2px] p-[2px]"
    >
      <button
        type="button"
        aria-pressed={view.kind === "notes"}
        onClick={() => onSelectView({ kind: "notes" })}
        className={iconHeaderViewClassName(
          view.kind === "notes",
          "tray",
          cn(["px-2.5 text-xs font-medium", SEGMENT_FOCUS_CLASS]),
        )}
      >
        {t`My notes`}
      </button>
      <button
        type="button"
        aria-pressed={view.kind !== "notes"}
        aria-label={summaryLabel}
        onClick={() => onSelectView({ kind: "summary" })}
        className={iconHeaderViewClassName(
          view.kind !== "notes",
          "tray",
          cn(["gap-1.5 px-2.5 text-xs font-medium", SEGMENT_FOCUS_CLASS]),
        )}
      >
        {isGenerating ? (
          <Spinner size={14} className="shrink-0" />
        ) : (
          <Sparkle aria-hidden="true" className="size-3.5" />
        )}
        <span>{summaryLabel}</span>
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t`Summary versions`}
            className={iconHeaderViewClassName(
              false,
              "tray",
              cn(["w-6 px-0", SEGMENT_FOCUS_CLASS]),
            )}
          >
            <CaretDown aria-hidden="true" className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          variant="app"
          align="end"
          className="w-64"
          onCloseAutoFocus={onMenuCloseAutoFocus}
        >
          {showVersions ? (
            <MenuSectionLabel>{t`Versions`}</MenuSectionLabel>
          ) : null}
          <DropdownMenuRadioGroup
            value={viewedVersion ? viewedVersion.id : CURRENT_VERSION}
            onValueChange={(value) =>
              onSelectView(
                value === CURRENT_VERSION
                  ? { kind: "summary" }
                  : { kind: "version", versionId: value },
              )
            }
          >
            {hasSummary ? (
              <DropdownMenuRadioItem value={CURRENT_VERSION}>
                <VersionLabel
                  version={currentVersion}
                  date={currentDate}
                  current={t`Current`}
                />
              </DropdownMenuRadioItem>
            ) : null}
            {versions.map((version) => (
              <DropdownMenuRadioItem key={version.id} value={version.id}>
                <VersionLabel version={version.version} date={version.date} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {summaryItems ? (
            <>
              <DropdownMenuSeparator />
              <MenuSectionLabel>{t`Summaries`}</MenuSectionLabel>
              <DropdownMenuRadioGroup
                value={currentNoteId}
                onValueChange={onSelectNote}
              >
                {summaryItems}
              </DropdownMenuRadioGroup>
            </>
          ) : null}
          <DropdownMenuSeparator />
          {onRegenerate ? (
            <DropdownMenuItem disabled={isGenerating} onSelect={onRegenerate}>
              <ArrowClockwise aria-hidden="true" />
              {t`Regenerate`}
            </DropdownMenuItem>
          ) : null}
          {onChangeTemplate ? (
            <DropdownMenuItem
              disabled={isGenerating}
              onSelect={onChangeTemplate}
            >
              <Swap aria-hidden="true" />
              {t`Change template…`}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={!canCopy} onSelect={onCopy}>
            <Copy aria-hidden="true" />
            {t`Copy`}
          </DropdownMenuItem>
          {onMeasure ? (
            <DropdownMenuItem disabled={!canCopy} onSelect={onMeasure}>
              <ChartBar aria-hidden="true" />
              <span className="flex flex-col">
                <span>{t`Measure rework…`}</span>
                {measureOutdated ? (
                  <span className="text-muted-foreground text-xs">
                    {t`Measure again (rule updated)`}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          ) : null}
          {canRemove ? (
            <DropdownMenuItem disabled={isGenerating} onSelect={onRemove}>
              <Trash aria-hidden="true" />
              {t`Remove`}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SummaryOptionItem({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <DropdownMenuRadioItem value={value}>
      <span className="truncate">{label}</span>
    </DropdownMenuRadioItem>
  );
}

function MenuSectionLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuLabel className="text-faint px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
      {children}
    </DropdownMenuLabel>
  );
}

function VersionLabel({
  version,
  date,
  current,
}: {
  version: number;
  date: string | null;
  current?: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="text-foreground font-medium tabular-nums">{`v${version}`}</span>
      {date ? (
        <span className="text-muted-foreground truncate tabular-nums">
          {date}
        </span>
      ) : null}
      {current ? (
        <span className="text-muted-foreground ml-auto text-xs">{current}</span>
      ) : null}
    </span>
  );
}
