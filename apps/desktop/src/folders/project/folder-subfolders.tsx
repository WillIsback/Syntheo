import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Fragment, useMemo } from "react";

import { CaretRight, Plus } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";

import { useFolderDialogs } from "../folder-actions";
import { useFolderSelection } from "../selection";
import { folderCardClassName } from "./folder-side-panel";
import type { FolderMeeting } from "./meetings";

import { resolvedFolderIcon } from "~/session/folder-icon";
import {
  ancestorFolderPaths,
  folderDisplayName,
  folderPathMatchesFilter,
} from "~/session/folders";
import { TemplateIconGlyph } from "~/templates/template-icon";

/** Sous-dossiers directs de `folderPath`, triés par nom. */
export function directSubfolders(
  folders: readonly string[],
  folderPath: string,
): string[] {
  const prefix = `${folderPath}/`;
  return folders
    .filter(
      (folder) =>
        folder.startsWith(prefix) && !folder.slice(prefix.length).includes("/"),
    )
    .sort((left, right) =>
      folderDisplayName(left).localeCompare(folderDisplayName(right)),
    );
}

// Fil d'Ariane de la page d'un dossier (issue 590) : `Equipe › MCO`, chaque
// dossier parent est cliquable. Rien pour un dossier à la racine.
export function FolderBreadcrumb({ folderPath }: { folderPath: string }) {
  const { t } = useLingui();
  const setSelectedPath = useFolderSelection((state) => state.setSelectedPath);
  const ancestors = ancestorFolderPaths(folderPath).slice(0, -1);
  if (ancestors.length === 0) return null;

  return (
    <nav aria-label={t`Parent folders`} className="min-w-0">
      <ol className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-1 text-xs">
        {ancestors.map((path) => (
          <Fragment key={path}>
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => setSelectedPath(path)}
                className="hover:text-foreground max-w-40 truncate rounded-sm focus-visible:underline focus-visible:outline-hidden"
              >
                {folderDisplayName(path)}
              </button>
            </li>
            <li aria-hidden className="shrink-0">
              ›
            </li>
          </Fragment>
        ))}
        <li aria-current="page" className="text-foreground min-w-0 truncate">
          {folderDisplayName(folderPath)}
        </li>
      </ol>
    </nav>
  );
}

// Sous-dossiers directs (issue 590), avec leur nombre de réunions
// (sous-dossiers compris), et le bouton « Nouveau sous-dossier ».
export function FolderSubfoldersCard({
  folderPath,
  folders,
  meetings,
  icons,
}: {
  folderPath: string;
  folders: readonly string[];
  meetings: readonly FolderMeeting[];
  icons: Parameters<typeof resolvedFolderIcon>[1];
}) {
  const setSelectedPath = useFolderSelection((state) => state.setSelectedPath);
  const iconOverrides = useFolderSelection((state) => state.iconOverrides);
  const openDialog = useFolderDialogs((state) => state.open);
  const children = useMemo(
    () => directSubfolders(folders, folderPath),
    [folders, folderPath],
  );
  if (children.length === 0) return null;

  return (
    <section className={folderCardClassName}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          <Trans>Subfolders</Trans>
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground ml-auto h-7 text-xs"
          onClick={() => openDialog({ kind: "create", parentPath: folderPath })}
        >
          <Plus className="size-3.5" />
          <Trans>New subfolder</Trans>
        </Button>
      </div>
      <ul className="flex flex-col gap-px">
        {children.map((child) => {
          const count = meetings.filter((meeting) =>
            folderPathMatchesFilter(meeting.folderPath, child),
          ).length;
          return (
            <li key={child}>
              <button
                type="button"
                onClick={() => setSelectedPath(child)}
                className="hover:bg-accent/50 focus-visible:ring-ring flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:ring-1 focus-visible:outline-hidden"
              >
                <TemplateIconGlyph
                  icon={resolvedFolderIcon(child, icons, iconOverrides)}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">
                  {folderDisplayName(child)}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  <Plural value={count} one="# meeting" other="# meetings" />
                </span>
                <CaretRight
                  aria-hidden
                  className="text-muted-foreground size-3.5 shrink-0"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
