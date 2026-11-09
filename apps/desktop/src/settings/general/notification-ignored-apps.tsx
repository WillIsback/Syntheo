import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import {
  commands as detectCommands,
  type InstalledApp,
} from "@syntheo/plugin-detect";
import { X } from "@syntheo/ui/components/icons";
import { Badge } from "@syntheo/ui/components/ui/badge";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@syntheo/ui/components/ui/command";
import {
  AppFloatingPanel,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@syntheo/ui/components/ui/popover";
import { cn } from "@syntheo/utils";

import {
  getIgnoredBundleIds,
  getIgnorableApps,
} from "./notification-app-options";

import type { Result } from "~/types";

type IgnoredAppsSelectorProps = {
  installedApps: InstalledApp[];
  defaultIgnoredBundleIds: string[];
  ignoredPlatforms: string[];
  includedPlatforms: string[];
  searchOpen: boolean;
  searchQuery: string;
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  onToggleApp: (
    bundleId: string,
    ignoredPlatforms: string[],
    includedPlatforms: string[],
  ) => void;
};

export function IgnoredAppsSelector({
  installedApps,
  defaultIgnoredBundleIds,
  ignoredPlatforms,
  includedPlatforms,
  searchOpen,
  searchQuery,
  onSearchOpenChange,
  onSearchQueryChange,
  onToggleApp,
}: IgnoredAppsSelectorProps) {
  const { t } = useLingui();

  const ignorableApps = getIgnorableApps({
    installedApps,
    ignoredPlatforms,
    includedPlatforms,
    inputValue: searchQuery,
    defaultIgnoredBundleIds,
  });
  const ignoredBundleIds = getIgnoredBundleIds({
    installedApps,
    ignoredPlatforms,
    includedPlatforms,
    defaultIgnoredBundleIds,
  });

  const bundleIdToName = (bundleId: string) => {
    return installedApps.find((app) => app.id === bundleId)?.name ?? bundleId;
  };

  const isDefaultIgnored = (bundleId: string) => {
    return defaultIgnoredBundleIds.includes(bundleId);
  };

  return (
    <div className="flex flex-col gap-3">
      <Popover open={searchOpen} onOpenChange={onSearchOpenChange}>
        <PopoverAnchor asChild>
          <div
            className={cn([
              "flex min-h-[38px] w-full cursor-text flex-wrap items-center gap-2 rounded-2xl border p-2",
              "focus-within:ring-ring focus-within:ring-1 focus-within:outline-hidden",
            ])}
          >
            {ignoredBundleIds.map((bundleId: string) => {
              const isDefault = isDefaultIgnored(bundleId);
              return (
                <Badge
                  key={bundleId}
                  variant="secondary"
                  className={cn([
                    "flex items-center gap-1 px-2 py-0.5 text-xs",
                    isDefault
                      ? ["bg-accent text-muted-foreground"]
                      : ["bg-muted"],
                  ])}
                  title={isDefault ? "default" : undefined}
                >
                  {bundleIdToName(bundleId)}
                  {isDefault && (
                    <span className="text-[10px] opacity-70">
                      <Trans>(default)</Trans>
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-0.5 h-3 w-3 p-0 hover:bg-transparent"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleApp(
                        bundleId,
                        ignoredPlatforms,
                        includedPlatforms,
                      );
                    }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </Badge>
              );
            })}
            <PopoverTrigger
              type="button"
              className="flex min-h-[22px] flex-1 cursor-text items-center gap-2 rounded-lg text-left focus-visible:outline-hidden"
            >
              <span className="text-muted-foreground text-sm">
                <Trans>Search installed apps...</Trans>
              </span>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent
          variant="app"
          align="start"
          style={{
            width: "var(--radix-popover-trigger-width)",
          }}
        >
          <AppFloatingPanel className="overflow-hidden">
            <Command className="rounded-[inherit] border-0 bg-transparent">
              <CommandInput
                placeholder={t`Search installed apps...`}
                value={searchQuery}
                onValueChange={onSearchQueryChange}
              />
              <CommandEmpty>
                <div className="text-muted-foreground px-2 py-1.5 text-sm">
                  <Trans>No apps found.</Trans>
                </div>
              </CommandEmpty>
              <CommandList>
                <CommandGroup className="max-h-[250px] overflow-y-auto">
                  {ignorableApps.map((app) => (
                    <CommandItem
                      key={app.id}
                      value={`${app.name} ${app.id}`}
                      onSelect={() =>
                        onToggleApp(app.id, ignoredPlatforms, includedPlatforms)
                      }
                      className={cn([
                        "cursor-pointer",
                        "hover:bg-accent! focus:bg-accent! aria-selected:bg-transparent",
                      ])}
                    >
                      <span className="flex-1 truncate">{app.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </AppFloatingPanel>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Applications installées et applications ignorées par défaut. */
export function useNotificationAppLists() {
  const { data: installedApps = [] } = useQuery({
    queryKey: ["settings", "all-installed-applications"],
    queryFn: detectCommands.listInstalledApplications,
    select: (result: Result<InstalledApp[], string>) => {
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const { data: defaultIgnoredBundleIds = [] } = useQuery({
    queryKey: ["settings", "default-ignored-bundle-ids"],
    queryFn: detectCommands.listDefaultIgnoredBundleIds,
    select: (result: Result<string[], string>) => {
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  return { installedApps, defaultIgnoredBundleIds };
}
