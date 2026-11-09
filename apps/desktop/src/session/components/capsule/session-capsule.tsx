import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { toast } from "@syntheo/ui/components/ui/toast";
import { hasSummaryContent } from "@syntheo/utils/session";

import { CapsuleAutomationMenu } from "./automation-menu";
import { formatElapsed, NoteCapsule, type NoteStage } from "./index";
import { LevelMeter } from "./level-meter";
import { registerPreparedNoteStart } from "./start-shortcut";

import { useShell } from "~/contexts/shell";
import {
  copyTextToClipboard,
  getStoredNoteMarkdown,
} from "~/session/components/note-input/header-shared";
import { ExportModal } from "~/session/components/outer-header/overflow/export-modal";
import { useIsSessionEnhancing } from "~/session/hooks/useEnhancedNotes";
import { useGenerateSummary } from "~/session/hooks/useGenerateSummary";
import {
  useEnhancedNote,
  useEnhancedNoteRecords,
  useSession,
} from "~/session/queries";
import { showFinishListeningToExport } from "~/shared/export-shortcut";
import { leaveOverlayTab } from "~/shared/leave-overlay-tab";
import { registerShortcutAction } from "~/shared/shortcut-actions";
import { getShortcut, getShortcutPlatform } from "~/shared/shortcuts";
import { ignoreUnlessTyped } from "~/shared/typed-key";
import type { EditorView, Tab } from "~/store/zustand/tabs/schema";
import { setChannelMuted } from "~/stt/channel-mute";
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

// Un compte rendu existe s'il a du contenu, ou s'il est en cours d'écriture.
function useSummaryExists(sessionId: string, sessionTitle?: string) {
  const notes = useEnhancedNoteRecords(sessionId);
  const enhancing = useIsSessionEnhancing(sessionId);
  return (
    enhancing ||
    notes.some((note) => hasSummaryContent(note.content, sessionTitle))
  );
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
  const os = useMemo(() => getShortcutPlatform(), []);

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
  const speakerMuted = useListener((state) =>
    state.live.sessionId === sessionId ? state.live.speakerMuted : false,
  );
  // Issue 447 : chaque bascule coupe son canal sans relancer la session ; une
  // note détachée passe par la fenêtre principale.
  const toggleMic = useCallback(() => {
    setChannelMuted(sessionId, "mic", !muted);
  }, [muted, sessionId]);
  const toggleSpeaker = useCallback(() => {
    setChannelMuted(sessionId, "speaker", !speakerMuted);
  }, [sessionId, speakerMuted]);
  // Note détachée : pas de raccourcis globaux, on déclare ceux de l'écoute.
  const listeningInStandalone =
    standaloneWindow && tab.active && stage === "listen";
  useHotkeys(
    getShortcut("toggleMicrophone").hotkeys ?? "",
    toggleMic,
    {
      enabled: listeningInStandalone,
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      ignoreEventWhen: ignoreUnlessTyped(
        getShortcut("toggleMicrophone").typedKey,
      ),
    },
    [toggleMic],
  );
  useHotkeys(
    getShortcut("toggleSystemAudio").hotkeys ?? "",
    toggleSpeaker,
    {
      enabled: listeningInStandalone,
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [toggleSpeaker],
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

  // Ctrl+Maj+N lance l'écoute de cette note tant qu'elle est en préparation.
  const canStartFromShortcut = tab.active && stage === "prepare";
  useEffect(() => {
    if (!canStartFromShortcut || standaloneWindow) {
      return;
    }

    return registerPreparedNoteStart(start);
  }, [canStartFromShortcut, standaloneWindow, start]);
  // Les fenêtres de note autonomes n'ont pas les raccourcis globaux.
  useHotkeys(
    getShortcut("startListening").hotkeys ?? "",
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

  // Ctrl+P (issue 374) : la note active ouvre « Exporter ou imprimer » en
  // Préparer et en Synthèse ; pendant l'écoute, un message. Fenêtre de note
  // autonome : même raccourci, déclaré localement.
  const exportFromShortcut =
    stage === "listen" ? showFinishListeningToExport : openExport;
  useEffect(() => {
    if (!tab.active || standaloneWindow) {
      return;
    }

    return registerShortcutAction("exportNote", exportFromShortcut);
  }, [exportFromShortcut, standaloneWindow, tab.active]);
  useHotkeys(
    getShortcut("exportNote").hotkeys ?? "",
    exportFromShortcut,
    {
      enabled: tab.active && standaloneWindow,
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [exportFromShortcut],
  );

  // Note sans compte rendu (par exemple après avoir quitté l'application
  // pendant une pause) : reprendre l'écoute ou générer le compte rendu. Le
  // choix porte sur l'existence d'un compte rendu, pas sur l'onglet affiché :
  // une note transcrite sans compte rendu affiche déjà l'onglet vide du compte
  // rendu par défaut.
  const summary = useGenerateSummary(sessionId);
  const summaryExists = useSummaryExists(sessionId, session?.title);
  const withoutSummary = stage === "synthesis" && !summaryExists;
  const generateSummary = useCallback(() => {
    summary.generate(undefined, {
      onError: (error) => toast.error(error.message),
    });
  }, [summary]);

  // « Demander à la note » réutilise le chat existant (Ctrl+J).
  const ask = useCallback(() => {
    chat.sendEvent({ type: "OPEN" });
  }, [chat]);

  return (
    <>
      <NoteCapsule
        stage={stage}
        os={os}
        automations={
          stage === "synthesis" ? (
            <CapsuleAutomationMenu sessionId={sessionId} />
          ) : undefined
        }
        listening={{
          elapsed: <SessionElapsed sessionId={sessionId} />,
          meter: (
            <SessionLevelMeter
              sessionId={sessionId}
              muted={muted && speakerMuted}
            />
          ),
          muted,
          speakerMuted,
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
          onToggleMic: toggleMic,
          onToggleSpeaker: toggleSpeaker,
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
