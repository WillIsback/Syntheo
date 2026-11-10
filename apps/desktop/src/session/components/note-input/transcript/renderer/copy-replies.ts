import { plural, t } from "@lingui/core/macro";

import type { TranscriptWordSelection } from "./selection";

import { copyTextToClipboard } from "~/session/components/note-input/header-shared";

type Entries = ReadonlyMap<string, TranscriptWordSelection>;

// Répliques sélectionnées, dans l'ordre de la transcription. Une entrée qui
// n'est plus dans l'ordre (transcription changée entre-temps) garde la valeur
// lue au moment du clic, à la fin.
export function orderSelectedReplies(
  selected: Entries,
  order: readonly string[],
  entries: Entries,
): TranscriptWordSelection[] {
  const known = new Set(order);
  return [
    ...order.flatMap((key) =>
      selected.has(key) ? [entries.get(key) ?? selected.get(key)!] : [],
    ),
    ...[...selected].flatMap(([key, entry]) => (known.has(key) ? [] : [entry])),
  ];
}

// « Claire : … », une réplique par paragraphe (issue 458). La ponctuation suit
// la langue (espace avant les deux-points en français).
export function formatRepliesForClipboard(
  replies: readonly TranscriptWordSelection[],
): string {
  return replies
    .flatMap(({ speakerLabel, text }) => {
      const body = text.trim();
      if (!body) return [];
      return [speakerLabel ? t`${speakerLabel}: ${body}` : body];
    })
    .join("\n\n");
}

// Ctrl C ne garde pas les intervenants : « Copier » de la barre de sélection
// les écrit en tête de chaque réplique.
export function copySelectedReplies(
  selected: Entries,
  order: readonly string[],
  entries: Entries,
) {
  const replies = orderSelectedReplies(selected, order, entries);
  const count = replies.length;
  const success =
    count >= order.length
      ? t`Transcript copied`
      : plural(count, { one: "# reply copied", other: "# replies copied" });
  return copyTextToClipboard(formatRepliesForClipboard(replies), {
    success,
    error: t`Something went wrong`,
  });
}
