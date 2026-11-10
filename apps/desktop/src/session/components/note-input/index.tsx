import type { EditorView } from "prosemirror-view";
import {
  forwardRef,
  type MouseEventHandler,
  type UIEventHandler,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";

import type { JSONContent, NoteEditorRef } from "@syntheo/editor/note";

import { SearchBar } from "./search/bar";
import { useSearch } from "./search/context";

import { PerfZone } from "~/devtools-bar/perf-zone";
import type { NoteStage } from "~/session/components/capsule/stage";
import { LivingDocument } from "~/session/components/living-document";
import {
  registerCanonicalSessionEditor,
  unregisterCanonicalSessionEditor,
} from "~/session/editor-activity";
import { useScrollPreservation } from "~/shared/hooks/useScrollPreservation";
import { getShortcut } from "~/shared/shortcuts";
import type { SessionMode } from "~/store/zustand/listener/general";
import type { Tab } from "~/store/zustand/tabs";
import { type EditorView as TabEditorView } from "~/store/zustand/tabs/schema";

export interface NoteInputHandle {
  focus: () => void;
  focusAtStart: () => void;
  focusAtPixelWidth: (pixelWidth: number) => void;
  insertAtStartAndFocus: (content: string) => void;
  replaceContent: (content: JSONContent) => void;
  flushPendingChanges: () => void;
  prepareForTabChange: () => void;
}

type NoteInputProps = {
  tab: Extract<Tab, { type: "sessions" }>;
  rawMd: string;
  sessionTitle: string;
  onNavigateToTitle?: (pixelWidth?: number) => void;
  onScroll?: UIEventHandler<HTMLDivElement>;
  editorTabs: TabEditorView[];
  currentTab: TabEditorView;
  handleTabChange: (view: TabEditorView) => void;
  sessionMode: SessionMode;
  transcriptEditMode?: boolean;
  onTranscriptEditModeChange?: (editMode: boolean) => void;
  // Document vivant : l'étape remplace les onglets Résumé / Notes / Transcript.
  stage: NoteStage;
};

export const NoteInput = forwardRef<NoteInputHandle, NoteInputProps>(
  function NoteInput(
    {
      tab,
      rawMd,
      sessionTitle,
      onNavigateToTitle,
      onScroll,
      editorTabs,
      currentTab,
      handleTabChange: commitTabChange,
      sessionMode,
      transcriptEditMode = false,
      onTranscriptEditModeChange,
      stage,
    },
    ref,
  ) {
    const internalEditorRef = useRef<NoteEditorRef>(null);
    const sessionId = tab.id;
    const deferredCurrentTab = useDeferredValue(currentTab);
    const renderedCurrentTab = editorTabs.some((editorTab) =>
      isSameEditorView(editorTab, deferredCurrentTab),
    )
      ? deferredCurrentTab
      : currentTab;

    const isMeetingInProgress =
      sessionMode === "active" ||
      sessionMode === "finalizing" ||
      sessionMode === "running_batch";

    const { scrollRef, onBeforeTabChange } = useScrollPreservation(
      renderedCurrentTab.type === "enhanced" ||
        renderedCurrentTab.type === "shared"
        ? `${renderedCurrentTab.type}-${renderedCurrentTab.id}`
        : renderedCurrentTab.type,
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => internalEditorRef.current?.commands.focus(),
        focusAtStart: () => internalEditorRef.current?.commands.focusAtStart(),
        focusAtPixelWidth: (px) =>
          internalEditorRef.current?.commands.focusAtPixelWidth(px),
        insertAtStartAndFocus: (content) =>
          internalEditorRef.current?.commands.insertAtStartAndFocus(content),
        replaceContent: (content) =>
          internalEditorRef.current?.commands.replaceContent(content),
        flushPendingChanges: () =>
          internalEditorRef.current?.flushPendingChanges(),
        prepareForTabChange: onBeforeTabChange,
      }),
      [currentTab, onBeforeTabChange],
    );

    const handleTabChange = useCallback(
      (tabView: TabEditorView) => {
        if (
          isSameEditorView(tabView, currentTab) ||
          isSameEditorView(tabView, renderedCurrentTab)
        ) {
          return;
        }

        onBeforeTabChange();
        commitTabChange(tabView);
      },
      [commitTabChange, currentTab, onBeforeTabChange, renderedCurrentTab],
    );

    const handleAdjacentViewShortcut = useCallback(
      (direction: "previous" | "next") => {
        if (editorTabs.length <= 1) {
          return;
        }

        const currentIndex = editorTabs.findIndex((editorTab) =>
          isSameEditorView(editorTab, renderedCurrentTab),
        );
        if (currentIndex === -1) {
          return;
        }

        const nextIndex =
          direction === "previous"
            ? (currentIndex - 1 + editorTabs.length) % editorTabs.length
            : (currentIndex + 1) % editorTabs.length;
        const nextView = editorTabs[nextIndex];
        if (nextView) {
          handleTabChange(nextView);
        }
      },
      [editorTabs, handleTabChange, renderedCurrentTab],
    );

    // Ctrl+Pg.Préc / Ctrl+Pg.Suiv (table des raccourcis). Ctrl+Alt+←/→ a été
    // supprimé (rotation d'écran Intel, AltGr ; issue 397).
    useHotkeys(
      getShortcut("previousView").hotkeys ?? "",
      () => handleAdjacentViewShortcut("previous"),
      {
        preventDefault: true,
        enableOnFormTags: true,
        enableOnContentEditable: true,
      },
      [handleAdjacentViewShortcut],
    );

    useHotkeys(
      getShortcut("nextView").hotkeys ?? "",
      () => handleAdjacentViewShortcut("next"),
      {
        preventDefault: true,
        enableOnFormTags: true,
        enableOnContentEditable: true,
      },
      [handleAdjacentViewShortcut],
    );

    useEffect(() => {
      if (renderedCurrentTab.type === "raw" && isMeetingInProgress) {
        requestAnimationFrame(() => {
          internalEditorRef.current?.commands.focus();
        });
      }
    }, [renderedCurrentTab, isMeetingInProgress]);

    const search = useSearch();
    const showSearchBar = search?.isVisible ?? false;
    const isEditableTab =
      renderedCurrentTab.type === "enhanced" ||
      renderedCurrentTab.type === "raw";
    const isSearchableTab =
      isEditableTab || renderedCurrentTab.type === "transcript";

    useEffect(() => {
      search?.close();
    }, [currentTab]);

    const handleContainerMouseDown: MouseEventHandler<HTMLDivElement> = (
      event,
    ) => {
      if (!isEditableTab) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      // Les événements React remontent aussi depuis les portails (popovers,
      // menus) rendus dans la note. Un clic dans l'un d'eux n'est pas un clic
      // dans le vide : y placer le curseur dans l'éditeur fermerait le popover
      // avant le clic, et le choix serait perdu (issue 275).
      if (!event.currentTarget.contains(target)) {
        return;
      }

      if (target.closest(".ProseMirror") !== null) {
        return;
      }

      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], [contenteditable='true']",
        ) !== null
      ) {
        return;
      }

      if (event.currentTarget.querySelector(".ProseMirror") === null) {
        return;
      }

      event.preventDefault();
      internalEditorRef.current?.commands.focusAtTrailingEmptyLine();
    };

    const handleSessionViewReady = useCallback(
      (view: EditorView) =>
        registerCanonicalSessionEditor(sessionId, view, () => {
          const editor = internalEditorRef.current;
          if (!editor || editor.view !== view) {
            throw new Error("Canonical session editor changed");
          }
          editor.flushPendingChanges();
        }),
      [sessionId],
    );
    const handleSessionViewDisposed = useCallback(
      (view: EditorView) => unregisterCanonicalSessionEditor(sessionId, view),
      [sessionId],
    );

    return (
      <div className="-mx-2 flex h-full flex-col">
        {showSearchBar && isSearchableTab && (
          <div className="px-3 pt-1">
            <SearchBar
              editorRef={internalEditorRef}
              allowReplace={isEditableTab}
            />
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <PerfZone id="living-document">
            <LivingDocument
              tab={tab}
              stage={stage}
              sessionMode={sessionMode}
              rawMd={rawMd}
              sessionTitle={sessionTitle}
              editorTabs={editorTabs}
              currentTab={renderedCurrentTab}
              onSelectView={handleTabChange}
              editorRef={internalEditorRef}
              scrollRef={scrollRef}
              onContainerMouseDown={handleContainerMouseDown}
              onScroll={onScroll}
              onNavigateToTitle={onNavigateToTitle}
              onViewReady={handleSessionViewReady}
              onViewDisposed={handleSessionViewDisposed}
              transcriptEditMode={transcriptEditMode}
              onTranscriptEditModeChange={onTranscriptEditModeChange}
            />
          </PerfZone>
        </div>
      </div>
    );
  },
);

function isSameEditorView(left: TabEditorView, right: TabEditorView): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type === "enhanced" && right.type === "enhanced") {
    return left.id === right.id;
  }
  if (left.type === "shared" && right.type === "shared") {
    return left.id === right.id;
  }

  return true;
}
