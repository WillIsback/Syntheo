import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "../styles/prosemirror.css";

import { ProseMirror, ProseMirrorDoc } from "@handlewithcare/react-prosemirror";
import { Node as PMNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useDebounceCallback } from "usehooks-ts";

import { cn } from "@syntheo/utils";

import { EditorErrorBoundary } from "../editor-error-boundary";
import {
  AttachmentEditingContext,
  AttachmentResolverContext,
} from "../node-views";
import {
  type FileHandlerConfig,
  type PlaceholderFunction,
  ensureImageTrailingParagraphs,
  type PersistentPlaceholderFunction,
} from "../plugins";
import { useTaskStorageOptional } from "../task-storage";
import {
  extractTasksFromContent,
  hydrateTaskContent,
  normalizeTaskContent,
} from "../tasks";
import {
  FormatToolbar,
  type MentionConfig,
  MentionSuggestion,
  SlashCommandMenu,
} from "../widgets";
import { collaborationDoc } from "./collaboration";
import {
  EditorCommandsBridge,
  ViewCapture,
  noopCommands,
} from "./editor-commands";
import { startExternalContentSync } from "./editor-content-sync";
import {
  CHANGE_FLUSH_DEBOUNCE_MS,
  CHANGE_FLUSH_OPTIONS,
  type CompositionState,
  type PendingDocumentChange,
  baseNodeViews,
  buildNoteEditorPlugins,
  wrapNodeViewComponents,
} from "./editor-plugins";
import {
  type EditorCommands,
  type JSONContent,
  type NoteEditorProps,
  type NoteEditorRef,
} from "./editor-types";
import {
  LinkedItemOpenBehaviorContext,
  useLinkedItemOpenBehavior,
} from "./linked-item-open-behavior";
import { schema } from "./schema";
import { normalizeTitleHeadingDoc } from "./title-layout";

export {
  type JSONContent,
  type SearchReplaceParams,
  type EditorCommands,
  type NoteEditorRef,
  type SessionMentionDropData,
  type SessionMentionDropConfig,
  type NoteEditorProps,
} from "./editor-types";
export {
  type CompositionState,
  shouldReplaceEditorContent,
  getEditorCompositionWaitMs,
  createReadOnlyPlugin,
  buildNoteEditorPlugins,
} from "./editor-plugins";

export type {
  MentionConfig,
  FileHandlerConfig,
  PlaceholderFunction,
  PersistentPlaceholderFunction,
};
export { normalizePortableAttachmentUrls } from "./portable-attachments";
export { schema };
export {
  type CommentAnchorInput,
  type CommentAnchorsEvent,
  commentAnchorsPluginKey,
  getCommentAnchorRanges,
  getCommentAnchorScreenPositions,
  getSelectionScreenRect,
  setActiveCommentAnchor,
  setCommentAnchors,
} from "../plugins/comment-anchors";
export { useLinkedItemOpenBehavior };
export {
  isFragmentEmpty,
  NOTE_FRAGMENT_NAME,
  type NoteCollaboration,
  seedFragment,
} from "./collaboration";
export const NoteEditor = forwardRef<NoteEditorRef, NoteEditorProps>(
  function NoteEditor(props, ref) {
    const {
      handleChange,
      onDocumentChange,
      className,
      initialContent,
      resolveAttachment,
      mentionConfig,
      placeholderComponent,
      persistentPlaceholderComponent,
      fileHandlerConfig,
      onNavigateToTitle,
      onLinkOpen,
      linkedItemOpenBehavior = "current",
      taskSource,
      extraNodeViews,
      extraPlugins,
      sessionMentionDropConfig,
      showFormatToolbar = true,
      showSlashCommand = true,
      readOnly = false,
      scrollBottomInset = 0,
      onViewReady: onViewReadyProp,
      onViewDisposed,
      syncContentWhenFocused = false,
      enforceTitleHeading = true,
      commentAnchorsEnabled = false,
      onCommentAnchorsEvent,
      onCommentSelection,
      collaboration,
    } = props;

    const commentAnchorsEventRef = useRef(onCommentAnchorsEvent);
    commentAnchorsEventRef.current = onCommentAnchorsEvent;
    const onDocumentChangeRef = useRef(onDocumentChange);
    onDocumentChangeRef.current = onDocumentChange;

    const taskStorage = useTaskStorageOptional();
    const normalizedInitialContent = useMemo(
      () => normalizeTaskContent(initialContent),
      [initialContent],
    );
    const reconciledInitialContent = useMemo(() => {
      if (!normalizedInitialContent) {
        return normalizedInitialContent;
      }

      const hydrated =
        taskSource && taskStorage
          ? (() => {
              const sourceTasks = taskStorage.getTasksForSource(taskSource);
              if (sourceTasks.length === 0) return normalizedInitialContent;
              return hydrateTaskContent({
                content: normalizedInitialContent,
                sourceTasks,
                getTask: taskStorage.getTask,
              });
            })()
          : normalizedInitialContent;

      return ensureImageTrailingParagraphs(hydrated);
    }, [normalizedInitialContent, taskSource, taskStorage]);
    const previousContentRef = useRef<JSONContent | undefined>(
      reconciledInitialContent,
    );
    const viewRef = useRef<EditorView | null>(null);
    const commandsRef = useRef<EditorCommands>(noopCommands);
    const compositionStateRef = useRef<CompositionState>({
      active: false,
      endedAt: 0,
    });

    const syncTasks = useCallback(
      (content: JSONContent) => {
        if (readOnly || !taskSource || !taskStorage) {
          return;
        }

        const previousTasks = new Map(
          taskStorage
            .getTasksForSource(taskSource)
            .map((task) => [task.taskId, task]),
        );
        taskStorage.upsertTasksForSource(
          taskSource,
          extractTasksFromContent(content, taskSource, previousTasks),
        );
      },
      [readOnly, taskSource, taskStorage],
    );

    const flushChange = useCallback(
      ({ doc, content: serializedContent }: PendingDocumentChange) => {
        const content = serializedContent ?? (doc.toJSON() as JSONContent);
        syncTasks(content);
        if (!handleChange) {
          return;
        }

        handleChange(content);
      },
      [handleChange, syncTasks],
    );

    const flushChangeRef = useRef(flushChange);
    flushChangeRef.current = flushChange;
    const flushLatestChange = useCallback(
      (change: PendingDocumentChange) => flushChangeRef.current(change),
      [],
    );
    const onUpdate = useDebounceCallback(
      flushLatestChange,
      CHANGE_FLUSH_DEBOUNCE_MS,
      CHANGE_FLUSH_OPTIONS,
    );
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;
    const notifyDocumentChange = useCallback((doc: PMNode) => {
      const callback = onDocumentChangeRef.current;
      if (!callback) {
        return undefined;
      }

      const content = doc.toJSON() as JSONContent;
      callback(content);
      return content;
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        get view() {
          return viewRef.current;
        },
        get commands() {
          return commandsRef.current;
        },
        flushPendingChanges: () => {
          const view = viewRef.current;
          onUpdate.cancel();
          if (view) flushChangeRef.current({ doc: view.state.doc });
        },
      }),
      [onUpdate],
    );

    const setCompositionActive = useCallback((active: boolean) => {
      compositionStateRef.current = {
        active,
        endedAt: active ? 0 : Date.now(),
      };
    }, []);

    const plugins = useMemo(
      () =>
        buildNoteEditorPlugins({
          setCompositionActive,
          readOnly,
          notifyDocumentChange,
          onUpdateRef,
          enforceTitleHeading,
          collaboration,
          onNavigateToTitle,
          commentAnchorsEnabled,
          commentAnchorsEventRef,
          placeholderComponent,
          persistentPlaceholderComponent,
          onLinkOpen,
          mentionConfig,
          sessionMentionDropConfig,
          fileHandlerConfig,
          extraPlugins,
        }),
      [
        extraPlugins,
        placeholderComponent,
        persistentPlaceholderComponent,
        fileHandlerConfig,
        mentionConfig,
        sessionMentionDropConfig,
        onNavigateToTitle,
        onLinkOpen,
        enforceTitleHeading,
        readOnly,
        setCompositionActive,
        commentAnchorsEnabled,
        notifyDocumentChange,
        collaboration,
      ],
    );
    const nodeViews = useMemo(
      () => ({ ...baseNodeViews, ...wrapNodeViewComponents(extraNodeViews) }),
      [extraNodeViews],
    );

    const defaultState = useMemo(() => {
      let doc: PMNode;
      try {
        doc = collaboration
          ? collaborationDoc(collaboration, schema)
          : reconciledInitialContent && reconciledInitialContent.type === "doc"
            ? PMNode.fromJSON(schema, reconciledInitialContent)
            : schema.node("doc", null, [schema.node("paragraph")]);
        if (enforceTitleHeading && !collaboration) {
          doc = normalizeTitleHeadingDoc(doc);
        }
      } catch {
        doc = schema.node("doc", null, [
          enforceTitleHeading
            ? schema.node("heading", { level: 1 })
            : schema.node("paragraph"),
        ]);
      }
      return EditorState.create({ doc, plugins });
    }, [reconciledInitialContent, plugins, enforceTitleHeading, collaboration]);

    useEffect(() => {
      if (collaboration) return;
      return startExternalContentSync({
        viewRef,
        previousContentRef,
        compositionStateRef,
        reconciledInitialContent,
        syncContentWhenFocused,
        enforceTitleHeading,
        readOnly,
        onUpdate,
      });
    }, [
      reconciledInitialContent,
      syncContentWhenFocused,
      enforceTitleHeading,
      readOnly,
      onUpdate,
      collaboration,
    ]);

    const onViewReady = useCallback(
      (view: EditorView) => {
        onViewReadyProp?.(view);
        if (!readOnly && taskSource && taskStorage) {
          syncTasks(view.state.doc.toJSON() as JSONContent);
        }
      },
      [onViewReadyProp, readOnly, syncTasks, taskSource, taskStorage],
    );

    const handleViewDisposed = useCallback(
      (view: EditorView) => {
        onUpdate.flush();
        onUpdate.cancel();
        compositionStateRef.current = {
          active: false,
          endedAt: 0,
        };
        onViewDisposed?.(view);
      },
      [onUpdate, onViewDisposed],
    );

    return (
      <AttachmentEditingContext.Provider value={!readOnly}>
        <AttachmentResolverContext.Provider value={resolveAttachment ?? null}>
          <LinkedItemOpenBehaviorContext.Provider
            value={linkedItemOpenBehavior}
          >
            <EditorErrorBoundary
              resetKey={
                taskSource ? `${taskSource.type}:${taskSource.id}` : "note"
              }
            >
              <ProseMirror
                defaultState={defaultState}
                nodeViewComponents={nodeViews}
                editable={() => !readOnly}
                scrollThreshold={{
                  top: 0,
                  right: 0,
                  bottom: scrollBottomInset,
                  left: 0,
                }}
                scrollMargin={{
                  top: 5,
                  right: 5,
                  bottom: scrollBottomInset + 5,
                  left: 5,
                }}
                attributes={{
                  spellCheck: "false",
                  autoComplete: "off",
                  autoCorrect: "off",
                  autoCapitalize: "off",
                  role: readOnly ? "document" : "textbox",
                  "aria-readonly": readOnly ? "true" : "false",
                  class: cn([
                    "prosemirror-editor",
                    "note-typography",
                    enforceTitleHeading && "note-title-editor",
                    className,
                  ]),
                }}
              >
                <ProseMirrorDoc />
                <ViewCapture
                  viewRef={viewRef}
                  onViewReady={onViewReady}
                  onViewDisposed={handleViewDisposed}
                />
                <EditorCommandsBridge commandsRef={commandsRef} />
                {((showFormatToolbar && !readOnly) || onCommentSelection) && (
                  <FormatToolbar
                    onComment={onCommentSelection}
                    showFormatting={showFormatToolbar && !readOnly}
                  />
                )}
                {showSlashCommand && !readOnly && <SlashCommandMenu />}
                {mentionConfig && !readOnly && (
                  <MentionSuggestion config={mentionConfig} />
                )}
              </ProseMirror>
            </EditorErrorBoundary>
          </LinkedItemOpenBehaviorContext.Provider>
        </AttachmentResolverContext.Provider>
      </AttachmentEditingContext.Provider>
    );
  },
);
