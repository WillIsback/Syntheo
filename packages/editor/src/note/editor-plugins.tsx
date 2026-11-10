import { reactKeys } from "@handlewithcare/react-prosemirror";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history } from "prosemirror-history";
import { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import {
  FileAttachmentView,
  getNodeViewFallbackTag,
  MentionNodeView,
  ResizableImageView,
  TaskItemView,
  withNodeViewErrorBoundary,
} from "../node-views";
import {
  autolinkPlugin,
  clearMarksOnEnterPlugin,
  clipboardPlugin,
  clipPastePlugin,
  commentAnchorsPlugin,
  docChangeListenerPlugin,
  fileHandlerPlugin,
  hashtagPlugin,
  imageTrailingParagraphPlugin,
  linkBoundaryGuardPlugin,
  linkOpenPlugin,
  placeholderPlugin,
  searchPlugin,
  taskIdentityPlugin,
} from "../plugins";
import { mentionSkipPlugin } from "../widgets";
import { collaborationPlugins } from "./collaboration";
import {
  type JSONContent,
  type NodeViewComponents,
  type NoteEditorProps,
  type SessionMentionDropConfig,
} from "./editor-types";
import { buildInputRules, buildKeymap } from "./keymap";
import { titleHeadingPlugin } from "./title-layout";
import { trailingEmptyLineClickPlugin } from "./trailing-empty-line-click";

export const baseNodeViews = {
  fileAttachment: withNodeViewErrorBoundary<HTMLDivElement>(
    FileAttachmentView,
    { name: "fileAttachment" },
  ),
  image: withNodeViewErrorBoundary<HTMLDivElement>(ResizableImageView, {
    name: "image",
  }),
  "mention-@": withNodeViewErrorBoundary<HTMLElement>(MentionNodeView, {
    name: "mention-@",
  }),
  taskItem: withNodeViewErrorBoundary<HTMLLIElement>(TaskItemView, {
    name: "taskItem",
  }),
};

const COMPOSITION_SYNC_GRACE_MS = 500;

// Stretching this delay does not reduce upload volume -- CloudSync stages a
// row's current value, not one entry per write, so a sync tick ships the note
// once however often it was written (crates/db-core/tests/write_coalescing.rs).
// maxWait is the part that matters: trailing-only never fires while keystrokes
// keep arriving under the delay, so a fluent burst could persist nothing for as
// long as it lasted, losing all of it on an unclean exit and going stale for
// readers that query session_documents instead of calling flushPendingChanges().
// Must stay module-level -- useDebounceCallback memoizes on the options
// identity, and a fresh object each render would drop the pending timer.
export const CHANGE_FLUSH_DEBOUNCE_MS = 500;
export const CHANGE_FLUSH_OPTIONS = {
  maxWait: 10_000,
  trailing: true,
} as const;

export type PendingDocumentChange = {
  doc: PMNode;
  content?: JSONContent;
};

export type CompositionState = {
  active: boolean;
  endedAt: number;
};

export function isSameContent(
  left: JSONContent | undefined,
  right: JSONContent | undefined,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function shouldReplaceEditorContent({
  currentContent,
  nextContent,
  hasFocus,
  isComposing,
  syncContentWhenFocused,
}: {
  currentContent: JSONContent;
  nextContent: JSONContent;
  hasFocus: boolean;
  isComposing: boolean;
  syncContentWhenFocused: boolean;
}) {
  if (isSameContent(currentContent, nextContent)) {
    return false;
  }

  if (isComposing) {
    return false;
  }

  if (hasFocus && !syncContentWhenFocused) {
    return false;
  }

  return true;
}

export function wrapNodeViewComponents(nodeViews?: NodeViewComponents) {
  if (!nodeViews) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(nodeViews).map(([name, Component]) => [
      name,
      withNodeViewErrorBoundary(Component, {
        fallbackTag: getNodeViewFallbackTag(name),
        name,
      }),
    ]),
  ) as NodeViewComponents;
}

export function getEditorCompositionWaitMs(
  view: Pick<EditorView, "composing">,
  compositionState: CompositionState,
) {
  if (view.composing || compositionState.active) {
    return COMPOSITION_SYNC_GRACE_MS;
  }

  return Math.max(
    COMPOSITION_SYNC_GRACE_MS - (Date.now() - compositionState.endedAt),
    0,
  );
}

function createCompositionStatePlugin(
  setCompositionActive: (active: boolean) => void,
) {
  return new Plugin({
    key: new PluginKey("imeCompositionState"),
    props: {
      handleDOMEvents: {
        compositionstart() {
          setCompositionActive(true);
          return false;
        },
        compositionupdate() {
          setCompositionActive(true);
          return false;
        },
        compositionend() {
          setCompositionActive(false);
          return false;
        },
      },
    },
  });
}

export function createReadOnlyPlugin() {
  return new Plugin({
    filterTransaction: (transaction) => !transaction.docChanged,
  });
}

function createSessionMentionDropPlugin(config: SessionMentionDropConfig) {
  const hasSession = (dataTransfer: DataTransfer | null) =>
    config.has ? config.has(dataTransfer) : Boolean(config.read(dataTransfer));
  const readSession = (dataTransfer: DataTransfer | null) =>
    config.read(dataTransfer);

  return new Plugin({
    key: new PluginKey("sessionMentionDrop"),
    props: {
      handleDOMEvents: {
        dragover(_view, event) {
          const dataTransfer = (event as DragEvent).dataTransfer;
          if (!hasSession(dataTransfer)) {
            return false;
          }

          event.preventDefault();
          if (dataTransfer) {
            dataTransfer.dropEffect = "copy";
          }
          return true;
        },
      },
      handleDrop(view, event) {
        const session = readSession(event.dataTransfer);
        const mentionType = view.state.schema.nodes["mention-@"];
        if (!session || !mentionType) {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();

        const mentionNode = mentionType.create({
          id: session.id,
          type: "session",
          label: session.label,
        });
        const space = view.state.schema.text(" ");
        const pos =
          view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos ?? view.state.selection.from;

        try {
          const tr = view.state.tr.insert(pos, [mentionNode, space]);
          tr.setSelection(
            TextSelection.create(
              tr.doc,
              pos + mentionNode.nodeSize + space.nodeSize,
            ),
          );
          view.dispatch(tr.scrollIntoView());
        } catch {
          const tr = view.state.tr
            .replaceSelectionWith(mentionNode)
            .insertText(" ");
          view.dispatch(tr.scrollIntoView());
        }

        view.focus();
        return true;
      },
    },
  });
}

type Ref<T> = { current: T };

/** Liste ordonnée des plugins ProseMirror de l'éditeur de note. */
export function buildNoteEditorPlugins({
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
}: {
  setCompositionActive: (active: boolean) => void;
  readOnly: boolean;
  notifyDocumentChange: (doc: PMNode) => JSONContent | undefined;
  onUpdateRef: Ref<(change: PendingDocumentChange) => void>;
  enforceTitleHeading: boolean;
  collaboration: NoteEditorProps["collaboration"];
  onNavigateToTitle: NoteEditorProps["onNavigateToTitle"];
  commentAnchorsEnabled: boolean;
  commentAnchorsEventRef: Ref<NoteEditorProps["onCommentAnchorsEvent"]>;
  placeholderComponent: NoteEditorProps["placeholderComponent"];
  persistentPlaceholderComponent: NoteEditorProps["persistentPlaceholderComponent"];
  onLinkOpen: NoteEditorProps["onLinkOpen"];
  mentionConfig: NoteEditorProps["mentionConfig"];
  sessionMentionDropConfig: NoteEditorProps["sessionMentionDropConfig"];
  fileHandlerConfig: NoteEditorProps["fileHandlerConfig"];
  extraPlugins: NoteEditorProps["extraPlugins"];
}) {
  return [
    reactKeys(),
    createCompositionStatePlugin(setCompositionActive),
    ...(readOnly ? [createReadOnlyPlugin()] : []),
    docChangeListenerPlugin((doc) => {
      const content = notifyDocumentChange(doc);
      onUpdateRef.current({
        doc,
        ...(content ? { content } : {}),
      });
    }, notifyDocumentChange),
    buildInputRules(),
    ...(enforceTitleHeading ? [titleHeadingPlugin()] : []),
    taskIdentityPlugin(),
    ...(collaboration ? collaborationPlugins(collaboration) : []),
    buildKeymap(onNavigateToTitle),
    trailingEmptyLineClickPlugin(),
    ...(collaboration ? [] : [history()]),
    dropCursor(),
    gapCursor(),
    clipboardPlugin(),
    hashtagPlugin(),
    ...(commentAnchorsEnabled
      ? [
          commentAnchorsPlugin({
            onEvent: (event) => commentAnchorsEventRef.current?.(event),
          }),
        ]
      : []),
    imageTrailingParagraphPlugin(),
    searchPlugin(),
    placeholderPlugin(placeholderComponent, persistentPlaceholderComponent),
    clearMarksOnEnterPlugin(),
    clipPastePlugin(),
    autolinkPlugin(),
    linkBoundaryGuardPlugin(),
    ...(onLinkOpen ? [linkOpenPlugin(onLinkOpen)] : []),
    ...(mentionConfig ? [mentionSkipPlugin()] : []),
    ...(sessionMentionDropConfig
      ? [createSessionMentionDropPlugin(sessionMentionDropConfig)]
      : []),
    ...(fileHandlerConfig ? [fileHandlerPlugin(fileHandlerConfig)] : []),
    ...(extraPlugins ?? []),
  ];
}
