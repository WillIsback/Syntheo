import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useRef } from "react";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import { ArrowLeft } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@syntheo/ui/components/ui/dropdown-menu";
import { cn } from "@syntheo/utils";

import { hasViewNavigation } from "./view-navigation";
import { WindowsWindowControls } from "./windows-window-controls";

import { documentationUrl } from "~/shared/documentation";
import { exportNoteFromShortcut } from "~/shared/export-shortcut";
import { openHelpDialog } from "~/shared/help-dialog";
import {
  goBackToSettings,
  goHome,
  settingsReturnSection,
} from "~/shared/leave-overlay-tab";
import { openNoteDialog, openSettingsSearch } from "~/shared/open-note-dialog";
import {
  ariaShortcut,
  formatShortcut,
  type ShortcutId,
  shortcutTooltip,
} from "~/shared/shortcuts";
import { useNewNote } from "~/shared/useNewNote";
import {
  TITLE_BAR_FIRST_MENU_ATTRIBUTE,
  toggleFullscreen,
} from "~/shared/window-shortcuts";
import { TITLE_BAR_SIDEBAR_ACTIONS_SLOT_ID } from "~/sidebar/custom-sidebar-header";
import { useTabs } from "~/store/zustand/tabs";

const appWindow = getCurrentWindow();

// Barre de titre Windows / Linux : barre de menus (Fichier, Modifier, Afficher,
// Aide), zone de déplacement de la fenêtre et contrôles natifs. Il n'y a plus
// de barre latérale à afficher ou masquer.
export function WindowsTitleBar() {
  // `t` de @lingui/core/macro lit la langue au rendu : s'abonner au changement de
  // langue pour se redessiner aussitôt, sous-composants compris (issue 558).
  useLingui();
  const currentTab = useTabs((state) => state.currentTab);
  const openNew = useTabs((state) => state.openNew);
  const createNewNote = useNewNote();
  const showViewActionsSlot = hasViewNavigation(currentTab);
  const showHomeButton = currentTab?.type !== "onboarding";
  const isHome = currentTab === null || currentTab.type === "empty";
  // Modèles, Calendrier, Dossiers, Contacts, Automatisations ouverts depuis
  // les Paramètres : le retour ramène à la section d'origine (issue 443).
  const fromSettings = settingsReturnSection(currentTab) !== null;
  // « Exporter… » : grisé hors d'une note (issue 374).
  const isNote = currentTab?.type === "sessions";
  const editTargetRef = useRef<HTMLElement | null>(null);

  const rememberEditTarget = useCallback(() => {
    editTargetRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }, []);
  const runEditCommand = useCallback((command: string) => {
    const editTarget = editTargetRef.current;
    if (editTarget?.isConnected) {
      editTarget.focus();
    }

    document.execCommand(command);
  }, []);
  return (
    <header
      data-tauri-drag-region
      data-testid="windows-title-bar"
      className="bg-background flex h-10 shrink-0 items-stretch"
    >
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center pl-2"
      >
        {fromSettings ? (
          <TitleBarSettingsButton />
        ) : showHomeButton ? (
          <TitleBarHomeButton isHome={isHome} />
        ) : null}
        {showViewActionsSlot ? (
          <div
            id={TITLE_BAR_SIDEBAR_ACTIONS_SLOT_ID}
            data-tauri-drag-region="false"
            className="flex items-center"
          />
        ) : null}
        <nav
          aria-label={t`Application menu`}
          className="ml-2 flex h-full items-center"
          role="menubar"
        >
          <TitleBarMenu
            label={t`File`}
            onPointerDown={rememberEditTarget}
            firstMenu
          >
            <ShortcutMenuItem shortcut="newNote" onSelect={createNewNote}>
              {t`New Note`}
            </ShortcutMenuItem>
            <ShortcutMenuItem shortcut="searchNotes" onSelect={openNoteDialog}>
              {t`Search Notes…`}
            </ShortcutMenuItem>
            <ShortcutMenuItem
              shortcut="searchSettings"
              onSelect={openSettingsSearch}
            >
              {t`Search for a Setting…`}
            </ShortcutMenuItem>
            <DropdownMenuSeparator />
            <ShortcutMenuItem
              shortcut="exportNote"
              onSelect={exportNoteFromShortcut}
              disabled={!isNote}
            >
              {t`Export…`}
            </ShortcutMenuItem>
            <DropdownMenuSeparator />
            <ShortcutMenuItem
              shortcut="settings"
              onSelect={() =>
                openNew({ type: "settings", state: { tab: "app" } })
              }
            >
              {t`Settings`}
            </ShortcutMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void appWindow.close()}>
              {t`Close`}
              <DropdownMenuShortcut>Alt+F4</DropdownMenuShortcut>
            </DropdownMenuItem>
          </TitleBarMenu>
          <TitleBarMenu label={t`Edit`} onPointerDown={rememberEditTarget}>
            <DropdownMenuItem onSelect={() => runEditCommand("undo")}>
              {t`Undo`}
              <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runEditCommand("redo")}>
              {t`Redo`}
              <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => runEditCommand("cut")}>
              {t`Cut`}
              <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runEditCommand("copy")}>
              {t`Copy`}
              <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runEditCommand("paste")}>
              {t`Paste`}
              <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runEditCommand("selectAll")}>
              {t`Select All`}
              <DropdownMenuShortcut>Ctrl+A</DropdownMenuShortcut>
            </DropdownMenuItem>
          </TitleBarMenu>
          <TitleBarMenu label={t`View`} onPointerDown={rememberEditTarget}>
            <ShortcutMenuItem
              shortcut="fullScreen"
              onSelect={() => void toggleFullscreen()}
            >
              {t`Full Screen`}
            </ShortcutMenuItem>
          </TitleBarMenu>
          <TitleBarMenu label={t`Help`} onPointerDown={rememberEditTarget}>
            <ShortcutMenuItem shortcut="help" onSelect={openHelpDialog}>
              {t`Help and shortcuts`}
            </ShortcutMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void openerCommands
                  .openUrl(documentationUrl(i18n.locale), null)
                  .catch((error) =>
                    console.error(
                      "[title-bar] failed to open documentation",
                      error,
                    ),
                  )
              }
            >
              {t`Documentation`}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                void openerCommands
                  .openUrl("https://github.com/WillIsback/Syntheo/issues", null)
                  .catch((error) =>
                    console.error(
                      "[title-bar] failed to open issue tracker",
                      error,
                    ),
                  )
              }
            >
              {t`Report a Bug`}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void openerCommands
                  .openUrl("https://github.com/WillIsback/Syntheo/issues", null)
                  .catch((error) =>
                    console.error(
                      "[title-bar] failed to open issue tracker",
                      error,
                    ),
                  )
              }
            >
              {t`Suggest a Feature`}
            </DropdownMenuItem>
          </TitleBarMenu>
        </nav>
        <div data-tauri-drag-region className="min-w-4 flex-1" />
      </div>
      <WindowsWindowControls />
    </header>
  );
}

// Entrée de menu dont le raccourci vient de la table unique.
function ShortcutMenuItem({
  children,
  onSelect,
  shortcut,
  disabled,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  shortcut: ShortcutId;
  disabled?: boolean;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      disabled={disabled}
      aria-keyshortcuts={ariaShortcut(shortcut)}
      className="whitespace-nowrap"
    >
      {children}
      <DropdownMenuShortcut>{formatShortcut(shortcut)}</DropdownMenuShortcut>
    </DropdownMenuItem>
  );
}

function TitleBarMenu({
  children,
  label,
  onPointerDown,
  firstMenu = false,
}: {
  children: React.ReactNode;
  label: string;
  onPointerDown: () => void;
  // Menu « Fichier » : cible de F10.
  firstMenu?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-tauri-drag-region="false"
          role="menuitem"
          {...(firstMenu ? { [TITLE_BAR_FIRST_MENU_ATTRIBUTE]: "" } : {})}
          className={cn([
            "text-muted-foreground h-7 rounded-md px-2.5 text-sm",
            "hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
          ])}
          onPointerDown={onPointerDown}
        >
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={1}
        className="w-72 rounded-lg"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Bouton « Accueil » toujours au même endroit, en haut à gauche, comme le
// retour des apps Windows (issue 315). Discret (ghost) : le seul bouton
// primary de l'écran reste celui de l'accueil ou la capsule. Sur l'accueil,
// il reste en place mais désactivé, pour que les menus ne bougent pas.
function TitleBarHomeButton({ isHome }: { isHome: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={shortcutTooltip(t`Home`, "home")}
      aria-keyshortcuts={`${ariaShortcut("home")} ${ariaShortcut("back")}`}
      aria-current={isHome ? "page" : undefined}
      disabled={isHome}
      data-tauri-drag-region="false"
      className={cn([
        "text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2.5 text-sm",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
      ])}
      onClick={goHome}
    >
      <ArrowLeft size={16} aria-hidden />
      {t`Home`}
    </Button>
  );
}

// « ← Paramètres » (issue 443) : à la place de « ← Accueil », même style, sur
// les écrans ouverts depuis une entrée des Paramètres. Échap et Alt+← y
// ramènent aussi.
function TitleBarSettingsButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={shortcutTooltip(t`Back to Settings`, "back")}
      aria-keyshortcuts={`${ariaShortcut("back")} ${ariaShortcut("home")}`}
      data-tauri-drag-region="false"
      className={cn([
        "text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2.5 text-sm",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
      ])}
      onClick={goBackToSettings}
    >
      <ArrowLeft size={16} aria-hidden />
      {t`Settings`}
    </Button>
  );
}
