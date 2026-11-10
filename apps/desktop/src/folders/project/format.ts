// Dates de la page d'un dossier : « 2 nov. » (pastille, liens vers les
// réunions) et « lun. 2 nov. » (chronologie, en-tête).

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatShortDate(
  iso: string | null | undefined,
  locale: string,
): string {
  const date = toDate(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" }
      : {}),
  }).format(date);
}

export function formatMeetingDate(
  iso: string | null | undefined,
  locale: string,
): string {
  const date = toDate(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" }
      : {}),
  }).format(date);
}
