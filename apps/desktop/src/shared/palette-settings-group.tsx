import { Trans, useLingui } from "@lingui/react/macro";
import { Command as CommandPrimitive } from "cmdk";

import { Gear, MagnifyingGlass } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import type { SettingsSearchResult } from "~/settings/search";

// Sans filtre, la palette `Ctrl K` montre au plus 5 paramètres, puis une
// ligne « Voir les N paramètres » qui active le filtre (issue 373).
export const PALETTE_SETTINGS_LIMIT = 5;

export const PALETTE_ITEM_CLASS = cn([
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
  "text-muted-foreground text-sm",
  "data-[selected=true]:bg-accent data-[selected=true]:text-foreground",
  "transition-colors",
]);

export function PaletteSettingsGroup({
  results,
  limit,
  withDivider,
  onSelect,
  onShowAll,
}: {
  results: SettingsSearchResult[];
  // Sans limite dans la palette filtrée.
  limit?: number;
  withDivider: boolean;
  onSelect: (result: SettingsSearchResult) => void;
  onShowAll: () => void;
}) {
  const { t } = useLingui();
  const shown = limit === undefined ? results : results.slice(0, limit);
  const hidden = results.length > shown.length;

  return (
    <CommandPrimitive.Group
      className="pb-1.5"
      heading={
        <div className="flex flex-col gap-3">
          {withDivider ? <div className="bg-accent mx-2 h-px" /> : null}
          <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium tracking-wider uppercase">
            <Trans>Settings</Trans>
          </div>
        </div>
      }
    >
      {shown.map((result) => (
        <CommandPrimitive.Item
          key={`setting-${result.id}`}
          value={`setting-${result.id}`}
          onSelect={() => onSelect(result)}
          className={PALETTE_ITEM_CLASS}
        >
          <Gear className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate">{result.label}</span>
          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
            {result.breadcrumb}
          </span>
        </CommandPrimitive.Item>
      ))}
      {hidden ? (
        <CommandPrimitive.Item
          value="settings-show-all"
          onSelect={onShowAll}
          className={PALETTE_ITEM_CLASS}
        >
          <MagnifyingGlass className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate">
            {t`See all ${results.length} settings`}
          </span>
        </CommandPrimitive.Item>
      ) : null}
    </CommandPrimitive.Group>
  );
}

/** Aucun paramètre trouvé, avec un conseil plutôt qu'une impasse. */
export function NoSettingMatches({ query }: { query: string }) {
  const { t } = useLingui();
  const trimmed = query.trim();

  return (
    <div className="text-muted-foreground px-3 py-6 text-sm">
      <p className="text-foreground">
        {trimmed ? t`No setting matches “${trimmed}”.` : t`No setting found.`}
      </p>
      <p className="mt-1">
        <Trans>Check the spelling, or try a shorter word.</Trans>
      </p>
    </div>
  );
}
