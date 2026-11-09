import { useLingui } from "@lingui/react/macro";
import type { EditorView } from "prosemirror-view";
import { forwardRef, useCallback, useMemo } from "react";

import { parseJsonContent } from "@syntheo/editor/markdown";
import {
  NoteEditor,
  type JSONContent,
  type NoteEditorRef,
  normalizePortableAttachmentUrls,
  type PlaceholderFunction,
} from "@syntheo/editor/note";
import { cn } from "@syntheo/utils";

import { AudioDropTarget } from "./audio-drop-target";
import { useNoteFileHandlerConfig } from "./file-handler";
import { MeetingChatHighlights } from "./meeting-chat-highlights";
import { MeetingScreenGallery } from "./meeting-screen-gallery";

import { AppLinkView } from "~/editor-bridge/app-link-view";
import { useMentionConfig } from "~/editor-bridge/mention-config";
import { openEditorLink } from "~/editor-bridge/open-editor-link";
import { sessionMentionDropConfig } from "~/editor-bridge/session-mention-drop";
import { SessionNodeView } from "~/editor-bridge/session-view";
import { useAttachmentResolver } from "~/session/hooks/useAttachmentResolver";
import { useUpdateSession } from "~/session/queries";
import { removeDocumentTitle } from "~/session/title-content";

const extraNodeViews = { appLink: AppLinkView, session: SessionNodeView };

export const RawEditor = forwardRef<
  NoteEditorRef,
  {
    sessionId: string;
    rawMd: string;
    sessionTitle: string;
    className?: string;
    onNavigateToTitle?: (pixelWidth?: number) => void;
    syncTasks?: boolean;
    showFormatToolbar?: boolean;
    // Document vivant : la fiche choisit le modèle, et la zone de notes
    // affiche sa propre consigne.
    placeholder?: string;
    // Sans effet : les suggestions de modèles de l'ancien mémo vide sont
    // retirées (la fiche choisit le modèle). Le document vivant le passe encore.
    showTemplateSuggestions?: boolean;
    onViewReady?: (view: EditorView) => void;
    onViewDisposed?: (view: EditorView) => void;
  }
>(
  (
    {
      sessionId,
      rawMd,
      sessionTitle,
      className,
      onNavigateToTitle,
      syncTasks = true,
      showFormatToolbar = true,
      placeholder,
      onViewReady,
      onViewDisposed,
    },
    ref,
  ) => {
    const { t } = useLingui();
    const updateSession = useUpdateSession(sessionId);
    const resolveAttachment = useAttachmentResolver(sessionId);
    const { audioDropTargetProps, fileHandlerConfig, isAudioDragActive } =
      useNoteFileHandlerConfig(sessionId);
    const initialContent = useMemo<JSONContent>(
      () => removeDocumentTitle(parseJsonContent(rawMd), sessionTitle),
      [rawMd, sessionTitle],
    );
    const handleChange = useCallback(
      (input: JSONContent) => {
        const portableInput = normalizePortableAttachmentUrls(input);
        void updateSession({ raw_md: JSON.stringify(portableInput) }).catch(
          (error) => {
            console.error("[raw-editor] failed to persist note", error);
          },
        );
      },
      [updateSession],
    );

    const mentionConfig = useMentionConfig();
    // Stable identity: NoteEditor keys whole-document memos off this.
    const taskSource = useMemo(
      () =>
        syncTasks
          ? ({ type: "session_raw_note", id: sessionId } as const)
          : undefined,
      [syncTasks, sessionId],
    );
    // La consigne ne s'affiche que dans un mémo vierge : sur une ligne vide
    // entre des notes, elle recouvrait le texte suivant (issue 430).
    const placeholderComponent = useMemo<PlaceholderFunction>(
      () =>
        ({ isEmptyDoc }) =>
          !isEmptyDoc ? "" : (placeholder ?? t`Start writing...`),
      [placeholder, t],
    );
    return (
      <AudioDropTarget
        targetProps={audioDropTargetProps}
        isActive={isAudioDragActive}
      >
        <>
          <div className="relative min-h-full">
            <NoteEditor
              ref={ref}
              className={cn(["session-note-editor", className])}
              key={`session-${sessionId}-raw`}
              initialContent={initialContent}
              resolveAttachment={resolveAttachment}
              handleChange={handleChange}
              placeholderComponent={placeholderComponent}
              scrollBottomInset={80}
              mentionConfig={mentionConfig}
              sessionMentionDropConfig={sessionMentionDropConfig}
              onNavigateToTitle={onNavigateToTitle}
              onLinkOpen={openEditorLink}
              fileHandlerConfig={fileHandlerConfig}
              taskSource={taskSource}
              extraNodeViews={extraNodeViews}
              showFormatToolbar={showFormatToolbar}
              enforceTitleHeading={false}
              onViewReady={onViewReady}
              onViewDisposed={onViewDisposed}
            />
          </div>
          <MeetingScreenGallery sessionId={sessionId} />
          <MeetingChatHighlights sessionId={sessionId} />
        </>
      </AudioDropTarget>
    );
  },
);
