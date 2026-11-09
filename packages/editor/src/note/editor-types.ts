import { ProseMirror } from "@handlewithcare/react-prosemirror";
import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { type ComponentProps } from "react";

import { type AttachmentResolver } from "../node-views";
import {
  type FileHandlerConfig,
  type PlaceholderFunction,
  type CommentAnchorsEvent,
  type LinkOpenHandler,
  type PersistentPlaceholderFunction,
} from "../plugins";
import { type TaskSource } from "../tasks";
import { type MentionConfig } from "../widgets";
import { type NoteCollaboration } from "./collaboration";
import { type LinkedItemOpenBehavior } from "./linked-item-open-behavior";

export interface JSONContent {
  type?: string;
  attrs?: Record<string, any>;
  content?: JSONContent[];
  marks?: { type: string; attrs?: Record<string, any> }[];
  text?: string;
}

export interface SearchReplaceParams {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  all: boolean;
  matchIndex: number;
}

export interface EditorCommands {
  focus: () => void;
  focusAtStart: () => void;
  focusAtTrailingEmptyLine: () => void;
  focusAtPixelWidth: (pixelWidth: number) => void;
  insertAtStartAndFocus: (content: string) => void;
  replaceContent: (content: JSONContent) => void;
  setSearch: (query: string, caseSensitive: boolean) => void;
  replace: (params: SearchReplaceParams) => void;
}

export interface NoteEditorRef {
  view: EditorView | null;
  commands: EditorCommands;
  flushPendingChanges: () => void;
}

export type SessionMentionDropData = {
  id: string;
  label: string;
};

export type SessionMentionDropConfig = {
  has?: (
    dataTransfer: Pick<DataTransfer, "types"> | null | undefined,
  ) => boolean;
  read: (
    dataTransfer: Pick<DataTransfer, "getData" | "types"> | null | undefined,
  ) => SessionMentionDropData | null;
};

export type NodeViewComponents = NonNullable<
  ComponentProps<typeof ProseMirror>["nodeViewComponents"]
>;

export interface NoteEditorProps {
  className?: string;
  handleChange?: (content: JSONContent) => void;
  onDocumentChange?: (content: JSONContent) => void;
  initialContent?: JSONContent;
  resolveAttachment?: AttachmentResolver;
  mentionConfig?: MentionConfig;
  placeholderComponent?: PlaceholderFunction;
  persistentPlaceholderComponent?: PersistentPlaceholderFunction;
  fileHandlerConfig?: FileHandlerConfig;
  onNavigateToTitle?: (pixelWidth?: number) => void;
  onLinkOpen?: LinkOpenHandler;
  linkedItemOpenBehavior?: LinkedItemOpenBehavior;
  taskSource?: TaskSource;
  extraNodeViews?: NodeViewComponents;
  /** Fixed at mount: plugins are not reconfigurable afterwards. */
  extraPlugins?: readonly Plugin[];
  sessionMentionDropConfig?: SessionMentionDropConfig;
  showFormatToolbar?: boolean;
  showSlashCommand?: boolean;
  readOnly?: boolean;
  scrollBottomInset?: number;
  onViewReady?: (view: EditorView) => void;
  onViewDisposed?: (view: EditorView) => void;
  syncContentWhenFocused?: boolean;
  enforceTitleHeading?: boolean;
  /** Fixed at mount: plugins are not reconfigurable afterwards. */
  commentAnchorsEnabled?: boolean;
  onCommentAnchorsEvent?: (event: CommentAnchorsEvent) => void;
  onCommentSelection?: () => void;
  /**
   * Fixed at mount. When set, the shared fragment owns the document and
   * `initialContent` is not synced into the editor.
   */
  collaboration?: NoteCollaboration;
}
