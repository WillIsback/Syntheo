import { Trans } from "@lingui/react/macro";
import type { EditorView } from "prosemirror-view";
import { forwardRef } from "react";

import type { NoteEditorRef } from "@syntheo/editor/note";
import { Button } from "@syntheo/ui/components/ui/button";
import { defaultSummaryDocumentId } from "@syntheo/utils/session";

import { ConfigError } from "./config-error";
import { EnhancedEditor } from "./editor";
import { EnhanceError } from "./enhance-error";
import { StreamingView } from "./streaming";

import { useAITaskTask, useLLMConnectionStatus } from "~/ai/hooks";
import { getStoredNoteMarkdown } from "~/session/components/note-input/header-shared";
import { hasStoredNoteContent } from "~/session/components/shared";
import { SpeakerNamingBar } from "~/session/components/speaker-naming/bar";
import {
  isSummaryOff,
  shouldShowEmptySummaryConfigError,
} from "~/session/enhance-config";
import { useGenerateSummary } from "~/session/hooks/useGenerateSummary";
import { useEnhancedNote } from "~/session/queries";
import { useIntelligenceDisabled } from "~/settings/managed";
import { createTaskId } from "~/store/zustand/ai-task/task-configs";

export const Enhanced = forwardRef<
  NoteEditorRef,
  {
    sessionId: string;
    sessionTitle: string;
    enhancedNoteId: string;
    noteLines?: readonly string[];
    onNavigateToTitle?: (pixelWidth?: number) => void;
    onViewReady?: (view: EditorView) => void;
    onViewDisposed?: (view: EditorView) => void;
  }
>(
  (
    {
      sessionId,
      sessionTitle,
      enhancedNoteId,
      noteLines,
      onNavigateToTitle,
      onViewReady,
      onViewDisposed,
    },
    ref,
  ) => {
    const taskId = createTaskId(enhancedNoteId, "enhance");
    const llmStatus = useLLMConnectionStatus();
    const { status, error, streamedText } = useAITaskTask(taskId, "enhance");
    const enhancedNote = useEnhancedNote(enhancedNoteId);
    const content = enhancedNote?.content;

    const hasContent = hasStoredNoteContent(content);
    const isAwaitingPersistedContent =
      status === "success" && streamedText.trim().length > 0 && !hasContent;
    const showStreaming = status === "generating" || isAwaitingPersistedContent;
    const isConfigError = shouldShowEmptySummaryConfigError(llmStatus);
    const isOff = isSummaryOff(llmStatus);
    const managedOff = useIntelligenceDisabled().managed;

    if (status === "error") {
      return (
        <EnhanceError
          sessionId={sessionId}
          enhancedNoteId={enhancedNoteId}
          error={error}
        />
      );
    }

    if (!enhancedNote) {
      return showStreaming ? (
        <StreamingView
          sessionId={sessionId}
          sessionTitle={sessionTitle}
          enhancedNoteId={enhancedNoteId}
        />
      ) : enhancedNoteId === defaultSummaryDocumentId(sessionId) ? (
        isOff ? (
          <SummaryOff managed={managedOff} />
        ) : isConfigError ? (
          <ConfigError />
        ) : (
          <EmptySummary sessionId={sessionId} />
        )
      ) : null;
    }

    if (status === "idle" && isOff && !hasContent) {
      return <SummaryOff managed={managedOff} />;
    }

    if (status === "idle" && isConfigError && !hasContent) {
      return <ConfigError />;
    }

    if (showStreaming) {
      return (
        <StreamingView
          sessionId={sessionId}
          sessionTitle={sessionTitle}
          enhancedNoteId={enhancedNoteId}
        />
      );
    }

    return (
      <>
        <SpeakerNamingBar
          sessionId={sessionId}
          enhancedNoteId={enhancedNoteId}
          summaryMarkdown={getStoredNoteMarkdown(enhancedNote.content)}
        />
        <EnhancedEditor
          ref={ref}
          sessionId={sessionId}
          sessionTitle={sessionTitle}
          enhancedNoteId={enhancedNoteId}
          content={enhancedNote.content}
          noteLines={noteLines}
          notePassages={enhancedNote.notePassages ?? null}
          onNavigateToTitle={onNavigateToTitle}
          onViewReady={onViewReady}
          onViewDisposed={onViewDisposed}
        />
      </>
    );
  },
);

function EmptySummary({ sessionId }: { sessionId: string }) {
  const generate = useGenerateSummary(sessionId);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <Button onClick={() => generate.generate()} disabled={generate.pending}>
        <Trans>Generate summary</Trans>
      </Button>
      {generate.error && <p role="alert">{generate.error.message}</p>}
    </div>
  );
}

// Sous la seule copie d'app_settings (politique retirée), l'onglet reste
// neutre : ni message d'administration, ni bouton.
function SummaryOff({ managed }: { managed: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      {managed && (
        <p role="note" className="text-muted-foreground text-sm">
          <Trans>Set by your administrator.</Trans>
        </p>
      )}
    </div>
  );
}
