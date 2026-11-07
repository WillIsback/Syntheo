import { useLingui } from "@lingui/react/macro";
import { platform } from "@tauri-apps/plugin-os";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { toast } from "@syntheo/ui/components/ui/toast";

import { formatElapsed, NoteCapsule, type NoteStage } from "./index";
import { LevelMeter } from "./level-meter";
import { registerPreparedNoteStart } from "./start-shortcut";

import { useShell } from "~/contexts/shell";
import {
  copyTextToClipboard,
  getStoredNoteMarkdown,
} from "~/session/components/note-input/header-shared";
import { ExportModal } from "~/session/components/outer-header/overflow/export-modal";
import { useGenerateSummary } from "~/session/hooks/useGenerateSummary";
import { useEnhancedNote, useSession } from "~/session/queries";
import { leaveOverlayTab } from "~/shared/leave-overlay-tab";
import type { EditorView, Tab } from "~/store/zustand/tabs/schema";
import { useListener } from "~/stt/contexts";
import { useLiveAmplitude, useLiveSeconds } from "~/stt/live-meters";
import { finishPausedListening } from "~/stt/pause-listening";
import { useStartListening } from "~/stt/useStartListening";
import {
  isMainWebviewWindow,
  requestMainListenerControl,
} from "~/stt/window-control";

function SessionElapsed({ sessionId }: { sessionId: string }) {
  return formatElapsed(useLiveSeconds(sessionId));
}

function SessionLevelMeter({
  sessionId,
  muted,
}: {
  sessionId: string;
  muted: boolean;
}) {
  return <LevelMeter amplitude={useLiveAmplitude(sessionId)} muted={muted} />;
}

function getPrimaryModifierLabel() {
  try {
    return platform() === "macos" ? "⌘" : "Ctrl";
  } catch {
    return "Ctrl";
  }
}

export function SessionCapsule({
  tab,
  stage,
  currentView,
  standaloneWindow = false,
}: {
  tab: Extract<Tab, { type: "sessions" }>;
  stage: NoteStage;
  currentView: EditorView;
  standaloneWindow?: boolean;
}) {
  const { t } = useLingui();
  const sessionId = tab.id;
  const { chat } = useShell();
  const modifierLabel = useMemo(() => getPrimaryModifierLabel(), []);

  const startListening = useStartListening(sessionId);
  const stopListening = useListener((state) => state.stop);
  const pauseListening = useListener((state) => state.pause);
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const pausePhase = useListener((state) =>
    state.live.pause?.sessionId === sessionId ? state.live.pause.phase : null,
  );
  const resuming = useListener(
    (state) =>
      pausePhase === "paused" &&
      state.live.sessionId === sessionId &&
      state.live.loading,
  );
  // Le chrono et le vumètre s'abonnent eux-mêmes (voir plus bas) : la
  // capsule ne se redessine pas à chaque seconde ni à chaque niveau sonore.
  const muted = useListener((state) =>
    state.live.sessionId === sessionId ? state.live.muted : false,
  );

  const start = useCallback(() => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl("start", sessionId);
      return;
    }

    void startListening();
  }, [sessionId, startListening]);

  const stop = useCallback(() => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl(
        pausePhase === "paused" ? "finish" : "stop",
        sessionId,
      );
      return;
    }

    // « Terminer » pendant la pause : pas de nouvelle capture, la synthèse part.
    if (pausePhase === "paused") {
      void finishPausedListening(sessionId);
      return;
    }
    stopListening();
  }, [pausePhase, sessionId, stopListening]);

  const pause = useCallback(() => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl("pause", sessionId);
      return;
    }

    pauseListening();
  }, [pauseListening, sessionId]);

  const resume = useCallback(() => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl("resume", sessionId);
      return;
    }

    void startListening();
  }, [sessionId, startListening]);

  // Ctrl ⇧ N lance l'écoute de cette note tant qu'elle est en préparation.
  const canStartFromShortcut = tab.active && stage === "prepare";
  useEffect(() => {
    if (!canStartFromShortcut || standaloneWindow) {
      return;
    }

    return registerPreparedNoteStart(start);
  }, [canStartFromShortcut, standaloneWindow, start]);
  // Les fenêtres de note autonomes n'ont pas les raccourcis globaux.
  useHotkeys(
    "mod+shift+n",
    start,
    {
      enabled: canStartFromShortcut && standaloneWindow,
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [start],
  );

  const session = useSession(sessionId);
  const enhancedNoteId = currentView.type === "enhanced" ? currentView.id : "";
  const enhancedContent = useEnhancedNote(enhancedNoteId)?.content;
  const markdown = useMemo(
    () =>
      getStoredNoteMarkdown(
        currentView.type === "enhanced" ? enhancedContent : session?.raw_md,
      ),
    [currentView.type, enhancedContent, session?.raw_md],
  );
  const copy = useCallback(() => {
    void copyTextToClipboard(markdown, {
      success: t`Note copied to clipboard`,
      error: t`Failed to copy the note`,
    });
  }, [markdown, t]);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportMounted, setExportMounted] = useState(false);
  const openExport = useCallback(() => {
    setExportMounted(true);
    requestAnimationFrame(() => setExportOpen(true));
  }, []);

  // Note sans compte rendu (par exemple après avoir quitté l'application
  // pendant une pause) : reprendre l'écoute ou générer le compte rendu.
  const summary = useGenerateSummary(sessionId);
  const withoutSummary =
    stage === "synthesis" && currentView.type !== "enhanced";
  const generateSummary = useCallback(() => {
    summary.generate(undefined, {
      onError: (error) => toast.error(error.message),
    });
  }, [summary]);

  // « Demander à la note » réutilise le chat existant (Ctrl J).
  const ask = useCallback(() => {
    chat.sendEvent({ type: "OPEN" });
  }, [chat]);

  return (
    <>
      <NoteCapsule
        stage={stage}
        modifierLabel={modifierLabel}
        listening={{
          elapsed: <SessionElapsed sessionId={sessionId} />,
          meter: <SessionLevelMeter sessionId={sessionId} muted={muted} />,
          muted,
          finalizing: sessionMode === "finalizing",
          paused: pausePhase === "paused",
          pausing: pausePhase === "pausing",
          resuming,
        }}
        actions={{
          onCancel: standaloneWindow ? undefined : leaveOverlayTab,
          onStart: start,
          onStop: stop,
          onPause: pause,
          onResume: resume,
          onResumeListening: withoutSummary ? resume : undefined,
          onGenerateSummary: withoutSummary ? generateSummary : undefined,
          generateSummaryDisabled: summary.pending,
          onCopy: copy,
          copyDisabled: markdown.length === 0,
          onExport: openExport,
          onAsk: ask,
        }}
      />
      {exportMounted ? (
        <ExportModal
          sessionId={sessionId}
          currentView={currentView}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      ) : null}
    </>
  );
}
