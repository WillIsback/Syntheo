import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NoteEditor, type JSONContent } from "@syntheo/editor/note";
import { ArrowsClockwise, NotePencil } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { Spinner } from "@syntheo/ui/components/ui/spinner";
import { cn } from "@syntheo/utils";

import {
  agendaMaterial,
  generateFolderAgenda,
  hasAgendaMaterial,
} from "./agenda";
import {
  hasStoredFolderAgenda,
  saveFolderAgendaEdit,
  saveGeneratedFolderAgenda,
  useFolderAgenda,
} from "./agenda-store";
import { folderCardClassName } from "./folder-side-panel";
import { useThreadLabels } from "./folder-thread-card";
import { formatShortDate } from "./format";
import type { FolderMeeting } from "./meetings";
import { useNextMeetingRequest } from "./next-meeting-request";
import { prepareNextNote } from "./prepare-next-note";
import type { FolderThreadRecord } from "./thread-store";

import { useLanguageModel } from "~/ai/hooks";
import { useMentionConfig } from "~/editor-bridge/mention-config";
import { openEditorLink } from "~/editor-bridge/open-editor-link";

// Bloc « Prochaine réunion » (issue 491), en tête de la page du dossier :
// l'ordre du jour proposé à la demande par le modèle local à partir de ce qui
// reste à traiter, modifiable avec l'éditeur de note, et « Préparer la note »
// qui crée la prochaine note rangée dans le dossier. Pas de date devinée.
export function NextMeetingSlot({
  folderPath,
  meetings,
  thread,
}: {
  folderPath: string;
  meetings: readonly FolderMeeting[];
  thread: FolderThreadRecord | null;
}) {
  const { t, i18n } = useLingui();
  const model = useLanguageModel();
  const labels = useThreadLabels();
  const agenda = useFolderAgenda(folderPath);
  const mentionConfig = useMentionConfig();
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const runningRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  const material = useMemo(
    () => agendaMaterial({ meetings, thread, labels }),
    [labels, meetings, thread],
  );
  const canPropose = Boolean(model) && hasAgendaMaterial(material);
  const edited = Boolean(
    agenda?.editedAt &&
    (!agenda.generatedAt || agenda.editedAt > agenda.generatedAt),
  );

  const propose = useCallback(async () => {
    if (!model || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setFailed(false);
    setConfirming(false);
    const dates = new Map(meetings.map((m) => [m.id, m.createdAt]));
    try {
      const next = await generateFolderAgenda({
        model,
        meetings,
        thread,
        labels,
        meetingLabel: (id) => formatShortDate(dates.get(id), i18n.locale),
      });
      if (next) {
        await saveGeneratedFolderAgenda(folderPath, next);
      }
    } catch (error) {
      console.error("[folders] failed to propose the agenda", error);
      setFailed(true);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [folderPath, i18n.locale, labels, meetings, model, thread]);

  // Arrivée depuis « Demander à la note » : le bloc se montre et propose
  // l'ordre du jour s'il n'y en a pas encore. Les réunions et l'ordre du jour
  // se chargent à part : la demande attend que la matière soit là, et la base
  // est relue avant de proposer, pour ne jamais remplacer un ordre du jour
  // existant sans confirmation.
  const requested = useNextMeetingRequest((state) => state.folderPath);
  useEffect(() => {
    if (requested !== folderPath) return;
    sectionRef.current?.scrollIntoView({ block: "start" });
    if (!agenda && !canPropose) return;
    useNextMeetingRequest.getState().clear();
    if (agenda) return;
    void hasStoredFolderAgenda(folderPath).then((stored) => {
      if (!stored) void propose();
    });
  }, [agenda, canPropose, folderPath, propose, requested]);

  const handleChange = useCallback(
    (content: JSONContent) => {
      void saveFolderAgendaEdit(folderPath, content).catch((error) => {
        console.error("[folders] failed to save the agenda", error);
      });
    },
    [folderPath],
  );

  const prepare = () => {
    setPreparing(true);
    void prepareNextNote({
      folderPath,
      meetings,
      agenda: agenda?.body ?? null,
      agendaHeading: t`Agenda`,
    })
      .catch((error) => {
        console.error("[folders] failed to prepare the next note", error);
      })
      .finally(() => setPreparing(false));
  };

  return (
    <section
      ref={sectionRef}
      className={folderCardClassName}
      aria-label={t`Next meeting`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          <Trans>Next meeting</Trans>
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground ml-auto"
          disabled={!canPropose || running}
          title={
            model
              ? undefined
              : t`Choose a language model in Settings to propose the agenda.`
          }
          onClick={() => {
            if (edited && !confirming) {
              setConfirming(true);
              return;
            }
            void propose();
          }}
        >
          {running ? (
            <Spinner className="size-3.5" />
          ) : (
            <ArrowsClockwise className="size-3.5" />
          )}
          <Trans>Propose</Trans>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={preparing}
          onClick={prepare}
        >
          <NotePencil className="size-3.5" />
          <Trans>Prepare the note</Trans>
        </Button>
      </div>

      {confirming ? (
        <div
          role="alert"
          className="bg-muted text-foreground flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
        >
          <span className="mr-auto">
            <Trans>A new proposal replaces your changes to the agenda.</Trans>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button type="button" size="sm" onClick={() => void propose()}>
            <Trans>Replace</Trans>
          </Button>
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="text-destructive text-xs">
          <Trans>
            The agenda could not be proposed. Check the language model, then try
            again.
          </Trans>
        </p>
      ) : null}

      {agenda ? (
        <>
          <p className="text-muted-foreground text-xs">
            <Trans>
              Agenda proposed from the points still open (editable):
            </Trans>
          </p>
          <div aria-busy={running} className={cn([running && "opacity-60"])}>
            <NoteEditor
              key={`folder-agenda-${agenda.folderId}-${agenda.generatedAt ?? ""}`}
              className="folder-agenda-editor text-sm"
              initialContent={agenda.body}
              handleChange={handleChange}
              mentionConfig={mentionConfig}
              onLinkOpen={openEditorLink}
              readOnly={running}
              enforceTitleHeading={false}
            />
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {hasAgendaMaterial(material) ? (
            <Trans>
              Propose drafts the agenda from the open points, decisions to
              confirm and open tasks of this folder, with your local model.
            </Trans>
          ) : (
            <Trans>
              The agenda is drafted from meeting summaries. It will be available
              once a meeting in this folder has a summary.
            </Trans>
          )}
        </p>
      )}
    </section>
  );
}
