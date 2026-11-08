import { t } from "@lingui/core/macro";

// Coupures de transcription d'une capture, en millisecondes epoch. Sans audio
// conservé, elles ne peuvent pas être comblées : elles sont affichées datées.
export type CaptureInterruption = { startedAt: number; endedAt: number };

// En deçà d'une minute, un intervalle « 19:49–19:49 » ne dit rien : la coupure
// est annoncée comme brève, à l'heure de son début (issue 434).
const SHORT_INTERRUPTION_MS = 60_000;

function isShortInterruption(
  interruption: CaptureInterruption,
  start: string,
  end: string,
): boolean {
  return (
    start === end ||
    interruption.endedAt - interruption.startedAt < SHORT_INTERRUPTION_MS
  );
}

export function formatInterruption(
  interruption: CaptureInterruption,
  timeZone?: string,
): string {
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const start = time.format(interruption.startedAt);
  const end = time.format(interruption.endedAt);
  if (isShortInterruption(interruption, start, end)) {
    return t`for a few seconds at ${start}`;
  }
  return `${start}–${end}`;
}

export function formatInterruptions(
  interruptions: CaptureInterruption[],
  timeZone?: string,
): string {
  const gaps = interruptions
    .map((interruption) => formatInterruption(interruption, timeZone))
    .join(", ");
  return t`Transcription interrupted ${gaps}`;
}
