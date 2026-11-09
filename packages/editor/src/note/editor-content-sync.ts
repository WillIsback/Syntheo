import { closeHistory } from "prosemirror-history";
import { Node as PMNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import {
  type CompositionState,
  getEditorCompositionWaitMs,
  isSameContent,
  shouldReplaceEditorContent,
} from "./editor-plugins";
import type { JSONContent } from "./editor-types";
import { schema } from "./schema";
import { normalizeTitleHeadingDoc } from "./title-layout";

type Ref<T> = { current: T };

/**
 * Remplace le contenu de l'éditeur quand le contenu fourni change, sans
 * interrompre une saisie ou une composition en cours. Renvoie le nettoyage
 * de l'effet.
 */
export function startExternalContentSync({
  viewRef,
  previousContentRef,
  compositionStateRef,
  reconciledInitialContent,
  syncContentWhenFocused,
  enforceTitleHeading,
  readOnly,
  onUpdate,
}: {
  viewRef: Ref<EditorView | null>;
  previousContentRef: Ref<JSONContent | undefined>;
  compositionStateRef: Ref<CompositionState>;
  reconciledInitialContent: JSONContent | undefined;
  syncContentWhenFocused: boolean;
  enforceTitleHeading: boolean;
  readOnly: boolean;
  onUpdate: { cancel: () => void };
}) {
  let retryTimeout: ReturnType<typeof setTimeout> | undefined;
  let deferredPopup: HTMLElement | undefined;
  let deferredView: EditorView | undefined;

  const syncContent = (event?: FocusEvent) => {
    const popup =
      event?.relatedTarget instanceof Element
        ? event.relatedTarget.closest<HTMLElement>(
            "[data-editor-escape-consumer]",
          )
        : null;
    if (popup) {
      deferredPopup = popup;
      popup.addEventListener("focusout", syncContent, { once: true });
      return;
    }

    const view = viewRef.current;
    if (!view) return;
    if (previousContentRef.current === reconciledInitialContent) return;
    if (isSameContent(previousContentRef.current, reconciledInitialContent)) {
      previousContentRef.current = reconciledInitialContent;
      return;
    }

    if (!reconciledInitialContent || reconciledInitialContent.type !== "doc") {
      return;
    }

    if (view.hasFocus() && !syncContentWhenFocused) {
      deferredView = view;
      view.dom.addEventListener("blur", syncContent, { once: true });
      return;
    }

    const currentContent = view.state.doc.toJSON() as JSONContent;
    if (isSameContent(currentContent, reconciledInitialContent)) {
      previousContentRef.current = reconciledInitialContent;
      return;
    }

    const compositionWaitMs = getEditorCompositionWaitMs(
      view,
      compositionStateRef.current,
    );
    if (compositionWaitMs > 0) {
      retryTimeout = setTimeout(syncContent, compositionWaitMs);
      return;
    }

    if (
      !shouldReplaceEditorContent({
        currentContent,
        nextContent: reconciledInitialContent,
        hasFocus: view.hasFocus(),
        isComposing: false,
        syncContentWhenFocused,
      })
    ) {
      return;
    }

    try {
      let doc = PMNode.fromJSON(schema, reconciledInitialContent);
      if (enforceTitleHeading) {
        doc = normalizeTitleHeadingDoc(doc);
      }
      onUpdate.cancel();
      if (readOnly) {
        view.updateState(
          EditorState.create({ doc, plugins: view.state.plugins }),
        );
      } else {
        view.dispatch(
          closeHistory(
            view.state.tr
              .replaceWith(0, view.state.doc.content.size, doc.content)
              .setMeta("externalContentSync", true),
          ),
        );
      }
      previousContentRef.current = reconciledInitialContent;
    } catch {
      // invalid content
    }
  };

  syncContent();

  return () => {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }
    deferredPopup?.removeEventListener("focusout", syncContent);
    deferredView?.dom.removeEventListener("blur", syncContent);
  };
}
