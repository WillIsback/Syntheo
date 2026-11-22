import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { create } from "zustand";

import { Check, House } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";
import { Input } from "@syntheo/ui/components/ui/input";
import { cn } from "@syntheo/utils";

import { useExpandedFolders } from "./expanded-folders";
import { createNoteInFolder } from "./project/folder-header-actions";
import { useFolderSelection } from "./selection";

import {
  createNamedFolder,
  deleteNamedFolder,
  renameNamedFolder,
} from "~/session/folder-catalog";
import { resolvedFolderIcon } from "~/session/folder-icon";
import {
  childFolderPath,
  folderDisplayName,
  folderPathFromLabel,
  folderPathLabel,
  isSameOrDescendantFolder,
  movedFolderPath,
  parentFolderPath,
} from "~/session/folders";
import { useFolderIcons, useFolderPaths } from "~/session/queries";
import type { MenuItemDef } from "~/shared/hooks/useNativeContextMenu";
import { DestructiveConfirmationDialog } from "~/shared/ui/destructive-confirmation-dialog";
import {
  GlassDialogCancelButton,
  GlassDialogContent,
} from "~/shared/ui/glass-dialog";
import { FolderNameDialog } from "~/sidebar/folder-name-dialog";
import { TemplateIconGlyph } from "~/templates/template-icon";

// Actions sur un dossier partagées par l'arbre de la barre latérale et la page
// du dossier (issue 590) : créer un sous-dossier, déplacer, supprimer. Les
// boîtes de dialogue sont pilotées par ce store et rendues une seule fois par
// `FolderDialogs`, quel que soit le point d'entrée.

type FolderDialogRequest =
  | { kind: "create"; parentPath: string | null }
  | { kind: "move"; path: string }
  | { kind: "delete"; path: string };

type FolderDialogsState = {
  request: FolderDialogRequest | null;
  hosts: readonly string[];
  open: (request: FolderDialogRequest) => void;
  close: () => void;
  registerHost: (id: string) => () => void;
};

export const useFolderDialogs = create<FolderDialogsState>((set) => ({
  request: null,
  hosts: [],
  open: (request) => set({ request }),
  close: () => set({ request: null }),
  registerHost: (id) => {
    set((state) => ({ hosts: [...state.hosts, id] }));
    return () =>
      set((state) => ({ hosts: state.hosts.filter((host) => host !== id) }));
  },
}));

/** Suit un renommage ou un déplacement : sélection, dépliage, icônes. */
export function followFolderRename(fromPath: string, toPath: string) {
  useExpandedFolders.getState().rekeyExpanded(fromPath, toPath);
  const selection = useFolderSelection.getState();
  selection.rekeyIconOverride(fromPath, toPath);
  selection.setSelectedPath(toPath);
}

async function createFolderIn(
  parentPath: string | null,
  name: string,
): Promise<string> {
  const path = parentPath ? childFolderPath(parentPath, name) : name;
  if (!path) {
    throw new Error("invalid folder path");
  }
  const created = await createNamedFolder(path);
  if (parentPath) {
    useExpandedFolders.getState().setExpanded(parentPath, true);
  }
  useFolderSelection.getState().setSelectedPath(created);
  return created;
}

/** Déplace `sourcePath` sous `targetParent` (`""` : à la racine). */
async function moveFolder(
  sourcePath: string,
  targetParent: string,
): Promise<string> {
  const destination = movedFolderPath(sourcePath, targetParent);
  if (!destination) {
    throw new Error("folder_target_inside_source");
  }
  const moved = await renameNamedFolder(sourcePath, destination);
  followFolderRename(sourcePath, moved);
  if (targetParent) {
    useExpandedFolders.getState().setExpanded(targetParent, true);
  }
  return moved;
}

/** Entrées du menu contextuel d'un dossier (arbre de la barre latérale). */
export function useFolderMenuItems(): (path: string) => MenuItemDef[] {
  const { t } = useLingui();
  return useCallback(
    (path: string) => {
      const dialogs = useFolderDialogs.getState();
      return [
        {
          id: "new-subfolder",
          text: t`New subfolder…`,
          action: () => dialogs.open({ kind: "create", parentPath: path }),
        },
        {
          id: "new-note",
          text: t`New note in this folder`,
          action: () => {
            void createNoteInFolder(path).catch((error) => {
              console.error("[folders] failed to create a note", error);
            });
          },
        },
        {
          id: "move",
          text: t`Move to…`,
          action: () => dialogs.open({ kind: "move", path }),
        },
        { separator: true },
        {
          id: "delete",
          text: t`Delete`,
          action: () => dialogs.open({ kind: "delete", path }),
        },
      ];
    },
    [t],
  );
}

/**
 * Rend les boîtes de dialogue demandées. Peut être monté à plusieurs endroits
 * (barre latérale et page du dossier) : seul le premier monté les affiche.
 */
export function FolderDialogs() {
  const id = useId();
  const registerHost = useFolderDialogs((state) => state.registerHost);
  const isHost = useFolderDialogs((state) => state.hosts[0] === id);
  const request = useFolderDialogs((state) => state.request);
  const close = useFolderDialogs((state) => state.close);

  useEffect(() => registerHost(id), [id, registerHost]);

  if (!isHost) return null;
  return (
    <>
      <CreateFolderDialog
        parentPath={request?.kind === "create" ? request.parentPath : null}
        open={request?.kind === "create"}
        onClose={close}
      />
      <MoveFolderDialog
        path={request?.kind === "move" ? request.path : null}
        onClose={close}
      />
      <DeleteFolderDialog
        path={request?.kind === "delete" ? request.path : null}
        onClose={close}
      />
    </>
  );
}

function CreateFolderDialog({
  parentPath,
  open,
  onClose,
}: {
  parentPath: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const parentName = folderDisplayName(parentPath);
  return (
    <FolderNameDialog
      open={open}
      title={parentPath ? t`New subfolder in ${parentName}` : t`New folder`}
      confirmLabel={t`Create`}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onSubmit={async (name) => {
        await createFolderIn(parentPath, name);
      }}
    />
  );
}

function DeleteFolderDialog({
  path,
  onClose,
}: {
  path: string | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const markFolderDeleted = useFolderSelection(
    (state) => state.markFolderDeleted,
  );
  const name = folderDisplayName(path);
  return (
    <DestructiveConfirmationDialog
      open={path !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={<Trans>Delete folder “{name}”</Trans>}
      description={
        <Trans id="Notes stay in All notes. Materials in this folder will be deleted.">
          Notes stay in All notes. This folder, its nested folders, and all
          their materials will be deleted.
        </Trans>
      }
      confirmLabel={<Trans>Delete folder</Trans>}
      isPending={busy}
      onConfirm={() => {
        if (!path) return;
        void (async () => {
          setBusy(true);
          try {
            await deleteNamedFolder(path);
            markFolderDeleted(path);
            onClose();
          } catch (error) {
            console.error("[folders] failed to delete a folder", error);
          } finally {
            setBusy(false);
          }
        })();
      }}
    />
  );
}

/**
 * Destinations possibles pour déplacer `sourcePath` : la racine et tous les
 * dossiers, sauf lui-même, ses sous-dossiers et son parent actuel.
 */
function folderMoveTargets(
  folders: readonly string[],
  sourcePath: string,
): string[] {
  const currentParent = parentFolderPath(sourcePath);
  const targets = folders.filter(
    (folder) =>
      folder !== currentParent && !isSameOrDescendantFolder(folder, sourcePath),
  );
  return currentParent ? ["", ...targets] : targets;
}

function MoveFolderDialog({
  path,
  onClose,
}: {
  path: string | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const folders = useFolderPaths();
  const icons = useFolderIcons();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listId = useId();

  const [syncedPath, setSyncedPath] = useState(path);
  if (syncedPath !== path) {
    setSyncedPath(path);
    setQuery("");
    setTarget(null);
    setError(null);
    setBusy(false);
  }

  const targets = useMemo(() => {
    if (!path) return [];
    // Les cibles s'affichent « A › B » : la saisie peut reprendre cette forme.
    const needle = folderPathFromLabel(query.trim()).toLocaleLowerCase();
    return folderMoveTargets(folders, path).filter(
      (folder) => !needle || folder.toLocaleLowerCase().includes(needle),
    );
  }, [folders, path, query]);

  const name = folderDisplayName(path);
  const submit = async () => {
    if (!path || target === null) return;
    setBusy(true);
    setError(null);
    try {
      await moveFolder(path, target);
      onClose();
    } catch (cause) {
      const message = String(cause instanceof Error ? cause.message : cause);
      setError(
        message.includes("folder_target_exists")
          ? t`A folder with this name already exists there.`
          : message.includes("folder_target_inside_source")
            ? t`A folder cannot be moved into one of its own subfolders.`
            : t`Could not move the folder.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={path !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <GlassDialogContent className="max-w-[360px]">
        <DialogHeader className="items-center gap-2 text-center sm:text-center">
          <DialogTitle className="text-foreground text-[13px] leading-5 font-semibold tracking-normal">
            <Trans>Move “{name}” to…</Trans>
          </DialogTitle>
          <DialogDescription className="sr-only">
            <Trans>Choose the folder that will contain this folder.</Trans>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            value={query}
            disabled={busy}
            aria-label={t`Search folders`}
            aria-controls={listId}
            placeholder={t`Search folders...`}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div
            id={listId}
            role="radiogroup"
            aria-label={t`Destination`}
            className="mt-2 flex max-h-56 flex-col gap-px overflow-y-auto"
          >
            {targets.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                <Trans>No other folder available.</Trans>
              </p>
            ) : (
              targets.map((folder) => {
                const checked = folder === target;
                return (
                  <button
                    key={folder || "(root)"}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    disabled={busy}
                    onClick={() => setTarget(folder)}
                    className={cn([
                      "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                      "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-hidden",
                      checked
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    ])}
                  >
                    {folder ? (
                      <TemplateIconGlyph
                        icon={resolvedFolderIcon(folder, icons)}
                        className="size-4 shrink-0"
                      />
                    ) : (
                      <House className="size-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {folder ? folderPathLabel(folder) : t`Top level`}
                    </span>
                    {checked ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                );
              })
            )}
          </div>
          {error ? (
            <p
              role="alert"
              className="text-destructive pt-2 text-center text-xs"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2 sm:justify-normal">
            <GlassDialogCancelButton disabled={busy} onClick={onClose}>
              <Trans>Cancel</Trans>
            </GlassDialogCancelButton>
            <Button
              type="submit"
              className="h-8 rounded-full px-4 text-xs font-medium shadow-sm"
              disabled={busy || target === null}
            >
              <Trans>Move</Trans>
            </Button>
          </DialogFooter>
        </form>
      </GlassDialogContent>
    </Dialog>
  );
}
