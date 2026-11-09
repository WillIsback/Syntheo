import React, { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import {
  getLivingDocumentView,
  getLivingDocumentViews,
  getNoteStage,
} from "./components/capsule/stage";
import { FloatingActionButton } from "./components/floating";
import { NoteConflictBanner } from "./components/note-conflict-banner";
import { NoteInput, type NoteInputHandle } from "./components/note-input";
import { SearchProvider } from "./components/note-input/search/context";
import { OuterHeader } from "./components/outer-header";
import { PendingProposalsBanner } from "./components/pending-proposals-banner";
import { SessionSurface } from "./components/session-surface";
import { useHasTranscript } from "./components/shared";
import { useAutoEnhance } from "./hooks/useAutoEnhance";
import { useEnhancedNotes } from "./hooks/useEnhancedNotes";

import { PerfZone } from "~/devtools-bar/perf-zone";
import { isLockedFlag } from "~/lock/flag";
import { revealLockedNote } from "~/lock/notes";
import { NoteLockScreen } from "~/lock/screen";
import { useAppLock } from "~/lock/store";
import {
  isCanonicalSessionImportLocked,
  subscribeCanonicalSessionImportLocks,
} from "~/session/editor-activity";
import { useSession } from "~/session/queries";
import { registerShortcutAction } from "~/shared/shortcut-actions";
import { isListeningPaused } from "~/store/zustand/listener/general-shared";
import { type Tab, useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";
import { SessionAutoStart } from "~/stt/session-auto-start";

export function TabContentNote({
  standaloneWindow = false,
  tab,
}: {
  standaloneWindow?: boolean;
  tab: Extract<Tab, { type: "sessions" }>;
}) {
  const importLocked = React.useSyncExternalStore(
    subscribeCanonicalSessionImportLocks,
    () => isCanonicalSessionImportLocked(tab.id),
    () => isCanonicalSessionImportLocked(tab.id),
  );

  if (importLocked) return <SessionContentLoading />;

  return <LockedNoteGate tab={tab} standaloneWindow={standaloneWindow} />;
}

function LockedNoteGate({
  standaloneWindow,
  tab,
}: {
  standaloneWindow: boolean;
  tab: Extract<Tab, { type: "sessions" }>;
}) {
  const session = useSession(tab.id);
  const locked = isLockedFlag(session?.locked);
  const revealed = useAppLock((state) =>
    Boolean(state.revealedNoteIds[tab.id]),
  );
  const authenticating = useAppLock((state) => state.authenticating);
  const lockOverlay =
    session && locked && !revealed ? (
      <NoteLockScreen
        sessionTitle={session.title}
        authenticating={authenticating}
        onUnlock={() => {
          void revealLockedNote(tab.id);
        }}
      />
    ) : null;

  return (
    <UnlockedTabContentNote
      tab={tab}
      standaloneWindow={standaloneWindow}
      lockOverlay={lockOverlay}
    />
  );
}

function UnlockedTabContentNote({
  standaloneWindow,
  tab,
  lockOverlay,
}: {
  standaloneWindow: boolean;
  tab: Extract<Tab, { type: "sessions" }>;
  lockOverlay: React.ReactNode;
}) {
  // Syntheo ne conserve jamais l'audio : ni lecteur ni fichier à relire.
  return (
    <>
      {tab.state.autoStart && !standaloneWindow ? (
        // Stay mounted under the lock overlay so a locked session can clear
        // autoStart instead of blocking a later automatic start.
        <SessionAutoStart sessionId={tab.id} />
      ) : null}
      <SearchProvider>
        <TabContentNoteInner
          tab={tab}
          standaloneWindow={standaloneWindow}
          lockOverlay={lockOverlay}
        />
      </SearchProvider>
    </>
  );
}

function TabContentNoteInner({
  tab,
  standaloneWindow,
  lockOverlay,
}: {
  tab: Extract<Tab, { type: "sessions" }>;
  standaloneWindow: boolean;
  lockOverlay: React.ReactNode;
}) {
  const noteInputRef = React.useRef<NoteInputHandle>(null);

  const sessionId = tab.id;
  const [editingTranscriptSessionId, setEditingTranscriptSessionId] =
    React.useState<string | null>(null);
  const transcriptEditMode = editingTranscriptSessionId === sessionId;

  const hasTranscript = useHasTranscript(sessionId);
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const paused = useListener((state) =>
    isListeningPaused(state.live, sessionId),
  );
  const enhancedNoteIds = useEnhancedNotes(
    sessionId,
    hasTranscript && sessionMode === "inactive",
  );
  const session = useSession(sessionId);
  const updateSessionTabState = useTabs((state) => state.updateSessionTabState);

  // Garde l'auto-génération du compte-rendu active pour cette note.
  useAutoEnhance(tab);
  // Préparer → Écouter → Synthèse, dans le même écran (document vivant).
  const stage = getNoteStage({
    sessionMode,
    paused,
    hasTranscript,
    hasEnhancedNotes: enhancedNoteIds.length > 0,
  });
  const editorTabs = React.useMemo(
    () => getLivingDocumentViews(enhancedNoteIds),
    [enhancedNoteIds],
  );
  const currentView = React.useMemo(
    () => getLivingDocumentView(stage, tab.state.view, enhancedNoteIds),
    [stage, tab.state.view, enhancedNoteIds],
  );
  useAutoFocusEditor({
    sessionId,
    noteInputRef,
    enabled: !lockOverlay,
  });

  const handleTabChange = React.useCallback(
    (view: typeof currentView) => {
      if (view.type !== "transcript") {
        blurActiveTranscriptEditor();
        setEditingTranscriptSessionId(null);
      }
      noteInputRef.current?.prepareForTabChange();
      updateSessionTabState(tab, { ...tab.state, view });
    },
    [tab, updateSessionTabState],
  );
  const handleTranscriptEditModeChange = React.useCallback(
    (editMode: boolean) => {
      if (!editMode) {
        blurActiveTranscriptEditor();
      }
      setEditingTranscriptSessionId(editMode ? sessionId : null);
    },
    [sessionId],
  );

  // Ctrl+S et Échap sortent de l'édition de la transcription. Dans la fenêtre
  // principale, Ctrl+S est un raccourci global (« Vos notes sont enregistrées
  // automatiquement. ») : la note en édition prend la main par le registre.
  const exitTranscriptEditEnabled =
    tab.active && !lockOverlay && transcriptEditMode;
  useEffect(() => {
    if (!exitTranscriptEditEnabled || standaloneWindow) {
      return;
    }

    return registerShortcutAction("save", () =>
      handleTranscriptEditModeChange(false),
    );
  }, [
    exitTranscriptEditEnabled,
    handleTranscriptEditModeChange,
    standaloneWindow,
  ]);
  useHotkeys(
    standaloneWindow ? "mod+s, escape" : "escape",
    () => handleTranscriptEditModeChange(false),
    {
      enabled: exitTranscriptEditEnabled,
      enableOnContentEditable: true,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [handleTranscriptEditModeChange],
  );
  return (
    <>
      <SessionSurface
        overlay={lockOverlay}
        header={
          lockOverlay ? undefined : (
            <PerfZone id="session-header">
              <OuterHeader
                sessionId={sessionId}
                currentView={currentView}
                tab={tab}
                standaloneWindow={standaloneWindow}
              />
            </PerfZone>
          )
        }
        floatingButton={
          lockOverlay ? undefined : (
            <FloatingActionButton
              currentView={currentView}
              stage={stage}
              standaloneWindow={standaloneWindow}
              tab={tab}
            />
          )
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          {!lockOverlay ? (
            <>
              <NoteConflictBanner sessionId={sessionId} />
              <PendingProposalsBanner sessionId={sessionId} />
            </>
          ) : null}
          <div className="min-h-0 flex-1">
            {session ? (
              <NoteInput
                ref={noteInputRef}
                tab={tab}
                rawMd={session.raw_md}
                sessionTitle={session.title}
                editorTabs={editorTabs}
                currentTab={currentView}
                handleTabChange={handleTabChange}
                sessionMode={sessionMode}
                transcriptEditMode={transcriptEditMode}
                onTranscriptEditModeChange={handleTranscriptEditModeChange}
                hideHeader
                stage={stage}
              />
            ) : (
              <SessionContentLoading />
            )}
          </div>
        </div>
      </SessionSurface>
    </>
  );
}

function blurActiveTranscriptEditor() {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    activeElement.matches("[data-transcript-editor]")
  ) {
    activeElement.blur();
  }
}

function SessionContentLoading() {
  return (
    <div className="flex h-full flex-col gap-3 px-4 py-5">
      <div className="bg-muted h-5 w-3/5 animate-pulse rounded-md" />
      <div className="bg-muted/80 h-4 w-4/5 animate-pulse rounded-md" />
      <div className="bg-muted/70 h-4 w-2/3 animate-pulse rounded-md" />
    </div>
  );
}

function useAutoFocusEditor({
  sessionId,
  noteInputRef,
  enabled = true,
}: {
  sessionId: string;
  noteInputRef: React.RefObject<NoteInputHandle | null>;
  enabled?: boolean;
}) {
  const autoFocusedSessionRef = useRef<string | null>(null);
  const sessionReady = useSession(sessionId) != null;

  useEffect(() => {
    if (!enabled || !sessionReady) return;
    if (autoFocusedSessionRef.current === sessionId) return;

    autoFocusedSessionRef.current = sessionId;
    const frame = requestAnimationFrame(() => {
      noteInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, noteInputRef, sessionId, sessionReady]);
}
