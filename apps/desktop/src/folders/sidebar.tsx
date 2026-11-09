import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

import {
  FolderSimple,
  MagnifyingGlass,
  Plus,
  X,
} from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { useSquircleRef } from "@syntheo/ui/hooks/use-squircle";
import { cn } from "@syntheo/utils";

import { useActiveFolderPath, useFolderSelection } from "./selection";
import { buildFolderTree, filterFolderTree } from "./sidebar-tree";
import { FolderTreeView } from "./sidebar-tree-view";

import { useSearchNotes } from "~/search/unified/catalog";
import { createNamedFolder } from "~/session/folder-catalog";
import { resolvedFolderIcon } from "~/session/folder-icon";
import { useFolderIcons, useFolderPaths } from "~/session/queries";
import { CustomSidebarHeader } from "~/sidebar/custom-sidebar-header";
import { FolderNameDialog } from "~/sidebar/folder-name-dialog";

export function FoldersSidebar() {
  const { t } = useLingui();
  const folders = useFolderPaths();
  const persistedIcons = useFolderIcons();
  const iconOverrides = useFolderSelection((state) => state.iconOverrides);
  const setSelectedPath = useFolderSelection((state) => state.setSelectedPath);
  const activeFolder = useActiveFolderPath(folders);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useSquircleRef<HTMLDivElement>();

  const notes = useSearchNotes();
  const tree = useMemo(() => buildFolderTree(folders, notes), [folders, notes]);
  const filtered = useMemo(
    () => filterFolderTree(tree, search),
    [tree, search],
  );

  const isEmpty = filtered.tree.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div>
        <CustomSidebarHeader>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground relative z-[60]"
            aria-label={t`New folder`}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
          </Button>
        </CustomSidebarHeader>

        <div className="pb-2">
          <div
            ref={searchRef}
            className={cn([
              "border-border bg-accent/50 flex h-8 w-full shrink-0 items-center gap-2 rounded-lg border px-3",
              "focus-within:bg-accent transition-colors",
            ])}
          >
            <MagnifyingGlass className="text-muted-foreground h-4 w-4 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearch("");
                }
              }}
              placeholder={t`Search folders...`}
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm placeholder:text-sm focus:outline-hidden"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className={cn([
                  "h-4 w-4 shrink-0",
                  "text-muted-foreground hover:text-muted-foreground",
                  "transition-colors",
                ])}
                aria-label={t`Clear search`}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto pt-1">
        {isEmpty ? (
          <div className="text-muted-foreground px-3 py-8 text-center">
            <FolderSimple
              size={32}
              className="text-muted-foreground/70 mx-auto mb-2"
            />
            <p className="text-sm">
              {search ? (
                <Trans>No folders found</Trans>
              ) : (
                <Trans>No folders yet</Trans>
              )}
            </p>
          </div>
        ) : (
          <FolderTreeView
            tree={filtered.tree}
            forcedExpanded={filtered.forcedExpanded}
            activeFolder={activeFolder}
            iconFor={(path) =>
              resolvedFolderIcon(path, persistedIcons, iconOverrides)
            }
            onSelectFolder={setSelectedPath}
          />
        )}
      </div>

      <FolderNameDialog
        open={creating}
        title={t`New folder`}
        confirmLabel={t`Create`}
        onOpenChange={setCreating}
        onSubmit={async (path) => {
          const created = await createNamedFolder(path);
          setSelectedPath(created);
        }}
      />
    </div>
  );
}
