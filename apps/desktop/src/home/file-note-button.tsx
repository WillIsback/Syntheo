import { Trans, useLingui } from "@lingui/react/macro";
import { type SyntheticEvent, useState } from "react";

import { Plus } from "@syntheo/ui/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@syntheo/ui/components/ui/popover";
import { cn } from "@syntheo/utils";

import { noteChipClassName } from "./note-folder-chip";

import { FolderPickerContent } from "~/session/components/folder-picker";
import { resolvedFolderIcon } from "~/session/folder-icon";
import { folderDisplayName, folderPathLabel } from "~/session/folders";
import { moveNoteToFolder } from "~/session/move-note";
import {
  type TemplateIcon,
  TemplateIconGlyph,
} from "~/templates/template-icon";

const NO_ICONS: Record<string, TemplateIcon | undefined> = {};

// Le menu passe par un portail, mais ses événements remontent quand même
// jusqu'à la ligne de la note dans l'arbre React : on les arrête ici pour
// qu'un choix de dossier n'ouvre pas la note.
function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

// « Ranger » (issue 500) pour une note non rangée, pastille de son dossier
// sinon (issue 592) : l'une et l'autre ouvrent le sélecteur de dossier de la
// note, le même qu'en tête de note. Le déplacement propose « Annuler ».
export function FileNoteButton({
  sessionId,
  folderPath = "",
  icons = NO_ICONS,
}: {
  sessionId: string;
  folderPath?: string;
  icons?: Record<string, TemplateIcon | undefined>;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const label = folderPathLabel(folderPath);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {folderPath ? (
          <button
            type="button"
            data-note-folder={folderPath}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={t`Folder: ${label}. Move to another folder`}
            title={label}
            onClick={stop}
            className={cn([
              noteChipClassName,
              "text-muted-foreground hover:text-foreground hover:bg-accent",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            ])}
          >
            <TemplateIconGlyph
              icon={resolvedFolderIcon(folderPath, icons)}
              className="size-3 shrink-0"
            />
            <span className="min-w-0 truncate">
              {folderDisplayName(folderPath) || folderPath}
            </span>
          </button>
        ) : (
          <button
            type="button"
            data-note-file
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={stop}
            className={cn([
              noteChipClassName,
              "text-muted-foreground hover:text-foreground border-dashed",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            ])}
          >
            <Plus className="size-3 shrink-0" aria-hidden="true" />
            <Trans context="file a note in a folder">File</Trans>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        variant="app"
        align="start"
        className="w-56 overflow-hidden pb-0"
        onClick={stop}
        onContextMenu={stop}
      >
        <FolderPickerContent
          sessionId={sessionId}
          selectedPath={folderPath}
          onClose={() => setOpen(false)}
          onSelectFolder={(path) =>
            moveNoteToFolder({ id: sessionId, folderPath }, path).catch(
              (error) => {
                console.error("[home] failed to move the note", error);
              },
            )
          }
        />
      </PopoverContent>
    </Popover>
  );
}
