import { useLingui } from "@lingui/react/macro";

import { ListNumbers } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import { openNextMeetingBlock } from "./next-meeting-request";

import { useLiveQuery } from "~/db";

const SESSION_FOLDER_SQL = `
  SELECT folder_path FROM sessions
  WHERE id = ? AND deleted_at IS NULL
  LIMIT 1
`;

export function useSessionFolderPath(sessionId: string): string {
  const { data = "" } = useLiveQuery<{ folder_path: string }, string>({
    sql: SESSION_FOLDER_SQL,
    params: [sessionId],
    enabled: Boolean(sessionId),
    mapRows: (rows) => rows[0]?.folder_path ?? "",
  });
  return sessionId ? data : "";
}

// « Demander à la note » (Ctrl+J), note rangée dans un dossier (issue 491) :
// préparer l'ordre du jour de la prochaine réunion du dossier, dans son bloc
// « Prochaine réunion ».
export function NextMeetingSuggestion({
  sessionId,
  isDarkAppearance,
}: {
  sessionId: string;
  isDarkAppearance: boolean;
}) {
  const { t } = useLingui();
  const folderPath = useSessionFolderPath(sessionId);
  if (!folderPath) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => openNextMeetingBlock(folderPath)}
      title={t`Opens the Next meeting block of the folder ${folderPath}.`}
      className={cn([
        "group grid w-full grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-1.5 rounded-lg py-2 pr-3 pl-0 text-left text-sm",
        isDarkAppearance
          ? "text-primary-foreground/85 hover:bg-primary-foreground/10"
          : "text-muted-foreground hover:bg-muted/55",
        "transition-colors",
      ])}
    >
      <span className="flex size-6 items-center justify-center">
        <ListNumbers
          size={16}
          className={cn([
            "shrink-0 transition-colors",
            isDarkAppearance
              ? "text-primary-foreground/55 group-hover:text-primary-foreground/80"
              : "text-muted-foreground/75 group-hover:text-foreground",
          ])}
        />
      </span>
      <span className="min-w-0 truncate">
        {t`Prepare the agenda for the next meeting.`}
      </span>
    </button>
  );
}
