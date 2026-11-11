import { Trans, useLingui } from "@lingui/react/macro";

import { capsuleButtonClassName, formatElapsed } from "./index";

export type CapsuleImportEstimate = {
  remainingSeconds: number;
  // `null` quand la durée de l'audio importé est inconnue.
  speedFactor: number | null;
};

export type CapsuleImportProgress = {
  // Avancement entre 0 et 1.
  fraction: number;
  // `null` tant que l'estimation n'est pas fiable (issue 531).
  estimate: CapsuleImportEstimate | null;
  // Absent pendant la copie du fichier : l'arrêt n'est possible qu'une fois
  // la transcription lancée, comme dans l'onglet Transcription.
  onStop?: () => void;
  // Avancement inconnu (requête REST unique, issue 568) : barre animée sans
  // pourcentage et temps écoulé depuis le début de la transcription.
  indeterminate?: boolean;
  elapsedSeconds?: number;
};

// État « Import » de la capsule (issue 526) : barre fine et pourcentage,
// durée restante et accélération, bouton « Arrêter ». Quand le serveur ne
// donne pas d'avancement (issue 568) : barre indéterminée, temps écoulé et
// « Transcription en cours… ».
export function ImportProgress({
  progress,
}: {
  progress: CapsuleImportProgress;
}) {
  const { t, i18n } = useLingui();
  const fraction = Math.min(1, Math.max(0, progress.fraction));
  const percent = Math.round(fraction * 100);
  // « 22 % » en français (espace fine insécable), « 22% » en anglais.
  const percentLabel = new Intl.NumberFormat(i18n.locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(percent / 100);

  return (
    <div data-import-progress className="flex items-center gap-3 px-2">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="w-3 text-center">
            ↑
          </span>
          {/* Annoncé une fois à l'apparition ; la barre porte l'avancement. */}
          <span role="status" className="text-[13px] font-semibold">
            <Trans>Import</Trans>
          </span>
          {progress.indeterminate ? (
            <>
              {/* Ni aria-valuenow ni pourcentage : l'avancement est inconnu. */}
              <div
                role="progressbar"
                aria-label={t`Import progress`}
                aria-busy="true"
                className="bg-primary-foreground/25 rounded-pill h-1 w-28 overflow-hidden"
              >
                <div
                  data-indeterminate-bar
                  className="bg-primary-foreground rounded-pill motion-safe:animate-progress-indeterminate h-full w-2/5 motion-reduce:w-full motion-reduce:opacity-50"
                />
              </div>
              <span
                aria-label={t`Elapsed time`}
                className="font-mono text-[13px] tabular-nums"
              >
                {formatElapsed(progress.elapsedSeconds ?? 0)}
              </span>
            </>
          ) : (
            <>
              <div
                role="progressbar"
                aria-label={t`Import progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="bg-primary-foreground/25 rounded-pill h-1 w-28 overflow-hidden"
              >
                <div
                  className="bg-primary-foreground rounded-pill h-full transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="font-mono text-[13px] tabular-nums">
                {percentLabel}
              </span>
            </>
          )}
        </div>
        <span
          data-import-estimate
          className="text-primary-foreground/70 pl-5 text-xs tabular-nums"
        >
          {progress.indeterminate ? (
            t`Transcription in progress…`
          ) : (
            <ImportEstimate estimate={progress.estimate} />
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={progress.onStop}
        disabled={!progress.onStop}
        className={capsuleButtonClassName("primary")}
      >
        <Trans>Stop</Trans>
      </button>
    </div>
  );
}

function ImportEstimate({
  estimate,
}: {
  estimate: CapsuleImportEstimate | null;
}) {
  const { t, i18n } = useLingui();
  if (estimate === null) {
    return t`Estimating…`;
  }

  const minutes = Math.round(estimate.remainingSeconds / 60);
  const remaining =
    estimate.remainingSeconds < 60 ? t`< 1 min left` : t`~${minutes} min left`;
  if (estimate.speedFactor === null) {
    return remaining;
  }

  // Virgule décimale selon la locale active : « ×2,1 » en français.
  const factor = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(estimate.speedFactor);
  return `${remaining} · ${t`×${factor}`}`;
}
