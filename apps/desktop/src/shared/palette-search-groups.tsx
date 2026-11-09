import { Trans, useLingui } from "@lingui/react/macro";
import { Command as CommandPrimitive } from "cmdk";
import type { ReactNode } from "react";

import {
  Buildings,
  FileText,
  Folder,
  NotePencil,
  Sparkle,
  User,
  X,
} from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import { formatFolderPath, formatMeetingCount } from "~/search/unified/labels";
import type {
  NoteResult,
  SearchContact,
  SearchFolder,
} from "~/search/unified/types";
import { PALETTE_ITEM_CLASS } from "~/shared/palette-settings-group";

// Groupes de la palette `Ctrl+K` nourris par la recherche commune
// (issue 501) : dossiers, notes avec leur dossier, contacts, et les actions
// d'un dossier posé en filtre.

export const PALETTE_FOLDER_VALUE_PREFIX = "folder-";

export function paletteFolderValue(path: string): string {
  return `${PALETTE_FOLDER_VALUE_PREFIX}${path}`;
}

function PaletteHeading({
  withDivider,
  children,
}: {
  withDivider: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {withDivider ? <div className="bg-accent mx-2 h-px" /> : null}
      <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium tracking-wider uppercase">
        {children}
      </div>
    </div>
  );
}

export function PaletteFolderGroup({
  folders,
  withDivider,
  onSelect,
}: {
  folders: readonly SearchFolder[];
  withDivider: boolean;
  onSelect: (folder: SearchFolder) => void;
}) {
  return (
    <CommandPrimitive.Group
      className="pb-1.5"
      heading={
        <PaletteHeading withDivider={withDivider}>
          <Trans>Folders</Trans>
        </PaletteHeading>
      }
    >
      {folders.map((folder) => (
        <CommandPrimitive.Item
          key={folder.path}
          value={paletteFolderValue(folder.path)}
          onSelect={() => onSelect(folder)}
          className={cn([PALETTE_ITEM_CLASS, "group"])}
        >
          <Folder className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="text-foreground truncate font-medium">
            {folder.name}
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">
            {formatMeetingCount(folder.noteCount)}
          </span>
          <span className="text-muted-foreground ml-auto hidden shrink-0 text-xs group-data-[selected=true]:inline">
            <Trans>Tab: search inside</Trans>
          </span>
        </CommandPrimitive.Item>
      ))}
    </CommandPrimitive.Group>
  );
}

function formatShortDate(value: string, locale: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

export function PaletteNoteItem({
  note,
  value,
  showFolder,
  onSelect,
}: {
  note: NoteResult;
  value: string;
  showFolder: boolean;
  onSelect: (note: NoteResult) => void;
}) {
  const { t, i18n } = useLingui();
  const date = formatShortDate(note.createdAt, i18n.locale);

  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={() => onSelect(note)}
      className={PALETTE_ITEM_CLASS}
    >
      <FileText className="text-muted-foreground h-4 w-4 shrink-0 self-start pt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">{note.title || t`Untitled`}</span>
          {showFolder && note.folderPath ? (
            <span
              data-testid="palette-note-folder"
              className="bg-muted text-muted-foreground flex max-w-[45%] shrink-0 items-center gap-1 rounded-md px-1.5 text-xs"
            >
              <Folder aria-hidden className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {formatFolderPath(note.folderPath)}
              </span>
            </span>
          ) : null}
          {date ? (
            <span className="text-muted-foreground ml-auto shrink-0 text-xs">
              {date}
            </span>
          ) : null}
        </div>
        {note.match === "content" && note.snippet ? (
          <span className="text-muted-foreground truncate text-xs">
            … {note.snippet} …
          </span>
        ) : null}
      </div>
    </CommandPrimitive.Item>
  );
}

export function PaletteNoteGroup({
  notes,
  heading,
  withDivider,
  showFolder = true,
  onSelect,
}: {
  notes: readonly NoteResult[];
  heading: ReactNode;
  withDivider: boolean;
  showFolder?: boolean;
  onSelect: (note: NoteResult) => void;
}) {
  return (
    <CommandPrimitive.Group
      className="pb-1.5"
      heading={
        <PaletteHeading withDivider={withDivider}>{heading}</PaletteHeading>
      }
    >
      {notes.map((note) => (
        <PaletteNoteItem
          key={note.id}
          note={note}
          value={`note-${note.id}`}
          showFolder={showFolder}
          onSelect={onSelect}
        />
      ))}
    </CommandPrimitive.Group>
  );
}

export function PaletteContactGroup({
  contacts,
  withDivider,
  onSelect,
}: {
  contacts: readonly SearchContact[];
  withDivider: boolean;
  onSelect: (contact: SearchContact) => void;
}) {
  return (
    <CommandPrimitive.Group
      className="pb-1.5"
      heading={
        <PaletteHeading withDivider={withDivider}>
          <Trans>Contacts</Trans>
        </PaletteHeading>
      }
    >
      {contacts.map((contact) => {
        const Icon = contact.type === "human" ? User : Buildings;
        return (
          <CommandPrimitive.Item
            key={`${contact.type}-${contact.id}`}
            value={`contact-${contact.type}-${contact.id}`}
            onSelect={() => onSelect(contact)}
            className={PALETTE_ITEM_CLASS}
          >
            <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="truncate">{contact.name}</span>
          </CommandPrimitive.Item>
        );
      })}
    </CommandPrimitive.Group>
  );
}

export function PaletteFolderActions({
  query,
  withDivider,
  onAsk,
  onNewNote,
}: {
  query: string;
  withDivider: boolean;
  onAsk: () => void;
  onNewNote: () => void;
}) {
  const { t } = useLingui();
  const question = query.trim();

  return (
    <CommandPrimitive.Group
      className="pb-1.5"
      heading={
        <PaletteHeading withDivider={withDivider}>
          <Trans>Actions</Trans>
        </PaletteHeading>
      }
    >
      <CommandPrimitive.Item
        value="folder-action-ask"
        onSelect={onAsk}
        className={PALETTE_ITEM_CLASS}
      >
        <Sparkle className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="truncate">
          {question ? t`Ask the folder: “${question}”` : t`Ask the folder`}
        </span>
      </CommandPrimitive.Item>
      <CommandPrimitive.Item
        value="folder-action-new-note"
        onSelect={onNewNote}
        className={PALETTE_ITEM_CLASS}
      >
        <NotePencil className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="truncate">
          <Trans>New note in this folder</Trans>
        </span>
      </CommandPrimitive.Item>
    </CommandPrimitive.Group>
  );
}

/** Pastille du dossier posé en filtre, comme « Paramètres × ». */
export function PaletteFolderChip({
  folder,
  onRemove,
}: {
  folder: string;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const name = folder.split("/").pop() ?? folder;

  return (
    <button
      type="button"
      aria-label={t`Remove the ${name} folder filter`}
      title={formatFolderPath(folder)}
      onClick={onRemove}
      className={cn([
        "bg-accent text-accent-foreground flex max-w-[45%] shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
      ])}
    >
      <Folder aria-hidden className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
      <X aria-hidden className="h-3 w-3 shrink-0" />
    </button>
  );
}
