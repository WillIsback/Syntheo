import { Plural, Trans, useLingui } from "@lingui/react/macro";

import { cn } from "@syntheo/utils";

import type { HomeFolder } from "./active-folders";
import { formatIndexDate } from "./format";

import { TemplateIconGlyph } from "~/templates/template-icon";

// « Vos dossiers » (issue 500, maquette section 4) : cartes sobres sous le
// bouton Démarrer, sans fond plein ; survol `accent` comme « Reprendre ».
// Masqué tant qu'aucun dossier ne contient de note.
export function FolderCards({
  folders,
  onOpenFolder,
  onOpenAllFolders,
}: {
  folders: readonly HomeFolder[];
  onOpenFolder: (folderPath: string) => void;
  onOpenAllFolders: () => void;
}) {
  if (folders.length === 0) return null;

  return (
    <section aria-labelledby="home-folders-title">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2
          id="home-folders-title"
          className="text-faint text-[11px] font-semibold tracking-[0.08em] uppercase"
        >
          <Trans>Your folders</Trans>
        </h2>
        <button
          type="button"
          onClick={onOpenAllFolders}
          className={cn([
            "text-muted-foreground hover:text-foreground rounded-sm text-[13px]",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
          ])}
        >
          <Trans>All folders</Trans>
        </button>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
        {folders.map((folder) => (
          <li key={folder.path} className="min-w-0">
            <FolderCard folder={folder} onOpen={onOpenFolder} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FolderCard({
  folder,
  onOpen,
}: {
  folder: HomeFolder;
  onOpen: (folderPath: string) => void;
}) {
  const { i18n } = useLingui();
  const lastDate = formatIndexDate(folder.lastMeetingAt, i18n.locale);

  return (
    <button
      type="button"
      data-home-folder={folder.path}
      title={folder.path}
      onClick={() => onOpen(folder.path)}
      className={cn([
        "border-border hover:bg-accent flex h-full w-full flex-col gap-1 rounded-lg border px-3.5 py-3 text-left",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        "motion-safe:transition-colors",
      ])}
    >
      <span className="flex min-w-0 items-center gap-2">
        <TemplateIconGlyph
          icon={folder.icon}
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="text-foreground min-w-0 truncate text-[14px] font-medium">
          {folder.name}
        </span>
      </span>
      <span className="text-muted-foreground text-[12px]">
        <Plural
          value={folder.meetingCount}
          one="# meeting"
          other="# meetings"
        />
        {lastDate ? (
          <>
            {" · "}
            <Trans>last {lastDate}</Trans>
          </>
        ) : null}
      </span>
      <FolderThreadLine thread={folder.thread} />
    </button>
  );
}

// « 3 points ouverts · 2 tâches » ; sans fil rouge, une mention discrète.
function FolderThreadLine({ thread }: { thread: HomeFolder["thread"] }) {
  if (!thread) {
    return (
      <span data-folder-thread="none" className="text-faint text-[12px]">
        <Trans>Project thread not created yet</Trans>
      </span>
    );
  }
  const { openPoints, tasks } = thread;
  return (
    <span data-folder-thread="ready" className="text-foreground text-[12px]">
      {openPoints === 0 && tasks === 0 ? (
        <Trans>Nothing pending</Trans>
      ) : (
        <>
          {openPoints > 0 ? (
            <Plural
              value={openPoints}
              one="# open point"
              other="# open points"
            />
          ) : null}
          {openPoints > 0 && tasks > 0 ? " · " : null}
          {tasks > 0 ? (
            <Plural value={tasks} one="# task" other="# tasks" />
          ) : null}
        </>
      )}
    </span>
  );
}
