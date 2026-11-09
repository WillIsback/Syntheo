import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { CaretDown, Plus } from "@syntheo/ui/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@syntheo/ui/components/ui/popover";
import { cn } from "@syntheo/utils";

import { useSameTitleFolderSuggestion } from "./folder-suggestion";

import { FolderPickerContent } from "~/session/components/folder-picker";
import { resolvedFolderIcon } from "~/session/folder-icon";
import { normalizeFolderPath } from "~/session/folders";
import { useFolderIcons, useSession } from "~/session/queries";
import { TemplateIconGlyph } from "~/templates/template-icon";

// Champ « Dossier » de la fiche Préparer (issue 498) : la pastille du dossier
// de la note, ou « Choisir un dossier » si elle n'est pas rangée. Elle ouvre
// le sélecteur de dossier de la note (recherche, création), avec en tête le
// dossier qui contient une note de même titre.
export function FicheFolderField({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const currentPath =
    normalizeFolderPath(useSession(sessionId)?.folder_id ?? "") ?? "";
  const folderIcons = useFolderIcons();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-fiche-folder={currentPath || undefined}
          aria-label={
            currentPath ? t`Folder: ${currentPath}` : t`Choose a folder`
          }
          title={currentPath || undefined}
          className={cn([
            "inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-px text-[15px] leading-normal transition-colors",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
            "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
            currentPath
              ? "bg-border text-foreground hover:bg-accent hover:text-accent-foreground"
              : "border-border text-muted-foreground hover:text-foreground border border-dashed",
          ])}
        >
          {currentPath ? (
            <TemplateIconGlyph
              icon={resolvedFolderIcon(currentPath, folderIcons)}
              className="size-4 shrink-0"
            />
          ) : (
            <Plus aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="truncate">
            {currentPath || <Trans>Choose a folder</Trans>}
          </span>
          <CaretDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        variant="app"
        align="start"
        className="w-72 overflow-hidden pb-0"
      >
        <SuggestedFolderPicker
          sessionId={sessionId}
          currentPath={currentPath}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

// Monté seulement à l'ouverture : la suggestion n'est lue qu'à ce moment-là.
function SuggestedFolderPicker({
  sessionId,
  currentPath,
  onClose,
}: {
  sessionId: string;
  currentPath: string;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const title = useSession(sessionId)?.title ?? "";
  const suggestedPath = useSameTitleFolderSuggestion({
    sessionId,
    title,
    currentFolder: currentPath,
  });

  return (
    <FolderPickerContent
      sessionId={sessionId}
      onClose={onClose}
      suggestedPath={suggestedPath}
      suggestionHint={t`same title`}
    />
  );
}
