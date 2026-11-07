import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  CaretDown,
  CaretRight,
  Lock,
  MagnifyingGlass,
  X,
} from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import { CustomSidebarHeader } from "./custom-sidebar-header";
import {
  type SettingsNavGroup,
  useSettingsNavGroups,
} from "./settings-nav-groups";
import {
  type SettingsSearchHit,
  SettingsSearchResults,
} from "./settings-search-results";
import { ServersHealthFooter, ServerStatusDot } from "./settings-server-status";

import { useBillingAccess } from "~/billing/billing-context";
import {
  normalizeSearchText,
  searchSettings,
  useSettingsSearchIndex,
} from "~/settings/search";
import { requestSettingFocus } from "~/settings/setting-focus";
import { ariaShortcut } from "~/shared/shortcuts";
import { type SettingsTab, useTabs } from "~/store/zustand/tabs";

export function SettingsNav() {
  const { t } = useLingui();
  const { isPro } = useBillingAccess();
  const groups = useSettingsNavGroups();
  const settingsIndex = useSettingsSearchIndex();
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const currentTab = useTabs((state) => state.currentTab);
  const updateSettingsTabState = useTabs(
    (state) => state.updateSettingsTabState,
  );
  const openNew = useTabs((state) => state.openNew);

  const requestedTab =
    currentTab?.type === "settings" ? (currentTab.state.tab ?? "app") : "app";
  const activeTab: string =
    requestedTab === "audio" ? "meetings" : requestedTab;

  const openSettingsPage = useCallback(
    (tab: SettingsTab) => {
      if (currentTab?.type === "settings") {
        updateSettingsTabState(currentTab, { tab });
        return;
      }
      openNew({ type: "settings", state: { tab } });
    },
    [currentTab, openNew, updateSettingsTabState],
  );

  const selectNavItem = useCallback(
    (item: NavItem) => {
      if ("destination" in item) {
        openNew(item.destination);
        return;
      }
      openSettingsPage(item.id);
    },
    [openNew, openSettingsPage],
  );

  // Même index que la palette (issue 373) : les pages d'abord (nom ou groupe),
  // puis chaque réglage, sans tenir compte des accents.
  const query = normalizeSearchText(search);
  const hits = useMemo<SettingsSearchHit[]>(() => {
    if (!query) {
      return [];
    }
    const pages = groups.flatMap((group) => {
      const groupMatches = normalizeSearchText(group.label).includes(query);
      return group.items
        .filter(
          (item) =>
            groupMatches || normalizeSearchText(item.label).includes(query),
        )
        .map((item): SettingsSearchHit => ({
          kind: "page",
          item,
          groupLabel: group.label,
        }));
    });
    const settings = searchSettings(settingsIndex, query).map(
      (result): SettingsSearchHit => ({ kind: "setting", result }),
    );
    return [...pages, ...settings];
  }, [groups, query, settingsIndex]);

  const selectHit = (hit: SettingsSearchHit) => {
    if (hit.kind === "page") {
      selectNavItem(hit.item);
      return;
    }
    requestSettingFocus(hit.result.id);
    openSettingsPage(hit.result.page);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <CustomSidebarHeader />
      <div className="pb-3.5">
        <div
          className={cn([
            "border-border bg-card flex h-8 w-full shrink-0 items-center gap-2 rounded-lg border px-2.5",
            "focus-within:ring-ring focus-within:ring-1",
          ])}
        >
          <MagnifyingGlass className="text-faint size-[15px] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearch("");
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                resultsRef.current?.querySelector("button")?.focus();
              } else if (event.key === "Enter" && hits[0]) {
                event.preventDefault();
                selectHit(hits[0]);
              }
            }}
            // Ctrl+F sur l'écran Paramètres (useMainShortcuts, issue 372).
            data-page-search=""
            placeholder={t`Search settings`}
            aria-label={t`Search settings`}
            aria-keyshortcuts={ariaShortcut("searchSettings")}
            className="placeholder:text-faint min-w-0 flex-1 bg-transparent text-sm focus:outline-hidden"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground size-4 shrink-0 transition-colors"
              aria-label={t`Clear search`}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
      <nav
        aria-label={t`Settings`}
        className="scrollbar-hide flex flex-1 flex-col overflow-y-auto"
      >
        <div className="flex flex-col gap-3.5 pb-4">
          {query ? (
            <SettingsSearchResults
              hits={hits}
              query={search}
              isPro={isPro}
              listRef={resultsRef}
              inputRef={inputRef}
              onSelect={selectHit}
            />
          ) : (
            groups.map((group) => (
              <NavGroup
                key={group.label}
                group={group}
                forceOpen={group.items.some((item) => item.id === activeTab)}
                activeTab={activeTab}
                isPro={isPro}
                onSelect={selectNavItem}
              />
            ))
          )}
        </div>
        <ServersHealthFooter />
      </nav>
    </div>
  );
}

type NavItem = SettingsNavGroup["items"][number];

function NavGroup({
  group,
  forceOpen,
  activeTab,
  isPro,
  onSelect,
}: {
  group: SettingsNavGroup;
  forceOpen: boolean;
  activeTab: string;
  isPro: boolean;
  onSelect: (item: NavItem) => void;
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const open = !group.collapsed || expanded || forceOpen;
  const labelClass =
    "text-faint px-2 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase";

  return (
    <div className="flex flex-col gap-px">
      {group.collapsed ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setExpanded((value) => !value)}
          className={cn([labelClass, "flex items-center gap-1 text-left"])}
        >
          {group.label}
          {open ? (
            <CaretDown aria-hidden className="size-3" />
          ) : (
            <CaretRight aria-hidden className="size-3" />
          )}
        </button>
      ) : (
        <h5 className={labelClass}>{group.label}</h5>
      )}
      {open
        ? group.items.map((item) => {
            const current = activeTab === item.id;
            const locked = Boolean(item.requiresPro && !isPro);
            return (
              <button
                key={item.id}
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => onSelect(item)}
                className={cn([
                  "flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left text-sm transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
                  current
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-foreground hover:bg-muted",
                ])}
              >
                <item.icon
                  size={16}
                  className={cn([
                    "shrink-0",
                    current
                      ? "text-accent-foreground"
                      : "text-muted-foreground",
                  ])}
                  data-testid={`settings-nav-icon-${item.id}`}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {locked ? (
                  <Lock
                    aria-label={t`Requires Syntheo Pro`}
                    className="size-3.5 shrink-0"
                  />
                ) : null}
                {item.server ? <ServerStatusDot kind={item.server} /> : null}
              </button>
            );
          })
        : null}
    </div>
  );
}
