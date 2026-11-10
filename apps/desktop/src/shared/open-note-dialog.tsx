import { Trans, useLingui } from "@lingui/react/macro";
import { Command as CommandPrimitive } from "cmdk";
import { useCallback, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import {
  BookOpen,
  Gear,
  NotePencil,
  MagnifyingGlass,
  Pause,
  Play,
  UsersThree,
  X,
  type Icon,
} from "@syntheo/ui/components/icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";
import { cn } from "@syntheo/utils";

import { askFolder } from "~/chat/ask-folder";
import { useFolderSelection } from "~/folders/selection";
import type {
  NoteResult,
  SearchContact,
  SearchFolder,
} from "~/search/unified/types";
import { useUnifiedSearch } from "~/search/unified/use-unified-search";
import {
  requestSpeakerNaming,
  useSpeakerNamingStore,
} from "~/session/components/speaker-naming/store";
import { createSession } from "~/session/queries";
import {
  normalizeSearchText,
  searchSettings,
  type SettingsSearchResult,
  useSettingsSearchIndex,
} from "~/settings/search";
import { requestSettingFocus } from "~/settings/setting-focus";
import { openHelpDialog } from "~/shared/help-dialog";
import { useMainContentCenterOffset } from "~/shared/main/content-offset";
import {
  PaletteContactGroup,
  PaletteFolderActions,
  PaletteFolderChip,
  PaletteFolderGroup,
  PaletteNoteGroup,
  paletteFolderValue,
} from "~/shared/palette-search-groups";
import {
  NoSettingMatches,
  PALETTE_ITEM_CLASS,
  PALETTE_SETTINGS_LIMIT,
  PaletteSettingsGroup,
} from "~/shared/palette-settings-group";
import {
  closeNoteDialog,
  openNoteDialog,
  openSettingsSearch,
  useIsNoteDialogOpen,
  usePaletteStore,
} from "~/shared/palette-store";
import { formatShortcutKeys } from "~/shared/shortcuts";
import { useNewNote } from "~/shared/useNewNote";
import { useSettingsNavGroups } from "~/sidebar/settings-nav-groups";
import { type TabInput, useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";
import { requestMainListenerControl } from "~/stt/window-control";

export {
  closeNoteDialog,
  openNoteDialog,
  openSettingsSearch,
  useIsNoteDialogOpen,
};

const MAX_RECENT_DISPLAY = 5;
// Notes affichées pour un texte tapé ; les mentions `@` montrent le début de
// la même liste (issue 501).
const PALETTE_NOTE_LIMIT = 50;

interface OpenNoteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mainContentCenterOffset?: number;
}

type OpenNoteDialogApi = {
  open: () => void;
};

type PageResult = {
  id: string;
  label: string;
  hint: string | null;
  groupLabel: string;
  icon: Icon;
  destination: TabInput;
};

function filterPageResults(
  query: string,
  pageResults: PageResult[],
  topLevelPageIds: Set<string>,
): PageResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return pageResults.filter((page) => topLevelPageIds.has(page.id));
  }
  const matches = (text: string | null) =>
    text !== null && normalizeSearchText(text).includes(normalizedQuery);
  return pageResults.filter(
    (page) =>
      matches(page.label) || matches(page.groupLabel) || matches(page.hint),
  );
}

function contactTabInput(contact: SearchContact): TabInput {
  return {
    type: "contacts",
    state: {
      selected: {
        type: contact.type === "human" ? "person" : "organization",
        id: contact.id,
      },
    },
  };
}

function preventCloseWhenOnDragRegion(event: {
  detail: { originalEvent: { target: EventTarget | null } };
  preventDefault: () => void;
}) {
  const target = event.detail.originalEvent.target;
  if (
    target instanceof Element &&
    target.closest("[data-open-note-dialog-drag-region]")
  ) {
    event.preventDefault();
  }
}

// Palette `Ctrl+K` : seul point d'entrée vers l'historique des notes depuis la
// disparition de la barre latérale. Elle cherche aussi les paramètres ; son
// état vit dans `palette-store.ts`. Notes, dossiers et contacts viennent de la
// recherche commune avec les mentions `@` (issue 501).
const OPEN_NOTE_DIALOG_API: OpenNoteDialogApi = { open: openNoteDialog };

/**
 * API historique : renvoie `{ open }`, une référence stable. Fonctionne aussi
 * hors de `OpenNoteDialogProvider` ; le provider ne fait que monter la palette
 * et le raccourci `Ctrl+K`.
 */
export function useOpenNoteDialog(): OpenNoteDialogApi {
  return OPEN_NOTE_DIALOG_API;
}

export function OpenNoteDialogProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const open = useIsNoteDialogOpen();
  const setOpen = usePaletteStore((state) => state.setOpen);
  const mainContentCenterOffset = useMainContentCenterOffset();

  useHotkeys("mod+k", openNoteDialog, {
    preventDefault: true,
    enableOnFormTags: true,
    enableOnContentEditable: true,
  });

  return (
    <>
      {children}
      <OpenNoteDialog
        open={open}
        onOpenChange={setOpen}
        mainContentCenterOffset={mainContentCenterOffset}
      />
    </>
  );
}

// Fermée, la palette ne monte rien : pas de requêtes vives en arrière-plan.
export function OpenNoteDialog(props: OpenNoteDialogProps) {
  return props.open ? <PaletteDialog {...props} /> : null;
}

function PaletteDialog({
  open,
  onOpenChange,
  mainContentCenterOffset = 0,
}: OpenNoteDialogProps) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  // Palette filtrée sur les paramètres (`Ctrl Maj P`, issue 373).
  const settingsOnly = usePaletteStore((state) => state.filter) === "settings";
  const setFilter = usePaletteStore((state) => state.setFilter);
  // Dossier posé en filtre par Tab (issue 501).
  const folderFilter = usePaletteStore((state) => state.folder);
  const setFolderFilter = usePaletteStore((state) => state.setFolder);
  // Élément surligné (cmdk) : Tab n'agit que sur un dossier.
  const [selectedValue, setSelectedValue] = useState("");
  const settingsIndex = useSettingsSearchIndex();
  const settingResults = useMemo(
    () =>
      settingsOnly || query.trim() ? searchSettings(settingsIndex, query) : [],
    [query, settingsIndex, settingsOnly],
  );
  const openCurrent = useTabs((state) => state.openCurrent);
  const openNew = useTabs((state) => state.openNew);
  const recentlyOpenedSessionIds = useTabs(
    (state) => state.recentlyOpenedSessionIds,
  );
  const settingsNavGroups = useSettingsNavGroups();
  const createNewNote = useNewNote();
  const search = useUnifiedSearch(query, { folder: folderFilter });

  const pageResults = useMemo<PageResult[]>(
    () => [
      ...settingsNavGroups.flatMap((group) =>
        group.items.map((item): PageResult => {
          const hasDestination = "destination" in item;

          return {
            id: item.id,
            label: item.label,
            hint: hasDestination ? null : t`Settings`,
            groupLabel: group.label,
            icon: item.icon,
            destination: hasDestination
              ? item.destination
              : { type: "settings", state: { tab: item.id } },
          };
        }),
      ),
      {
        id: "settings",
        label: t`Settings`,
        hint: null,
        groupLabel: t`Go to`,
        icon: Gear,
        destination: { type: "settings", state: { tab: "app" } },
      },
    ],
    [settingsNavGroups, t],
  );

  const topLevelPageIds = new Set([
    "settings",
    ...settingsNavGroups.flatMap((group) =>
      group.items.flatMap((item) => ("destination" in item ? [item.id] : [])),
    ),
  ]);
  const isQueryEmpty = !query.trim();
  // Dans un dossier, la palette ne montre que lui : ni pages ni commandes.
  const inFolder = folderFilter !== null;
  const filteredPages = inFolder
    ? []
    : filterPageResults(query, pageResults, topLevelPageIds);

  // Sans texte ni filtre : les récents, puis toutes les notes par date.
  // Avec du texte : les notes classées par la recherche commune.
  const filteredRecentSessions = useMemo(() => {
    if (!isQueryEmpty || inFolder) return [];
    const byId = new Map(search.notes.map((note) => [note.id, note]));
    return recentlyOpenedSessionIds
      .slice(0, MAX_RECENT_DISPLAY)
      .map((id) => byId.get(id))
      .filter((note): note is NoteResult => note !== undefined);
  }, [inFolder, isQueryEmpty, recentlyOpenedSessionIds, search.notes]);

  const filteredOtherNotes = useMemo(() => {
    if (isQueryEmpty && !inFolder) {
      const recentIds = new Set(filteredRecentSessions.map((note) => note.id));
      return search.notes.filter((note) => !recentIds.has(note.id));
    }
    return search.notes.slice(0, PALETTE_NOTE_LIMIT);
  }, [filteredRecentSessions, inFolder, isQueryEmpty, search.notes]);

  // Dossiers en tête quand le texte correspond ; dans un dossier, ses
  // sous-dossiers.
  const folderResults = isQueryEmpty && !inFolder ? [] : search.folders;
  const contactResults = isQueryEmpty || inFolder ? [] : search.contacts;
  const folderPathByValue = new Map(
    folderResults.map((folder) => [paletteFolderValue(folder.path), folder]),
  );

  const newNoteLabel = t`New note`;
  const matchesQuery = (label: string) =>
    !inFolder &&
    (!query.trim() || label.toLowerCase().includes(query.trim().toLowerCase()));
  const showNewNote = matchesQuery(newNoteLabel);
  // Aide F1 (issue 372) : proposée dès qu'on tape « aide » ou « raccourcis »,
  // pour ne pas encombrer la palette vide.
  const helpLabel = t`Help and shortcuts`;
  const showHelp =
    query.trim() !== "" &&
    (matchesQuery(helpLabel) || matchesQuery(t`Keyboard shortcuts`));

  // Commande contextuelle de l'écoute (issue 353), sans raccourci dédié.
  const activeSessionId = useListener((state) =>
    state.live.status === "active" ? state.live.sessionId : null,
  );
  const pausedSessionId = useListener((state) =>
    state.live.pause?.phase === "paused" && state.live.status !== "active"
      ? state.live.pause.sessionId
      : null,
  );
  const listeningCommand = useMemo(
    () =>
      activeSessionId
        ? {
            action: "pause" as const,
            sessionId: activeSessionId,
            label: t`Pause listening`,
            icon: Pause,
          }
        : pausedSessionId
          ? {
              action: "resume" as const,
              sessionId: pausedSessionId,
              label: t`Resume listening`,
              icon: Play,
            }
          : null,
    [activeSessionId, pausedSessionId, t],
  );
  const showListeningCommand =
    listeningCommand !== null && matchesQuery(listeningCommand.label);

  // « Nommer les intervenants » (issue 321), seulement quand la note
  // affichée a des locuteurs anonymes.
  const speakerNamingSessionId = useSpeakerNamingStore(
    (state) => state.available?.sessionId ?? null,
  );
  const speakerNamingLabel = t`Name speakers`;
  const showSpeakerNaming =
    speakerNamingSessionId !== null && matchesQuery(speakerNamingLabel);

  const hasAnyResults =
    inFolder ||
    folderResults.length > 0 ||
    contactResults.length > 0 ||
    showNewNote ||
    showHelp ||
    showListeningCommand ||
    showSpeakerNaming ||
    filteredPages.length > 0 ||
    settingResults.length > 0 ||
    filteredRecentSessions.length > 0 ||
    filteredOtherNotes.length > 0;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setQuery("");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const focusInput = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  const handleSelect = useCallback(
    (note: NoteResult) => {
      handleOpenChange(false);
      openCurrent({ type: "sessions", id: note.id });
    },
    [handleOpenChange, openCurrent],
  );

  const handleSelectPage = useCallback(
    (page: PageResult) => {
      handleOpenChange(false);
      openNew(page.destination);
    },
    [handleOpenChange, openNew],
  );

  // Entrée sur un dossier ouvre sa page (navigation existante).
  const handleSelectFolder = useCallback(
    (folder: SearchFolder) => {
      handleOpenChange(false);
      useFolderSelection.getState().setSelectedPath(folder.path);
      openNew({ type: "folders" });
    },
    [handleOpenChange, openNew],
  );

  const handleSelectContact = useCallback(
    (contact: SearchContact) => {
      handleOpenChange(false);
      openNew(contactTabInput(contact));
    },
    [handleOpenChange, openNew],
  );

  const handleAskFolder = useCallback(() => {
    if (!folderFilter) return;
    const question = query;
    handleOpenChange(false);
    askFolder(folderFilter, question);
  }, [folderFilter, handleOpenChange, query]);

  // La création accepte un dossier : la note naît rangée.
  const handleNewNoteInFolder = useCallback(() => {
    if (!folderFilter) return;
    handleOpenChange(false);
    void createSession("", undefined, { folder_id: folderFilter })
      .then((sessionId) => openNew({ type: "sessions", id: sessionId }))
      .catch((error) => {
        console.error("[palette] failed to create note in folder", error);
      });
  }, [folderFilter, handleOpenChange, openNew]);

  // Arrivée : la page s'ouvre, défile jusqu'au réglage, le surligne et lui
  // donne le focus (voir setting-focus.ts).
  const handleSelectSetting = useCallback(
    (result: SettingsSearchResult) => {
      handleOpenChange(false);
      requestSettingFocus(result.id);
      openNew({ type: "settings", state: { tab: result.page } });
    },
    [handleOpenChange, openNew],
  );

  const handleNewNote = useCallback(() => {
    handleOpenChange(false);
    createNewNote();
  }, [createNewNote, handleOpenChange]);

  const handleHelp = useCallback(() => {
    handleOpenChange(false);
    openHelpDialog();
  }, [handleOpenChange]);

  const handleListeningCommand = useCallback(() => {
    if (!listeningCommand) return;
    handleOpenChange(false);
    void requestMainListenerControl(
      listeningCommand.action,
      listeningCommand.sessionId,
    );
  }, [handleOpenChange, listeningCommand]);

  const handleSpeakerNaming = useCallback(() => {
    if (!speakerNamingSessionId) return;
    handleOpenChange(false);
    requestSpeakerNaming(speakerNamingSessionId);
  }, [handleOpenChange, speakerNamingSessionId]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Tab sur un dossier le pose en filtre : la recherche continue dedans.
    if (event.key === "Tab" && !event.shiftKey && !settingsOnly) {
      const folder = folderPathByValue.get(selectedValue);
      if (folder) {
        event.preventDefault();
        setFolderFilter(folder.path);
        setQuery("");
        return;
      }
    }
    // Retour arrière dans un champ vide retire le filtre.
    if (event.key === "Backspace" && !query && (settingsOnly || inFolder)) {
      event.preventDefault();
      if (settingsOnly) setFilter(null);
      else setFolderFilter(null);
    }
  };

  const actionGroup = (showNewNote ||
    showListeningCommand ||
    showHelp ||
    showSpeakerNaming) && (
    <CommandPrimitive.Group className="pb-1.5">
      {showSpeakerNaming ? (
        <CommandPrimitive.Item
          value="action-name-speakers"
          onSelect={handleSpeakerNaming}
          className={PALETTE_ITEM_CLASS}
        >
          <UsersThree className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate">{speakerNamingLabel}</span>
        </CommandPrimitive.Item>
      ) : null}
      {showListeningCommand && listeningCommand ? (
        <CommandPrimitive.Item
          value={`action-${listeningCommand.action}-listening`}
          onSelect={handleListeningCommand}
          className={PALETTE_ITEM_CLASS}
        >
          <listeningCommand.icon className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate">{listeningCommand.label}</span>
        </CommandPrimitive.Item>
      ) : null}
      {showNewNote ? (
        <CommandPrimitive.Item
          value="action-new-note"
          onSelect={handleNewNote}
          className={PALETTE_ITEM_CLASS}
        >
          <NotePencil className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate">{newNoteLabel}</span>
          <kbd className="text-muted-foreground ml-auto shrink-0 font-sans text-xs">
            {formatShortcutKeys("newNote")}
          </kbd>
        </CommandPrimitive.Item>
      ) : null}
      {showHelp ? (
        <CommandPrimitive.Item
          value="action-help"
          onSelect={handleHelp}
          className={PALETTE_ITEM_CLASS}
        >
          <BookOpen className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate">{helpLabel}</span>
          <kbd className="text-muted-foreground ml-auto shrink-0 font-sans text-xs">
            {formatShortcutKeys("help")}
          </kbd>
        </CommandPrimitive.Item>
      ) : null}
    </CommandPrimitive.Group>
  );

  const folderGroup = folderResults.length > 0 && (
    <PaletteFolderGroup
      folders={folderResults}
      withDivider={false}
      onSelect={handleSelectFolder}
    />
  );
  const pageGroupHasPadding =
    filteredOtherNotes.length > 0 ||
    settingResults.length > 0 ||
    (!isQueryEmpty && filteredRecentSessions.length > 0);
  const settingsGroup = settingResults.length > 0 && (
    <PaletteSettingsGroup
      results={settingResults}
      limit={settingsOnly ? undefined : PALETTE_SETTINGS_LIMIT}
      withDivider={!settingsOnly && filteredPages.length > 0}
      onSelect={handleSelectSetting}
      onShowAll={() => setFilter("settings")}
    />
  );
  const settingsLabel = t`Search settings`;
  const folderSearchLabel = t`Search in this folder...`;
  const searchLabel = settingsOnly
    ? settingsLabel
    : inFolder
      ? folderSearchLabel
      : t`Search notes and pages...`;
  const pageGroup = filteredPages.length > 0 && (
    <CommandPrimitive.Group
      className={pageGroupHasPadding ? "pb-1.5" : ""}
      heading={
        <div className="flex flex-col gap-3">
          {((isQueryEmpty && filteredRecentSessions.length > 0) ||
            (!isQueryEmpty && folderResults.length > 0)) && (
            <div className="bg-accent mx-2 h-px" />
          )}
          <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium tracking-wider uppercase">
            <Trans>Go to</Trans>
          </div>
        </div>
      }
    >
      {filteredPages.map((page) => (
        <CommandPrimitive.Item
          key={`page-${page.id}`}
          value={`page-${page.id}`}
          onSelect={() => handleSelectPage(page)}
          className={PALETTE_ITEM_CLASS}
        >
          <page.icon className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate">{page.label}</span>
          {page.hint ? (
            <span className="text-muted-foreground ml-auto shrink-0 text-xs">
              {page.hint}
            </span>
          ) : null}
        </CommandPrimitive.Item>
      ))}
    </CommandPrimitive.Group>
  );

  const folderView = inFolder && (
    <>
      {folderGroup}
      {filteredOtherNotes.length > 0 ? (
        <PaletteNoteGroup
          notes={filteredOtherNotes}
          heading={<Trans>In this folder</Trans>}
          withDivider={folderResults.length > 0}
          showFolder={false}
          onSelect={handleSelect}
        />
      ) : (
        <div className="text-muted-foreground px-3 py-4 text-center text-sm">
          <Trans>No notes in this folder match.</Trans>
        </div>
      )}
      <PaletteFolderActions
        query={query}
        withDivider
        onAsk={handleAskFolder}
        onNewNote={handleNewNoteInFolder}
      />
    </>
  );

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="bg-background/40 backdrop-blur-xs"
        overlayChildren={
          <div
            data-open-note-dialog-drag-region
            data-tauri-drag-region
            className="absolute top-0 right-0 left-0 h-[15%]"
          />
        }
        className={cn([
          "top-[15%] w-full max-w-lg -translate-y-0 gap-0 border-0 bg-transparent px-4 py-0 shadow-none sm:rounded-none",
          "data-[state=closed]:animate-none data-[state=open]:animate-none",
          "[&>button:last-child]:hidden",
        ])}
        style={{ marginLeft: mainContentCenterOffset }}
        onPointerDownOutside={preventCloseWhenOnDragRegion}
      >
        <DialogTitle className="sr-only">
          {settingsOnly || inFolder ? (
            searchLabel
          ) : (
            <Trans>Search notes and pages...</Trans>
          )}
        </DialogTitle>
        <div
          className={cn([
            "border-border bg-popover text-popover-foreground rounded-2xl border",
            "shadow-capsule overflow-hidden",
          ])}
        >
          <CommandPrimitive
            shouldFilter={false}
            value={selectedValue}
            onValueChange={setSelectedValue}
            className="flex flex-col"
          >
            <div className="border-border/60 flex items-center gap-3 border-b px-4 py-3">
              <MagnifyingGlass className="text-muted-foreground h-4 w-4 shrink-0" />
              {settingsOnly ? (
                <button
                  type="button"
                  aria-label={t`Remove the Settings filter`}
                  onClick={() => setFilter(null)}
                  className={cn([
                    "bg-accent text-accent-foreground flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
                  ])}
                >
                  <Trans>Settings</Trans>
                  <X aria-hidden className="h-3 w-3" />
                </button>
              ) : null}
              {folderFilter !== null ? (
                <PaletteFolderChip
                  folder={folderFilter}
                  onRemove={() => setFolderFilter(null)}
                />
              ) : null}
              <CommandPrimitive.Input
                ref={focusInput}
                value={query}
                onValueChange={setQuery}
                onKeyDown={handleInputKeyDown}
                aria-label={searchLabel}
                placeholder={searchLabel}
                className={cn([
                  "flex-1 bg-transparent text-sm",
                  "placeholder:text-muted-foreground outline-hidden",
                ])}
              />
              <button
                type="button"
                aria-label={t`Close`}
                onClick={() => handleOpenChange(false)}
                className={cn([
                  "h-5 w-5 rounded-full",
                  "flex items-center justify-center",
                  "bg-accent/80 hover:bg-accent/80",
                  "text-muted-foreground text-xs",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
                  "transition-colors",
                ])}
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <CommandPrimitive.List className="max-h-96 overflow-y-auto p-2">
              {settingsOnly ? (
                settingResults.length > 0 ? (
                  settingsGroup
                ) : (
                  <NoSettingMatches query={query} />
                )
              ) : inFolder ? (
                folderView
              ) : !hasAnyResults ? (
                <CommandPrimitive.Empty className="text-muted-foreground py-6 text-center text-sm">
                  <Trans>No results found.</Trans>
                </CommandPrimitive.Empty>
              ) : (
                <>
                  {folderGroup}
                  {actionGroup}
                  {isQueryEmpty ? null : pageGroup}
                  {settingsGroup}

                  {filteredRecentSessions.length > 0 && (
                    <PaletteNoteGroup
                      notes={filteredRecentSessions}
                      heading={<Trans>Recent</Trans>}
                      withDivider={false}
                      onSelect={handleSelect}
                    />
                  )}

                  {isQueryEmpty ? pageGroup : null}

                  {filteredOtherNotes.length > 0 && (
                    <PaletteNoteGroup
                      notes={filteredOtherNotes}
                      heading={
                        isQueryEmpty ? (
                          <Trans>All Notes</Trans>
                        ) : (
                          <Trans>Notes</Trans>
                        )
                      }
                      withDivider={
                        filteredPages.length > 0 ||
                        settingResults.length > 0 ||
                        filteredRecentSessions.length > 0 ||
                        folderResults.length > 0
                      }
                      onSelect={handleSelect}
                    />
                  )}

                  {contactResults.length > 0 && (
                    <PaletteContactGroup
                      contacts={contactResults}
                      withDivider
                      onSelect={handleSelectContact}
                    />
                  )}
                </>
              )}
            </CommandPrimitive.List>
            {settingsOnly || inFolder ? (
              <div className="border-border/60 text-muted-foreground flex gap-4 border-t px-4 py-2 text-xs">
                <span>
                  <kbd className="font-sans">↑↓</kbd> <Trans>Choose</Trans>
                </span>
                <span>
                  <kbd className="font-sans">
                    <Trans>Enter</Trans>
                  </kbd>{" "}
                  <Trans>Open</Trans>
                </span>
                {inFolder ? (
                  <span>
                    <kbd className="font-sans">
                      <Trans>Backspace</Trans>
                    </kbd>{" "}
                    <Trans>Leave the folder</Trans>
                  </span>
                ) : null}
                <span>
                  <kbd className="font-sans">
                    <Trans>Esc</Trans>
                  </kbd>{" "}
                  <Trans>Close</Trans>
                </span>
              </div>
            ) : null}
          </CommandPrimitive>
        </div>
      </DialogContent>
    </Dialog>
  );
}
