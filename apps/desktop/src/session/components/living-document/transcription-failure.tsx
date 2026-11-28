import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "@syntheo/ui/components/ui/button";

import { useDeleteSession } from "~/session/hooks/useDeleteSession";
import { useSessionSummary } from "~/session/queries";
import {
  AGENT_IMPORT_FAILED_CODE,
  clearTranscriptionFailure,
  INTERRUPTED_IMPORT_CODE,
  useTranscriptionFailure,
} from "~/session/transcription-failure";
import { describeAudioImportError } from "~/stt/audio-import-feedback";
import { useListener } from "~/stt/contexts";

// Issue 559 : quand la transcription d'un audio importé échoue (aucune parole,
// par exemple), la note reste en « Préparer ». Elle dit pourquoi, au lieu de
// paraître vierge, y compris après une relance de l'app : l'échec est gardé
// dans la note jusqu'à ce que l'utilisateur ferme l'avis ou réimporte.
export function TranscriptionFailureNotice({
  sessionId,
}: {
  sessionId: string;
}) {
  const { t } = useLingui();
  const failure = useTranscriptionFailure(sessionId);
  const clearBatchSession = useListener((state) => state.clearBatchSession);

  if (!failure) {
    return null;
  }

  const agentImport = failure.code === AGENT_IMPORT_FAILED_CODE;
  const reason =
    failure.code === "no_speech"
      ? t`No speech was detected in the audio.`
      : failure.code === INTERRUPTED_IMPORT_CODE
        ? t`Syntheo was closed before the import finished. Import the file again.`
        : // Message gardé brut dans la note (« unsupported audio codec:
          // opus », « recording_too_long »…) : traduit à l'affichage, comme
          // le toast de l'import (passe QA 0.8.1-1, issues 714 et 654).
          describeAudioImportError(new Error(failure.message));

  const dismiss = () => {
    clearBatchSession(sessionId);
    void clearTranscriptionFailure(sessionId).catch((error: unknown) => {
      console.error("[transcription] failed to clear failure notice", error);
    });
  };

  return (
    <div
      role="alert"
      data-transcription-failure
      className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-2.5"
    >
      <p className="text-foreground min-w-0 text-[13px]">
        {agentImport ? (
          <Trans>The import requested by an agent failed.</Trans>
        ) : (
          <Trans>The audio transcription failed.</Trans>
        )}{" "}
        <span className="text-muted-foreground">
          {reason}
          {agentImport ? (
            <>
              {" "}
              <Trans>
                Drop the recording into this note to import it again, or delete
                the note.
              </Trans>
            </>
          ) : null}
        </span>
      </p>
      <div className="flex items-center gap-1">
        {agentImport ? <DeleteFailedImportNote sessionId={sessionId} /> : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t`Dismiss`}
          onClick={dismiss}
        >
          <Trans>Dismiss</Trans>
        </Button>
      </div>
    </div>
  );
}

// Issue 794 : la réunion créée pour un import d'agent en échec reste vide ; on
// peut la supprimer d'ici (avec l'annulation habituelle). Réessayer passe par
// un nouveau dépôt du fichier dans la note, ou une nouvelle demande de l'agent.
function DeleteFailedImportNote({ sessionId }: { sessionId: string }) {
  const deleteSession = useDeleteSession();
  const title = useSessionSummary(sessionId)?.title;
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-destructive"
      onClick={() => {
        deleteSession(sessionId, { title });
      }}
    >
      <Trans>Delete note</Trans>
    </Button>
  );
}
