import { Trans, useLingui } from "@lingui/react/macro";
import { type KeyboardEvent, useCallback, useMemo, useRef } from "react";

import { DotsThreeVertical } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import { formatDuration, formatIndexDate } from "./format";
import type { RecentNote } from "./queries";

import {
  type MenuItemDef,
  useNativeContextMenu,
} from "~/shared/hooks/useNativeContextMenu";

type NoteIndexActions = {
  onOpen: (sessionId: string) => void;
  onExport: (sessionId: string) => void;
  onDelete: (note: RecentNote) => void;
};

// Touche « menu » du clavier ou Maj+F10 : ouvre le menu de la ligne.
function isMenuKey(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

// « Reprendre » : tableau sans carte, lignes séparées par un filet `border`,
// survol `accent`. Chaque ligne a un bouton (titre) ; flèches haut/bas pour
// passer d'une note à l'autre. Clic droit ou bouton « ⋮ » : menu natif
// Ouvrir, Exporter…, Supprimer (issue 420).
export function NoteIndex({
  notes,
  ...actions
}: { notes: readonly RecentNote[] } & NoteIndexActions) {
  const tableRef = useRef<HTMLTableElement>(null);

  const moveFocus = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const delta =
        event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      if (!delta) return;
      const buttons =
        tableRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-note-open]",
        ) ?? [];
      const next = buttons[index + delta];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    },
    [],
  );

  if (notes.length === 0) return null;

  return (
    <section aria-labelledby="home-resume-title">
      <h2
        id="home-resume-title"
        className="text-faint mb-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase"
      >
        <Trans>Resume</Trans>
      </h2>
      <table ref={tableRef} className="w-full border-collapse">
        <tbody>
          {notes.map((note, index) => (
            <NoteRow
              key={note.id}
              note={note}
              index={index}
              moveFocus={moveFocus}
              {...actions}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function NoteRow({
  note,
  index,
  moveFocus,
  onOpen,
  onExport,
  onDelete,
}: {
  note: RecentNote;
  index: number;
  moveFocus: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
} & NoteIndexActions) {
  const { t, i18n } = useLingui();
  const title = note.title || t`Untitled`;
  const duration = formatDuration(note.durationMs);

  const contextMenu = useMemo<MenuItemDef[]>(
    () => [
      { id: "open", text: t`Open`, action: () => onOpen(note.id) },
      { id: "export", text: t`Export…`, action: () => onExport(note.id) },
      { separator: true },
      { id: "delete", text: t`Delete`, action: () => onDelete(note) },
    ],
    [t, note, onOpen, onExport, onDelete],
  );
  const showMenu = useNativeContextMenu(contextMenu);

  return (
    <tr
      onClick={() => onOpen(note.id)}
      onContextMenu={(event) => void showMenu(event)}
      className="group hover:bg-accent focus-within:bg-accent cursor-pointer motion-safe:transition-colors"
    >
      <td className="border-border text-muted-foreground w-[110px] border-t px-1 py-3 text-[13px] whitespace-nowrap">
        {formatIndexDate(note.createdAt, i18n.locale)}
      </td>
      <td className="border-border border-t px-1 py-3 text-[15px]">
        <button
          type="button"
          data-note-open
          onClick={(event) => {
            event.stopPropagation();
            onOpen(note.id);
          }}
          onKeyDown={(event) => {
            if (isMenuKey(event)) {
              void showMenu(event);
              return;
            }
            moveFocus(event, index);
          }}
          className={cn([
            "text-foreground w-full truncate rounded-sm text-left",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
          ])}
        >
          {title}
        </button>
      </td>
      <td className="border-border text-muted-foreground border-t px-1 py-3 text-right text-[13px] whitespace-nowrap">
        {duration}
      </td>
      <td className="border-border w-8 border-t py-3 pr-1 text-right">
        <button
          type="button"
          data-note-actions
          aria-label={t`More actions`}
          aria-haspopup="menu"
          onClick={(event) => {
            // Le bouton ne doit pas ouvrir la note (clic de la ligne).
            event.stopPropagation();
            void showMenu(event);
          }}
          className={cn([
            "text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-sm align-middle",
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            "motion-safe:transition-opacity",
          ])}
        >
          <DotsThreeVertical className="size-4" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}
