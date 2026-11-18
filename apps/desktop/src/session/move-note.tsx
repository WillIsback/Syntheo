import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useId } from "react";
import { create } from "zustand";

import { X } from "@syntheo/ui/components/icons";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";
import { toast } from "@syntheo/ui/components/ui/toast";
import { cn } from "@syntheo/utils";

import { FolderPickerContent } from "~/session/components/folder-picker";
import { folderPathLabel, normalizeFolderPath } from "~/session/folders";
import { updateSession } from "~/session/queries";
import type { MenuItemDef } from "~/shared/hooks/useNativeContextMenu";
import { GlassDialogContent } from "~/shared/ui/glass-dialog";
import { useTabs } from "~/store/zustand/tabs";

// Déplacer une note sans l'ouvrir (issue 592) : depuis l'arbre des dossiers,
// la page d'un dossier et l'accueil. Le déplacement passe par updateSession,
// comme le sélecteur de l'en-tête de la note : même écriture en base, même
// proposition de régénération après un rangement tardif.

export type MovableNote = {
  id: string;
  title: string;
  folderPath: string;
};

/**
 * Range `note` dans `targetPath` (`""` : la retire de son dossier), puis
 * propose d'annuler.
 */
export async function moveNoteToFolder(
  note: Pick<MovableNote, "id" | "folderPath">,
  targetPath: string,
): Promise<void> {
  const from = normalizeFolderPath(note.folderPath) ?? "";
  const to = normalizeFolderPath(targetPath) ?? "";
  if (from === to) return;

  await updateSession(note.id, { folder_id: to });
  const label = folderPathLabel(to);
  toast(to ? t`Note moved to ${label}` : t`Note removed from its folder`, {
    id: `move-note-${note.id}`,
    action: {
      label: t`Undo`,
      onClick: () => {
        void updateSession(note.id, { folder_id: from }).catch((error) => {
          console.error("[move-note] failed to undo the move", error);
        });
      },
    },
  });
}

function reportMoveError(error: unknown) {
  console.error("[move-note] failed to move the note", error);
}

type MoveNoteDialogState = {
  note: MovableNote | null;
  hosts: readonly string[];
  open: (note: MovableNote) => void;
  close: () => void;
  registerHost: (id: string) => () => void;
};

export const useMoveNoteDialog = create<MoveNoteDialogState>((set) => ({
  note: null,
  hosts: [],
  open: (note) => set({ note }),
  close: () => set({ note: null }),
  registerHost: (id) => {
    set((state) => ({ hosts: [...state.hosts, id] }));
    return () =>
      set((state) => ({ hosts: state.hosts.filter((host) => host !== id) }));
  },
}));

/** Entrées du menu d'une note : Ouvrir, Déplacer vers…, Retirer du dossier. */
export function useNoteMenuItems(): (note: MovableNote) => MenuItemDef[] {
  const { t: translate } = useLingui();
  return useCallback(
    (note: MovableNote) => [
      {
        id: "open",
        text: translate`Open`,
        action: () =>
          useTabs.getState().openNew({ type: "sessions", id: note.id }),
      },
      {
        id: "move",
        text: translate`Move to…`,
        action: () => useMoveNoteDialog.getState().open(note),
      },
      {
        id: "remove-from-folder",
        text: translate`Remove from folder`,
        disabled: !note.folderPath,
        action: () => {
          void moveNoteToFolder(note, "").catch(reportMoveError);
        },
      },
    ],
    [translate],
  );
}

/**
 * Boîte « Déplacer vers… ». Montée à plusieurs endroits (accueil, barre
 * latérale et page des dossiers) : seule la première montée l'affiche.
 */
export function MoveNoteDialog() {
  const id = useId();
  const registerHost = useMoveNoteDialog((state) => state.registerHost);
  const isHost = useMoveNoteDialog((state) => state.hosts[0] === id);
  const note = useMoveNoteDialog((state) => state.note);
  const close = useMoveNoteDialog((state) => state.close);

  useEffect(() => registerHost(id), [id, registerHost]);

  if (!isHost) return null;
  const title = note?.title.trim() || t`Untitled`;
  return (
    <Dialog
      open={note !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <GlassDialogContent className="max-w-[360px] gap-3">
        <DialogHeader className="items-center gap-2 text-center sm:text-center">
          <DialogTitle className="text-foreground text-[13px] leading-5 font-semibold tracking-normal">
            <Trans>Move “{title}” to…</Trans>
          </DialogTitle>
          <DialogDescription className="sr-only">
            <Trans>Choose the folder for this note.</Trans>
          </DialogDescription>
        </DialogHeader>
        {note ? (
          <>
            {note.folderPath ? (
              <button
                type="button"
                onClick={() => {
                  close();
                  void moveNoteToFolder(note, "").catch(reportMoveError);
                }}
                className={cn([
                  "text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm",
                  "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-hidden",
                ])}
              >
                <X className="size-4 shrink-0" aria-hidden />
                <Trans>No folder</Trans>
              </button>
            ) : null}
            <div className="border-border/60 overflow-hidden rounded-2xl border">
              <FolderPickerContent
                sessionId={note.id}
                selectedPath={note.folderPath}
                onClose={close}
                onSelectFolder={(path) =>
                  moveNoteToFolder(note, path).catch(reportMoveError)
                }
              />
            </div>
          </>
        ) : null}
      </GlassDialogContent>
    </Dialog>
  );
}
