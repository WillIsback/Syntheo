import type { EditorView } from "prosemirror-view";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { parseJsonContent } from "@syntheo/editor/markdown";
import {
  NoteEditor,
  type JSONContent,
  type NoteEditorRef,
  normalizePortableAttachmentUrls,
} from "@syntheo/editor/note";
import { createDerivedInk } from "@syntheo/editor/plugins";

import { AudioDropTarget } from "../audio-drop-target";
import { useNoteFileHandlerConfig } from "../file-handler";

import { AppLinkView } from "~/editor-bridge/app-link-view";
import { useMentionConfig } from "~/editor-bridge/mention-config";
import { openEditorLink } from "~/editor-bridge/open-editor-link";
import { sessionMentionDropConfig } from "~/editor-bridge/session-mention-drop";
import { SessionNodeView } from "~/editor-bridge/session-view";
import {
  findNoteInkRanges,
  prepareNoteInk,
} from "~/session/components/living-document/note-ink";
import { hasStoredNoteContent } from "~/session/components/shared";
import { useAttachmentResolver } from "~/session/hooks/useAttachmentResolver";
import { useUpdateEnhancedNoteContent } from "~/session/queries";
import {
  ensureFirstLineTitle,
  extractFirstLineTitle,
  documentTitlePlaceholder,
} from "~/session/title-content";
import { repairMissingSessionTitle } from "~/session/title-repair";

const extraNodeViews = { appLink: AppLinkView, session: SessionNodeView };
const NO_NOTE_LINES: readonly string[] = [];

// Colore en user-ink ce qui, dans le compte rendu, vient des notes : phrases
// entières (issue 365), passages balisés par le modèle et validés, ou à
// défaut fragments venus des notes (issue 417). Simple décoration : le compte
// rendu enregistré, l'export et le copier-coller restent inchangés.
function useNoteInk(
  noteLines: readonly string[],
  notePassages: readonly string[] | null,
) {
  const notesKey = noteLines.join("\n");
  const passagesKey = notePassages === null ? "" : JSON.stringify(notePassages);
  const source = useMemo(
    () =>
      prepareNoteInk(
        notesKey ? notesKey.split("\n") : NO_NOTE_LINES,
        passagesKey ? (JSON.parse(passagesKey) as string[]) : null,
      ),
    [notesKey, passagesKey],
  );
  // Créée une fois (les plugins sont figés au montage de l'éditeur) ; les
  // notes suivantes passent par setData.
  const [ink] = useState(() =>
    createDerivedInk({
      className: "note-ink-user",
      data: source,
      compute: findNoteInkRanges,
    }),
  );
  const plugins = useMemo(() => [ink.plugin], [ink]);
  useEffect(() => {
    ink.setData(source);
  }, [ink, source]);
  return plugins;
}

function isCanonicalEmptyDocument(
  content: JSONContent,
  sessionTitle: string,
): boolean {
  const [title, body, ...rest] = content.content ?? [];
  const expectedTitle = sessionTitle.trim();
  const titleContent = title?.content ?? [];
  const titleAttrs = title?.attrs ?? {};
  const bodyAttrs = body?.attrs ?? {};
  const hasExpectedTitle = expectedTitle
    ? titleContent.length === 1 &&
      titleContent[0]?.type === "text" &&
      titleContent[0].text === expectedTitle &&
      !titleContent[0].marks?.length
    : titleContent.length === 0;
  return (
    content.type === "doc" &&
    rest.length === 0 &&
    title?.type === "heading" &&
    titleAttrs.level === 1 &&
    Object.keys(titleAttrs).length === 1 &&
    hasExpectedTitle &&
    body?.type === "paragraph" &&
    Object.keys(bodyAttrs).length === 0 &&
    !body.content?.length
  );
}

const EnhancedEditorInner = forwardRef<
  NoteEditorRef,
  {
    sessionId: string;
    sessionTitle: string;
    enhancedNoteId: string;
    content: string;
    contentOverride?: JSONContent;
    /** Lignes des notes brutes à colorer dans le compte rendu (vide : aucune). */
    noteLines?: readonly string[];
    /** Passages validés venus des notes (issue 417) ; null : repli. */
    notePassages?: readonly string[] | null;
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
      content,
      contentOverride,
      noteLines = NO_NOTE_LINES,
      notePassages = null,
      onNavigateToTitle,
      onViewReady,
      onViewDisposed,
    },
    ref,
  ) => {
    const { audioDropTargetProps, fileHandlerConfig, isAudioDragActive } =
      useNoteFileHandlerConfig(sessionId);
    const resolveAttachment = useAttachmentResolver(sessionId);
    const noteInkPlugins = useNoteInk(noteLines, notePassages);
    const updateContent = useUpdateEnhancedNoteContent(
      enhancedNoteId,
      sessionId,
    );

    const initialContent = useMemo<JSONContent>(
      () =>
        ensureFirstLineTitle(
          contentOverride ?? parseJsonContent(content),
          sessionTitle,
        ),
      [content, contentOverride, sessionTitle],
    );
    const persistChanges = contentOverride === undefined;
    const editorKey = persistChanges
      ? `enhanced-note-${enhancedNoteId}`
      : `enhanced-note-${enhancedNoteId}-preview`;

    const handleChange = useCallback(
      (input: JSONContent) => {
        const portableInput = normalizePortableAttachmentUrls(input);
        if (
          content === "" &&
          isCanonicalEmptyDocument(portableInput, sessionTitle)
        ) {
          return;
        }
        const title = extractFirstLineTitle(portableInput);
        const nextTitle =
          title !== null || hasStoredNoteContent(content)
            ? (title ?? "")
            : undefined;
        void updateContent(JSON.stringify(portableInput), nextTitle).catch(
          (error) => {
            console.error("[enhanced-editor] failed to persist summary", error);
          },
        );
      },
      [content, sessionTitle, updateContent],
    );

    const mentionConfig = useMentionConfig();
    // Stable identity: NoteEditor keys whole-document memos off this.
    const taskSource = useMemo(
      () =>
        persistChanges
          ? ({ type: "enhanced_note", id: enhancedNoteId } as const)
          : undefined,
      [persistChanges, enhancedNoteId],
    );

    return (
      <AudioDropTarget
        targetProps={audioDropTargetProps}
        isActive={isAudioDragActive}
      >
        <div className="relative min-h-full">
          <NoteEditor
            ref={ref}
            className="session-note-editor enhanced-summary-editor"
            key={editorKey}
            initialContent={initialContent}
            scrollBottomInset={80}
            resolveAttachment={resolveAttachment}
            handleChange={persistChanges ? handleChange : undefined}
            placeholderComponent={documentTitlePlaceholder}
            mentionConfig={mentionConfig}
            sessionMentionDropConfig={sessionMentionDropConfig}
            onNavigateToTitle={onNavigateToTitle}
            onLinkOpen={openEditorLink}
            fileHandlerConfig={fileHandlerConfig}
            taskSource={taskSource}
            extraNodeViews={extraNodeViews}
            extraPlugins={noteInkPlugins}
            onViewReady={(view) => {
              onViewReady?.(view);
              if (persistChanges && !sessionTitle.trim()) {
                void repairMissingSessionTitle(sessionId, enhancedNoteId).catch(
                  (error) => {
                    console.error(
                      "[enhanced-editor] failed to repair title",
                      error,
                    );
                  },
                );
              }
            }}
            onViewDisposed={onViewDisposed}
            syncContentWhenFocused={!persistChanges}
          />
        </div>
      </AudioDropTarget>
    );
  },
);

export const EnhancedEditor = memo(EnhancedEditorInner);
