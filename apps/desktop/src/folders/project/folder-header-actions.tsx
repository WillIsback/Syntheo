import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { ChatCircle, Plus } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { Kbd } from "@syntheo/ui/components/ui/kbd";

import { useFolderSelection } from "../selection";
import { formatMeetingDate, formatShortDate } from "./format";
import type { FolderMeetingStats } from "./meetings";

import { createSession } from "~/session/queries";
import { useTabs } from "~/store/zustand/tabs";

// « Nouvelle note dans ce dossier » : une note neuve, rangée dans le dossier,
// ouverte à l'étape Préparer (étape d'une note pas encore écoutée).
export async function createNoteInFolder(folderPath: string): Promise<string> {
  const sessionId = await createSession("", undefined, {
    folder_id: folderPath,
  });
  useTabs.getState().openNew({ type: "sessions", id: sessionId });
  return sessionId;
}

// « Demander au dossier » : ouvre le chat avec ce dossier pour contexte,
// comme Ctrl+J sur cette page.
function askFolder(folderPath: string) {
  useFolderSelection.getState().setSelectedPath(folderPath);
  useTabs.getState().transitionChatMode({ type: "OPEN" });
}

export function FolderMeetingSummaryLine({
  stats,
}: {
  stats: FolderMeetingStats;
}) {
  const { i18n } = useLingui();
  if (stats.count === 0) {
    return (
      <span>
        <Trans>No meetings yet</Trans>
      </span>
    );
  }
  const first = formatShortDate(stats.firstAt, i18n.locale);
  const last = formatMeetingDate(stats.lastAt, i18n.locale);
  return (
    <span data-testid="folder-meeting-stats">
      <Plural value={stats.count} one="# meeting" other="# meetings" />
      {stats.count > 1 ? (
        <>
          {" · "}
          <Trans>since {first}</Trans>
          {" · "}
          <Trans>last on {last}</Trans>
        </>
      ) : (
        <>
          {" · "}
          {last}
        </>
      )}
    </span>
  );
}

export function FolderHeaderActions({ folderPath }: { folderPath: string }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => askFolder(folderPath)}
      >
        <ChatCircle className="size-3.5" />
        <Trans>Ask the folder</Trans>
        <Kbd aria-hidden>Ctrl J</Kbd>
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={creating}
        onClick={() => {
          setCreating(true);
          void createNoteInFolder(folderPath)
            .catch((error) => {
              console.error("[folders] failed to create a note", error);
            })
            .finally(() => setCreating(false));
        }}
      >
        <Plus className="size-3.5" />
        <Trans>New note in this folder</Trans>
      </Button>
    </div>
  );
}
