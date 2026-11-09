import { useLingui } from "@lingui/react/macro";
import { type KeyboardEvent, type RefObject } from "react";

import { Gear } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import type { SettingsNavGroup } from "./settings-nav-groups";

import type { SettingsSearchResult } from "~/settings/search";
import { NoSettingMatches } from "~/shared/palette-settings-group";

type NavItem = SettingsNavGroup["items"][number];

// Résultat du champ « Rechercher un paramètre » : une page (Modèles,
// Avancé › Développeurs...) ou un réglage de l'index (issue 373).
export type SettingsSearchHit =
  | { kind: "page"; item: NavItem; groupLabel: string }
  | { kind: "setting"; result: SettingsSearchResult };

// Les résultats remplacent les groupes de la colonne. `↓` depuis le champ
// entre dans la liste, `↑` / `↓` s'y déplacent, `Entrée` ouvre.
export function SettingsSearchResults({
  hits,
  query,
  listRef,
  inputRef,
  onSelect,
}: {
  hits: SettingsSearchHit[];
  query: string;
  listRef: RefObject<HTMLUListElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (hit: SettingsSearchHit) => void;
}) {
  const { t } = useLingui();

  if (hits.length === 0) {
    return <NoSettingMatches query={query} />;
  }

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ];
    const index = buttons.indexOf(event.currentTarget);
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) {
      inputRef.current?.focus();
      return;
    }
    buttons[Math.min(next, buttons.length - 1)]?.focus();
  };

  return (
    <div className="flex flex-col gap-1">
      <p
        role="status"
        className="text-faint px-2 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase"
      >
        {hits.length === 1 ? t`1 result` : t`${hits.length} results`}
      </p>
      <ul ref={listRef} className="flex flex-col gap-px">
        {hits.map((hit) => {
          const label = hit.kind === "page" ? hit.item.label : hit.result.label;
          const hint =
            hit.kind === "page" ? hit.groupLabel : hit.result.breadcrumb;
          const Icon = hit.kind === "page" ? hit.item.icon : Gear;
          return (
            <li
              key={
                hit.kind === "page"
                  ? `page-${hit.item.id}`
                  : `setting-${hit.result.id}`
              }
            >
              <button
                type="button"
                onClick={() => onSelect(hit)}
                onKeyDown={moveFocus}
                className={cn([
                  "flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left text-sm transition-colors",
                  "text-foreground hover:bg-muted focus-visible:bg-accent",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
                ])}
              >
                <Icon
                  size={16}
                  aria-hidden
                  className="text-muted-foreground shrink-0"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{label}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
