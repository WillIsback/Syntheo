import { cn } from "@syntheo/utils";

import { resolvedFolderIcon } from "~/session/folder-icon";
import { folderDisplayName } from "~/session/folders";
import {
  type TemplateIcon,
  TemplateIconGlyph,
} from "~/templates/template-icon";

export const noteChipClassName =
  "border-border inline-flex h-5 max-w-44 shrink-0 items-center gap-1 rounded-full border px-2 text-[12px] leading-none whitespace-nowrap";

// Pastille du dossier d'une note récente (issue 500) : icône et nom du
// dossier, le chemin complet au survol.
export function NoteFolderChip({
  folderPath,
  icons,
}: {
  folderPath: string;
  icons: Record<string, TemplateIcon | undefined>;
}) {
  return (
    <span
      data-note-folder={folderPath}
      title={folderPath}
      className={cn([noteChipClassName, "text-muted-foreground"])}
    >
      <TemplateIconGlyph
        icon={resolvedFolderIcon(folderPath, icons)}
        className="size-3 shrink-0"
      />
      <span className="min-w-0 truncate">
        {folderDisplayName(folderPath) || folderPath}
      </span>
    </span>
  );
}
