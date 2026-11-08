import { useMemo } from "react";

import { computeCurrentNoteTab } from "@syntheo/utils/session";

import { extractPlainText } from "~/search/contexts/engine/utils";
import { useEnhancedNotes } from "~/session/hooks/useEnhancedNotes";
import {
  useEnhancedNote,
  useSession,
  useSessionHasTranscript,
} from "~/session/queries";
import type { SessionMode } from "~/store/zustand/listener/general";
import type { Tab } from "~/store/zustand/tabs/schema";
import { type EditorView } from "~/store/zustand/tabs/schema";
import { useListener } from "~/stt/contexts";

// Notes partagées retirées (cloud) : liste toujours vide, référence stable.
const NO_SHARED_NOTE_IDS: string[] = [];

export function useHasTranscript(sessionId: string): boolean {
  return useSessionHasTranscript(sessionId);
}

export function hasStoredNoteContent(value: unknown): boolean {
  return extractPlainText(value).trim().length > 0;
}

export function useCurrentNoteHasContent(
  sessionId: string,
  currentView: EditorView,
): boolean {
  const hasTranscript = useHasTranscript(sessionId);
  const rawMd = useSession(sessionId)?.raw_md;
  const enhancedNoteId = currentView.type === "enhanced" ? currentView.id : "";
  const enhancedContent = useEnhancedNote(enhancedNoteId)?.content;

  if (currentView.type === "enhanced") {
    return hasStoredNoteContent(enhancedContent);
  }

  if (currentView.type === "transcript") {
    return hasTranscript;
  }

  return hasStoredNoteContent(rawMd);
}

export function useCurrentNoteTab(
  tab: Extract<Tab, { type: "sessions" }>,
  options: { audioExists?: boolean } = {},
): EditorView {
  return useSessionNoteView(tab.id, tab.state.view ?? null, options);
}

// Vue affichée pour une note, même quand elle n'est pas ouverte dans un
// onglet (`view` nul : vue par défaut, comme à l'ouverture de la note).
export function useSessionNoteView(
  sessionId: string,
  view: EditorView | null = null,
  { audioExists = false }: { audioExists?: boolean } = {},
): EditorView {
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const isLiveSessionActive = sessionMode === "active";
  const canShowTranscript = useCanShowTranscript(sessionId, { audioExists });

  const hasTranscript = useHasTranscript(sessionId);
  const enhancedNoteIds = useEnhancedNotes(
    sessionId,
    hasTranscript && sessionMode === "inactive",
  );

  const sharedNoteIds = NO_SHARED_NOTE_IDS;

  return useMemo(() => {
    return computeCurrentNoteTab(
      view,
      isLiveSessionActive,
      enhancedNoteIds,
      canShowTranscript,
      sharedNoteIds,
    );
  }, [
    view,
    isLiveSessionActive,
    enhancedNoteIds,
    canShowTranscript,
    sharedNoteIds,
  ]);
}

export function useCanShowTranscript(
  sessionId: string,
  { audioExists = false }: { audioExists?: boolean } = {},
): boolean {
  const hasTranscript = useHasTranscript(sessionId);
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const batchError = useListener((state) => state.batch[sessionId]?.error);
  const hasLiveSegments = useListener(
    (state) =>
      state.live.sessionId === sessionId && state.liveSegments.length > 0,
  );

  return getCanShowTranscript({
    audioExists,
    batchError: Boolean(batchError),
    hasLiveSegments,
    hasTranscript,
    sessionMode,
  });
}

export function getCanShowTranscript({
  audioExists = false,
  batchError = false,
  hasLiveSegments = false,
  hasTranscript,
  sessionMode,
}: {
  audioExists?: boolean;
  batchError?: boolean;
  hasLiveSegments?: boolean;
  hasTranscript: boolean;
  sessionMode: SessionMode;
}): boolean {
  const isLiveCapture =
    sessionMode === "active" || sessionMode === "finalizing";

  return (
    hasTranscript ||
    (audioExists && !isLiveCapture) ||
    isLiveCapture ||
    hasLiveSegments ||
    sessionMode === "running_batch" ||
    Boolean(batchError)
  );
}

export function RecordingIcon() {
  return (
    <span className="relative flex size-3 items-center justify-center">
      <span className="bg-recording/40 absolute size-2.5 animate-ping rounded-full" />
      <span className="bg-recording relative size-2 rounded-full" />
    </span>
  );
}
