import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useRef, useState } from "react";

import { DotsThree } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  AppFloatingPanel,
  appFloatingMenuPanelClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@syntheo/ui/components/ui/dropdown-menu";
import { Input } from "@syntheo/ui/components/ui/input";
import { cn } from "@syntheo/utils";

import {
  FolderHeaderActions,
  FolderMeetingSummaryLine,
} from "./project/folder-header-actions";
import { FolderMeetingsCard } from "./project/folder-meetings-card";
import { FolderSidePanel } from "./project/folder-side-panel";
import { FolderThreadCard } from "./project/folder-thread-card";
import { folderMeetingStats, useFolderMeetings } from "./project/meetings";
import { NextMeetingSlot } from "./project/next-meeting-slot";
import { useFolderThread } from "./project/thread-store";
import { useFolderSelection } from "./selection";

import {
  deleteNamedFolder,
  renameNamedFolder,
  updateFolderIcon,
} from "~/session/folder-catalog";
import { resolvedFolderIcon } from "~/session/folder-icon";
import { folderDisplayName, normalizeFolderPath } from "~/session/folders";
import { useFolderIcons } from "~/session/queries";
import { DestructiveConfirmationDialog } from "~/shared/ui/destructive-confirmation-dialog";
import { TemplateIconPicker } from "~/templates/template-icon-picker";

export function FolderEditor({ folderPath }: { folderPath: string }) {
  const { t } = useLingui();
  const setSelectedPath = useFolderSelection((state) => state.setSelectedPath);
  const markFolderDeleted = useFolderSelection(
    (state) => state.markFolderDeleted,
  );
  const persistedIcons = useFolderIcons();
  const iconOverrides = useFolderSelection((state) => state.iconOverrides);
  const setIconOverride = useFolderSelection((state) => state.setIconOverride);
  const clearIconOverride = useFolderSelection(
    (state) => state.clearIconOverride,
  );
  const rekeyIconOverride = useFolderSelection(
    (state) => state.rekeyIconOverride,
  );
  const icon = resolvedFolderIcon(folderPath, persistedIcons, iconOverrides);
  const meetings = useFolderMeetings(folderPath);
  const stats = useMemo(() => folderMeetingStats(meetings), [meetings]);
  const thread = useFolderThread(folderPath);
  const skipTitleCommit = useRef(false);
  const [busy, setBusy] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const displayName = folderDisplayName(folderPath);
  const [draft, setDraft] = useState(displayName);

  const commitTitle = useCallback(async () => {
    if (skipTitleCommit.current) {
      skipTitleCommit.current = false;
      setDraft(displayName);
      return;
    }

    const normalizedName = normalizeFolderPath(draft.trim());
    if (!normalizedName || normalizedName.includes("/")) {
      setDraft(displayName);
      return;
    }

    const separatorIndex = folderPath.lastIndexOf("/");
    const parentPath =
      separatorIndex === -1 ? "" : folderPath.slice(0, separatorIndex);
    const renamedPath = parentPath
      ? `${parentPath}/${normalizedName}`
      : normalizedName;
    if (renamedPath === folderPath) {
      setDraft(displayName);
      return;
    }

    setBusy(true);
    try {
      const renamed = await renameNamedFolder(folderPath, renamedPath);
      rekeyIconOverride(folderPath, renamed);
      setSelectedPath(renamed);
    } catch {
      setDraft(displayName);
    } finally {
      setBusy(false);
    }
  }, [displayName, draft, folderPath, rekeyIconOverride, setSelectedPath]);

  return (
    <section className="flex h-full flex-1 flex-col" aria-label={folderPath}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2 pr-1 pb-3 pl-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TemplateIconPicker
            size="sm"
            label={t`Choose folder icon`}
            value={icon}
            onChange={(nextIcon) => {
              setIconOverride(folderPath, nextIcon);
              void updateFolderIcon(folderPath, nextIcon).catch((error) => {
                clearIconOverride(folderPath, nextIcon);
                console.error("[folder-editor] failed to update icon", error);
              });
            }}
          />
          <div className="max-w-full min-w-0">
            <div className="relative max-w-full min-w-0">
              <span
                aria-hidden="true"
                className="invisible block px-0 py-0 text-sm font-semibold whitespace-pre"
              >
                {(draft || t`Folder name`) + " "}
              </span>
              <Input
                value={draft}
                disabled={busy}
                aria-label={t`Folder name`}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  void commitTitle();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    skipTitleCommit.current = true;
                    setDraft(displayName);
                    event.currentTarget.blur();
                  }
                }}
                placeholder={t`Folder name`}
                className="absolute inset-0 h-auto w-full max-w-full min-w-0 border-0 px-0 py-0 text-sm font-semibold shadow-none focus-visible:ring-0 md:text-sm"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              <FolderMeetingSummaryLine stats={stats} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <FolderHeaderActions folderPath={folderPath} />
          <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={busy}
                className={cn([
                  "text-muted-foreground hover:text-foreground",
                  actionsOpen && "bg-muted text-foreground hover:bg-accent",
                ])}
                aria-label={t`Folder actions`}
              >
                <DotsThree className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent variant="app" align="end">
              <AppFloatingPanel className={appFloatingMenuPanelClassName}>
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <Trans>Delete</Trans>
                </DropdownMenuItem>
              </AppFloatingPanel>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="scrollbar-hide @container flex-1 overflow-y-auto px-3 pb-6">
        <div className="grid grid-cols-1 items-start gap-5 @3xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            <NextMeetingSlot folderPath={folderPath} />
            <FolderThreadCard
              folderPath={folderPath}
              meetings={meetings}
              thread={thread}
            />
            <FolderMeetingsCard folderPath={folderPath} meetings={meetings} />
          </div>
          <FolderSidePanel folderPath={folderPath} />
        </div>
      </div>

      <DestructiveConfirmationDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={<Trans>Delete folder</Trans>}
        description={
          <Trans id="Notes stay in All notes. Materials in this folder will be deleted.">
            Notes stay in All notes. This folder, its nested folders, and all
            their materials will be deleted.
          </Trans>
        }
        confirmLabel={<Trans>Delete folder</Trans>}
        isPending={busy}
        onConfirm={() => {
          void (async () => {
            setBusy(true);
            try {
              await deleteNamedFolder(folderPath);
              setDeleting(false);
              markFolderDeleted(folderPath);
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    </section>
  );
}
