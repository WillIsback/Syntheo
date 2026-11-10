import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "@syntheo/ui/components/ui/button";

import { useListener } from "~/stt/contexts";

// Issue 559 : quand la transcription d'un audio échoue (aucune parole, par
// exemple), la note reste en « Préparer ». Elle dit pourquoi, au lieu de
// paraître vierge. L'arrêt demandé par l'utilisateur n'est pas un échec.
export function TranscriptionFailureNotice({
  sessionId,
}: {
  sessionId: string;
}) {
  const { t } = useLingui();
  const error = useListener((state) => {
    const batch = state.batch[sessionId];
    return batch?.error && batch.terminalReason !== "stopped"
      ? batch.error
      : null;
  });
  const clearBatchSession = useListener((state) => state.clearBatchSession);

  if (!error) {
    return null;
  }

  return (
    <div
      role="alert"
      data-transcription-failure
      className="border-destructive/40 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-2.5"
    >
      <p className="text-foreground min-w-0 text-[13px]">
        <Trans>The audio transcription failed.</Trans>{" "}
        <span className="text-muted-foreground">{error}</span>
      </p>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={t`Dismiss`}
        onClick={() => clearBatchSession(sessionId)}
      >
        <Trans>Dismiss</Trans>
      </Button>
    </div>
  );
}
