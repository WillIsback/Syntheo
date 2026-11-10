import { Trans } from "@lingui/react/macro";
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

// Le menu passe par un portail, mais ses événements remontent quand même
// jusqu'à la ligne de la note dans l'arbre React : on les arrête ici pour
// qu'un choix de dossier n'ouvre pas la note.
function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

// « Ranger » (issue 500) : une note non rangée ouvre le sélecteur de dossier
// de la note, le même qu'en tête de note.
export function FileNoteButton({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
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
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
