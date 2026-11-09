import { useEditorEffect } from "@handlewithcare/react-prosemirror";
import { Node as PMNode } from "prosemirror-model";
import { Selection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { useRef } from "react";

import {
  SearchQuery,
  getSearchState,
  searchReplaceAll,
  searchReplaceCurrent,
  setSearchState,
} from "../plugins";
import {
  type EditorCommands,
  type JSONContent,
  type SearchReplaceParams,
} from "./editor-types";
import { schema } from "./schema";
import { focusTrailingEmptyLine } from "./trailing-empty-line-click";

export function ViewCapture({
  viewRef,
  onViewReady,
  onViewDisposed,
}: {
  viewRef: React.RefObject<EditorView | null>;
  onViewReady: (view: EditorView) => void;
  onViewDisposed?: (view: EditorView) => void;
}) {
  const callbacksRef = useRef({ onViewReady, onViewDisposed });
  callbacksRef.current = { onViewReady, onViewDisposed };

  useEditorEffect(
    (view) => {
      if (view && viewRef.current !== view) {
        viewRef.current = view;
        callbacksRef.current.onViewReady(view);
      }

      return () => {
        if (viewRef.current === view) {
          viewRef.current = null;
          callbacksRef.current.onViewDisposed?.(view);
        }
      };
    },
    [viewRef],
  );
  return null;
}

export const noopCommands: EditorCommands = {
  focus: () => {},
  focusAtStart: () => {},
  focusAtTrailingEmptyLine: () => {},
  focusAtPixelWidth: () => {},
  insertAtStartAndFocus: () => {},
  replaceContent: () => {},
  setSearch: () => {},
  replace: () => {},
};

export function EditorCommandsBridge({
  commandsRef,
}: {
  commandsRef: React.RefObject<EditorCommands>;
}) {
  useEditorEffect(
    (view) => {
      if (!view) {
        commandsRef.current = noopCommands;
        return;
      }

      commandsRef.current = {
        focus: () => {
          view.focus();
        },
        focusAtStart: () => {
          view.dispatch(
            view.state.tr.setSelection(Selection.atStart(view.state.doc)),
          );
          view.focus();
        },
        focusAtTrailingEmptyLine: () => {
          focusTrailingEmptyLine(view);
        },
        focusAtPixelWidth: (pixelWidth: number) => {
          const blockStart = Selection.atStart(view.state.doc).from;
          const firstTextNode = view.dom.querySelector(".ProseMirror > *");
          if (firstTextNode) {
            const editorStyle = window.getComputedStyle(firstTextNode);
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.font = `${editorStyle.fontWeight} ${editorStyle.fontSize} ${editorStyle.fontFamily}`;
              const firstBlock = view.state.doc.firstChild;
              if (firstBlock && firstBlock.textContent) {
                const text = firstBlock.textContent;
                let charPos = 0;
                for (let i = 0; i <= text.length; i++) {
                  const currentWidth = ctx.measureText(text.slice(0, i)).width;
                  if (currentWidth >= pixelWidth) {
                    charPos = i;
                    break;
                  }
                  charPos = i;
                }
                const targetPos = Math.min(
                  blockStart + charPos,
                  view.state.doc.content.size - 1,
                );
                view.dispatch(
                  view.state.tr.setSelection(
                    TextSelection.create(view.state.doc, targetPos),
                  ),
                );
                view.focus();
                return;
              }
            }
          }

          view.dispatch(
            view.state.tr.setSelection(Selection.atStart(view.state.doc)),
          );
          view.focus();
        },
        insertAtStartAndFocus: (content: string) => {
          if (!content) return;
          const pos = Selection.atStart(view.state.doc).from;
          const tr = view.state.tr.insertText(content, pos);
          tr.setSelection(TextSelection.create(tr.doc, pos));
          view.dispatch(tr);
          view.focus();
        },
        replaceContent: (content: JSONContent) => {
          if (content.type !== "doc") return;

          try {
            const nextDoc = PMNode.fromJSON(schema, content);
            if (nextDoc.eq(view.state.doc)) {
              return;
            }

            view.dispatch(
              view.state.tr.replaceWith(
                0,
                view.state.doc.content.size,
                nextDoc.content,
              ),
            );
          } catch {
            // invalid content
          }
        },
        setSearch: (query: string, caseSensitive: boolean) => {
          const q = new SearchQuery({ search: query, caseSensitive });
          const current = getSearchState(view.state);
          if (current && current.query.eq(q)) return;
          view.dispatch(setSearchState(view.state.tr, q));
        },
        replace: (params: SearchReplaceParams) => {
          const query = new SearchQuery({
            search: params.query,
            replace: params.replacement,
            caseSensitive: params.caseSensitive,
            wholeWord: params.wholeWord,
          });

          view.dispatch(setSearchState(view.state.tr, query));

          if (params.all) {
            searchReplaceAll(view.state, (tr) => view.dispatch(tr));
          } else {
            let result = query.findNext(view.state);
            let idx = 0;
            while (result && idx < params.matchIndex) {
              result = query.findNext(view.state, result.to);
              idx++;
            }
            if (!result) return;
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, result.from, result.to),
              ),
            );
            searchReplaceCurrent(view.state, (tr) => view.dispatch(tr));
          }
        },
      };

      return () => {
        commandsRef.current = noopCommands;
      };
    },
    [commandsRef],
  );

  return null;
}
