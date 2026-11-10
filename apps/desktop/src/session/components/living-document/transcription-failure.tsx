import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "@syntheo/ui/components/ui/button";

import {
  clearTranscriptionFailure,
  useTranscriptionFailure,
} from "~/session/transcription-failure";
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

  const reason =
    failure.code === "no_speech"
      ? t`No speech was detected in the audio.`
      : failure.message;

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
        <Trans>The audio transcription failed.</Trans>{" "}
        <span className="text-muted-foreground">{reason}</span>
      </p>
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
  );
}
