import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useRef, useState } from "react";

import { NoteEditor, type JSONContent } from "@syntheo/editor/note";
import { ArrowsClockwise } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { Spinner } from "@syntheo/ui/components/ui/spinner";
import { cn } from "@syntheo/utils";

import { folderCardClassName } from "./folder-side-panel";
import { formatShortDate } from "./format";
import type { FolderMeeting } from "./meetings";
import type { ThreadLabels } from "./thread-doc";
import { generateFolderThread, threadFreshness } from "./thread-generation";
import {
  type FolderThreadRecord,
  saveFolderThreadEdit,
  saveGeneratedFolderThread,
} from "./thread-store";

import { useLanguageModel } from "~/ai/hooks";
import { useMentionConfig } from "~/editor-bridge/mention-config";
import { openEditorLink } from "~/editor-bridge/open-editor-link";

export function useThreadLabels(): ThreadLabels {
  const { t } = useLingui();
  return useMemo(
    () => ({
      decisions: t`Decisions`,
      openPoints: t`Open points`,
      tasks: t`Open tasks`,
    }),
    [t],
  );
}

// « Mettre à jour » : intègre les réunions que le fil rouge ne couvre pas
// encore, puis enregistre la nouvelle version (l'ancienne est gardée).
export function useFolderThreadUpdate({
  folderPath,
  meetings,
  thread,
}: {
  folderPath: string;
  meetings: readonly FolderMeeting[];
  thread: FolderThreadRecord | null;
}) {
  const model = useLanguageModel();
  const { i18n } = useLingui();
  const labels = useThreadLabels();
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const runningRef = useRef(false);

  const update = useCallback(async () => {
    if (!model || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setFailed(false);
    const dates = new Map(meetings.map((m) => [m.id, m.createdAt]));
    try {
      const next = await generateFolderThread({
        model,
        meetings,
        thread,
        labels,
        meetingLabel: (id) => formatShortDate(dates.get(id), i18n.locale),
      });
      if (next) {
        await saveGeneratedFolderThread(folderPath, next);
      }
    } catch (error) {
      console.error("[folders] failed to update the folder thread", error);
      setFailed(true);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [folderPath, i18n.locale, labels, meetings, model, thread]);

  return { update, running, failed, hasModel: Boolean(model) };
}

// Fil rouge du projet (issue 496) : où en est le sujet, décisions, points
// ouverts et tâches non faites, chacun relié à sa réunion. Rédigé à la
// demande, modifiable avec l'éditeur de note ; les corrections sont gardées
// par les mises à jour suivantes.
export function FolderThreadCard({
  folderPath,
  meetings,
  thread,
}: {
  folderPath: string;
  meetings: readonly FolderMeeting[];
  thread: FolderThreadRecord | null;
}) {
  const { t, i18n } = useLingui();
  const { update, running, failed, hasModel } = useFolderThreadUpdate({
    folderPath,
    meetings,
    thread,
  });
  const { coveredUntil, pendingCount } = threadFreshness(meetings, thread);
  const mentionConfig = useMentionConfig();
  const handleChange = useCallback(
    (content: JSONContent) => {
      void saveFolderThreadEdit(folderPath, content).catch((error) => {
        console.error("[folders] failed to save the folder thread", error);
      });
    },
    [folderPath],
  );
  const coveredDate = formatShortDate(coveredUntil, i18n.locale);

  return (
    <section className={folderCardClassName} aria-label={t`Project thread`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          <Trans>Project thread</Trans>
        </h3>
        {thread ? (
          <span
            data-testid="folder-thread-freshness"
            className={cn([
              "rounded-md px-1.5 py-px text-[11px] font-semibold",
              pendingCount === 0
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground",
            ])}
          >
            <Trans>up to date as of {coveredDate}</Trans>
            {pendingCount > 0 ? (
              <>
                {" · "}
                <Plural
                  value={pendingCount}
                  one="# meeting since"
                  other="# meetings since"
                />
              </>
            ) : null}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={!hasModel || running || pendingCount === 0}
          title={
            hasModel
              ? undefined
              : t`Choose a language model in Settings to write the thread.`
          }
          onClick={() => void update()}
        >
          {running ? (
            <Spinner className="size-3.5" />
          ) : (
            <ArrowsClockwise className="size-3.5" />
          )}
          <Trans>Update</Trans>
        </Button>
      </div>

      {failed ? (
        <p role="alert" className="text-destructive text-xs">
          <Trans>
            The thread could not be updated. Check the language model, then try
            again.
          </Trans>
        </p>
      ) : null}

      {thread?.body ? (
        <>
          <div aria-busy={running} className={cn([running && "opacity-60"])}>
            <NoteEditor
              key={`folder-thread-${thread.folderId}-${thread.version}`}
              className="folder-thread-editor text-sm"
              initialContent={thread.body}
              handleChange={handleChange}
              mentionConfig={mentionConfig}
              onLinkOpen={openEditorLink}
              readOnly={running}
              // Pas de titre de note : la première ligne est l'état du projet.
              enforceTitleHeading={false}
            />
          </div>
          <p className="text-muted-foreground text-[11.5px]">
            <Trans>
              Editable: your corrections are kept when the thread is updated.
            </Trans>
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {pendingCount > 0 ? (
            <Trans>
              Not written yet. Update writes it from the summaries of the
              meetings in this folder, with your local model.
            </Trans>
          ) : (
            <Trans>
              The thread is written from meeting summaries. It will be available
              once a meeting in this folder has a summary.
            </Trans>
          )}
        </p>
      )}
    </section>
  );
}
