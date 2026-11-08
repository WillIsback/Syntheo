import "./living-document.css";

import { Trans, useLingui } from "@lingui/react/macro";
import type { EditorView } from "prosemirror-view";
import {
  type MouseEventHandler,
  type ReactNode,
  type RefObject,
  type UIEventHandler,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type NoteEditorRef,
  normalizePortableAttachmentUrls,
} from "@syntheo/editor/note";
import { cn } from "@syntheo/utils";

import type { NoteStage } from "../capsule/stage";
import { Enhanced } from "../note-input/enhanced";
import { RawEditor } from "../note-input/raw";
import { TitleInput } from "../title-input";
import { PrepareFiche } from "./fiche";
import { NoteMeta } from "./meta";
import { extractNoteLines } from "./note-attribution";
import { NoteSeal, ProvenanceLegend } from "./provenance";
import { SummaryProposalReview, useSummaryProposal } from "./summary-review";
import { SummarySwitcher, type SynthesisView } from "./summary-switcher";
import { NotesChangedBanner, SummaryVersionView } from "./summary-version";
import { TranscriptMargin } from "./transcript-margin";
import { WelcomeCard } from "./welcome-card";

import { useAITaskTask } from "~/ai/hooks";
import { hasStoredNoteContent } from "~/session/components/shared";
import {
  registerCanonicalSessionEditor,
  unregisterCanonicalSessionEditor,
} from "~/session/editor-activity";
import {
  useEnhancedNote,
  useSession,
  useSummaryVersions,
  useUpdateSession,
} from "~/session/queries";
import { useConfigValue } from "~/shared/config";
import { createTaskId } from "~/store/zustand/ai-task/task-configs";
import type { SessionMode } from "~/store/zustand/listener/general";
import type {
  EditorView as TabEditorView,
  Tab,
} from "~/store/zustand/tabs/schema";

export type LivingDocumentProps = {
  tab: Extract<Tab, { type: "sessions" }>;
  stage: NoteStage;
  sessionMode: SessionMode;
  rawMd: string;
  sessionTitle: string;
  eventTitle?: string;
  eventDescription?: string;
  editorTabs: TabEditorView[];
  currentTab: TabEditorView;
  onSelectView: (view: TabEditorView) => void;
  editorRef: RefObject<NoteEditorRef | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onContainerMouseDown: MouseEventHandler<HTMLDivElement>;
  onScroll?: UIEventHandler<HTMLDivElement>;
  onNavigateToTitle?: (pixelWidth?: number) => void;
  onViewReady: (view: EditorView) => void;
  onViewDisposed: (view: EditorView) => void;
  transcriptEditMode: boolean;
  onTranscriptEditModeChange?: (editMode: boolean) => void;
};

// Une note passe d'une fiche (Préparer) à une prise de notes avec la
// transcription en marge (Écouter), puis à un compte-rendu (Synthèse), sans
// changer d'écran.
export function LivingDocument(props: LivingDocumentProps) {
  const {
    tab,
    stage,
    sessionMode,
    editorRef,
    scrollRef,
    onContainerMouseDown,
    onScroll,
    transcriptEditMode,
    onTranscriptEditModeChange,
  } = props;
  const sessionId = tab.id;
  const { t } = useLingui();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const showMargin =
    stage === "listen" || (stage === "synthesis" && transcriptOpen);
  const marginId = `transcript-margin-${sessionId}`;
  const handleSelectTemplate = useMeetingTypeSelection(sessionId, editorRef);

  return (
    <DocumentLayout
      stage={stage}
      scrollRef={scrollRef}
      onMouseDown={onContainerMouseDown}
      onScroll={onScroll}
      margin={
        showMargin ? (
          <TranscriptMargin
            sessionId={sessionId}
            editMode={transcriptEditMode}
            canEdit={stage === "synthesis" && sessionMode === "inactive"}
            onEditModeChange={onTranscriptEditModeChange}
          />
        ) : null
      }
    >
      <TitleInput
        tab={tab}
        variant="document"
        onFocusEditorAtStart={() => editorRef.current?.commands.focusAtStart()}
        onFocusEditorAtPixelWidth={(px) =>
          editorRef.current?.commands.focusAtPixelWidth(px)
        }
      />
      <WelcomeCard sessionId={sessionId} />
      {/* Positions stables : l'éditeur de notes n'est pas remonté entre
          Préparer et Écouter, le texte en cours de saisie n'est pas perdu. */}
      {stage === "prepare" ? (
        <PrepareFiche
          sessionId={sessionId}
          onSelectTemplate={handleSelectTemplate}
        />
      ) : null}
      {stage === "listen" ? <NoteMeta sessionId={sessionId} /> : null}
      {stage !== "synthesis" ? (
        <UserNotes {...props} registerAsPrimary />
      ) : null}
      {stage === "synthesis" ? (
        <SynthesisStage
          {...props}
          metaActions={
            <button
              type="button"
              aria-expanded={transcriptOpen}
              aria-controls={transcriptOpen ? marginId : undefined}
              onClick={() => setTranscriptOpen((open) => !open)}
              className={cn([
                "text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-2 py-0.5 text-[13px] transition-colors",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                transcriptOpen && "bg-accent text-accent-foreground",
              ])}
              title={transcriptOpen ? t`Hide transcript` : t`Show transcript`}
            >
              <Trans>Transcription</Trans>
            </button>
          }
        />
      ) : null}
    </DocumentLayout>
  );
}

function DocumentLayout({
  stage,
  margin,
  scrollRef,
  onMouseDown,
  onScroll,
  children,
}: {
  stage: NoteStage;
  margin: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onScroll?: UIEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  const withMargin = Boolean(margin);

  // Mêmes éléments quelle que soit l'étape, pour ne rien remonter :
  // - sans marge, colonne note de 760px et défilement au bord de la fenêtre ;
  // - avec marge, 680px de notes + transcription 280px (écart 40px).
  return (
    <div
      data-living-document
      data-stage={stage}
      className="@container flex h-full min-h-0 justify-center px-3"
    >
      <div
        className={cn([
          "grid h-full min-h-0 w-full",
          withMargin
            ? "max-w-[1000px] grid-cols-[minmax(0,1fr)_280px] gap-10 @max-[720px]:grid-cols-1"
            : "grid-cols-1",
        ])}
      >
        <div
          ref={scrollRef}
          onMouseDown={onMouseDown}
          onScroll={onScroll}
          className="min-h-0 scroll-pb-20 overflow-x-hidden overflow-y-auto"
        >
          <div
            className={cn([
              "flex flex-col gap-[18px] pt-6 pb-24",
              !withMargin && "mx-auto w-full max-w-[760px]",
            ])}
          >
            {children}
          </div>
        </div>
        {margin ? (
          <div className="min-h-0 pt-6 pb-24 @max-[720px]:hidden">{margin}</div>
        ) : null}
      </div>
    </div>
  );
}

// Le type de réunion choisit le modèle du compte-rendu (raw_template_id),
// sans toucher au contenu déjà écrit.
function useMeetingTypeSelection(
  sessionId: string,
  editorRef: RefObject<NoteEditorRef | null>,
) {
  const updateSession = useUpdateSession(sessionId);
  const storedRawMd = useSession(sessionId)?.raw_md ?? "";

  return useCallback(
    (templateId: string) => {
      const editor = editorRef.current;
      const doc = editor?.view?.state.doc.toJSON();
      editor?.flushPendingChanges();
      const rawMd = doc
        ? JSON.stringify(normalizePortableAttachmentUrls(doc))
        : storedRawMd;
      void updateSession({ raw_md: rawMd, raw_template_id: templateId }).catch(
        (error) => {
          console.error("[living-document] failed to set meeting type", error);
        },
      );
    },
    [editorRef, storedRawMd, updateSession],
  );
}

function UserNotes({
  tab,
  stage,
  rawMd,
  sessionTitle,
  eventTitle,
  eventDescription,
  editorRef,
  onNavigateToTitle,
  onViewReady,
  onViewDisposed,
  registerAsPrimary = false,
}: LivingDocumentProps & { registerAsPrimary?: boolean }) {
  const { t } = useLingui();
  const sessionId = tab.id;
  const secondaryEditorRef = useRef<NoteEditorRef>(null);
  // Dans la synthèse, l'éditeur principal est le compte-rendu : les notes de
  // l'utilisateur s'enregistrent à part pour être sauvegardées elles aussi.
  const handleSecondaryReady = useCallback(
    (view: EditorView) =>
      registerCanonicalSessionEditor(sessionId, view, () => {
        const editor = secondaryEditorRef.current;
        if (editor && editor.view === view) {
          editor.flushPendingChanges();
        }
      }),
    [sessionId],
  );
  const handleSecondaryDisposed = useCallback(
    (view: EditorView) => unregisterCanonicalSessionEditor(sessionId, view),
    [sessionId],
  );

  return (
    <div data-provenance="user">
      <RawEditor
        ref={registerAsPrimary ? editorRef : secondaryEditorRef}
        sessionId={sessionId}
        rawMd={rawMd}
        sessionTitle={sessionTitle}
        eventTitle={eventTitle}
        eventDescription={eventDescription}
        onNavigateToTitle={registerAsPrimary ? onNavigateToTitle : undefined}
        placeholder={
          stage === "synthesis"
            ? t`Write freely, Syntheo will complete it.`
            : t`Note here what you want to remember. During the meeting, write freely: Syntheo will complete it.`
        }
        showTemplateSuggestions={false}
        onViewReady={registerAsPrimary ? onViewReady : handleSecondaryReady}
        onViewDisposed={
          registerAsPrimary ? onViewDisposed : handleSecondaryDisposed
        }
      />
    </div>
  );
}

const SUMMARY_VIEW: SynthesisView = { kind: "summary" };

function SynthesisStage(
  props: LivingDocumentProps & { metaActions: ReactNode },
) {
  const { tab, editorTabs, currentTab, onSelectView, metaActions } = props;
  const sessionId = tab.id;
  const enhancedNoteIds = editorTabs.flatMap((view) =>
    view.type === "enhanced" ? [view.id] : [],
  );
  const currentNoteId = currentTab.type === "enhanced" ? currentTab.id : null;
  const handleSelectNote = useCallback(
    (id: string) => onSelectView({ type: "enhanced", id }),
    [onSelectView],
  );
  // Vue choisie dans « Mes notes | Synthèse · vN » (issue 415), propre à la
  // synthèse affichée : en changer revient à sa version actuelle. L'onglet
  // garde la synthèse : export et impression ne voient que la version
  // actuelle.
  const [viewState, setViewState] = useState<{
    noteId: string | null;
    view: SynthesisView;
  }>({ noteId: currentNoteId, view: SUMMARY_VIEW });
  const view =
    viewState.noteId === currentNoteId ? viewState.view : SUMMARY_VIEW;
  const handleSelectSynthesisView = useCallback(
    (next: SynthesisView) =>
      setViewState({ noteId: currentNoteId, view: next }),
    [currentNoteId],
  );
  const showSummary = useCallback(
    () => handleSelectSynthesisView(SUMMARY_VIEW),
    [handleSelectSynthesisView],
  );
  const versions = useSummaryVersions(currentNoteId);
  const viewedVersion =
    view.kind === "version"
      ? versions.find((version) => version.id === view.versionId)
      : undefined;

  let content: ReactNode;
  if (!currentNoteId) {
    content = <UserNotes {...props} registerAsPrimary />;
  } else if (view.kind === "notes") {
    // « Mes notes » : la note telle qu'elle a été tapée, toujours modifiable
    // (même éditeur, même sauvegarde), avec le bandeau de régénération.
    content = (
      <>
        <NotesChangedBanner
          sessionId={sessionId}
          enhancedNoteId={currentNoteId}
          rawMd={props.rawMd}
          editorRef={props.editorRef}
          onShowSummary={showSummary}
        />
        <UserNotes {...props} registerAsPrimary />
      </>
    );
  } else if (viewedVersion) {
    content = (
      <SummaryVersionView
        version={viewedVersion}
        onBackToCurrent={showSummary}
      />
    );
  } else {
    content = (
      <SummaryWithReview
        {...props}
        sessionId={sessionId}
        enhancedNoteId={currentNoteId}
      />
    );
  }

  return (
    <>
      <NoteMeta sessionId={sessionId}>
        <SummarySwitcher
          sessionId={sessionId}
          enhancedNoteIds={enhancedNoteIds}
          currentNoteId={currentNoteId}
          onSelectNote={handleSelectNote}
          view={view}
          onSelectView={handleSelectSynthesisView}
        />
        {metaActions}
      </NoteMeta>
      <ProvenanceLegend />
      {content}
    </>
  );
}

const NO_NOTE_LINES: readonly string[] = [];

// Le compte-rendu, ou sa revue tant qu'une réécriture (« Demander à la
// note ») attend d'être appliquée ou refusée.
//
// Réglage « Colorer mes notes dans le compte rendu » (issue 365, activé par
// défaut) : un seul compte rendu où les phrases venues des notes sont en
// user-ink. Désactivé, ou pendant une revue, les notes restent dans leur
// propre bloc sous le compte rendu.
function SummaryWithReview(
  props: LivingDocumentProps & { sessionId: string; enhancedNoteId: string },
) {
  const {
    sessionId,
    enhancedNoteId,
    editorRef,
    rawMd,
    sessionTitle,
    onNavigateToTitle,
    onViewReady,
    onViewDisposed,
  } = props;
  const proposal = useSummaryProposal(sessionId, enhancedNoteId);
  const colorNotes = useConfigValue("color_notes_in_summary");
  const noteLines = useMemo(
    () => (colorNotes ? extractNoteLines(rawMd) : NO_NOTE_LINES),
    [colorNotes, rawMd],
  );
  const showNotesBlock = !colorNotes || Boolean(proposal);

  return (
    <>
      <div data-provenance="ai">
        {proposal ? (
          <SummaryProposalReview proposal={proposal} />
        ) : (
          <Enhanced
            ref={editorRef}
            sessionId={sessionId}
            sessionTitle={sessionTitle}
            enhancedNoteId={enhancedNoteId}
            noteLines={noteLines}
            onNavigateToTitle={onNavigateToTitle}
            onViewReady={onViewReady}
            onViewDisposed={onViewDisposed}
          />
        )}
      </div>
      {showNotesBlock ? <UserNotesSection {...props} /> : null}
      {proposal ? null : <SummarySeal enhancedNoteId={enhancedNoteId} />}
    </>
  );
}

// Repli en deux blocs : le compte-rendu généré puis, dans le même document,
// les notes prises pendant la réunion (encre user-ink).
function UserNotesSection(props: LivingDocumentProps) {
  const headingId = `user-notes-${props.tab.id}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2
        id={headingId}
        className="text-faint mt-4 text-[11px] font-semibold tracking-[0.08em] uppercase"
      >
        <Trans>Your notes</Trans>
      </h2>
      <UserNotes {...props} />
    </section>
  );
}

function SummarySeal({ enhancedNoteId }: { enhancedNoteId: string }) {
  const content = useEnhancedNote(enhancedNoteId)?.content;
  const { status } = useAITaskTask(
    createTaskId(enhancedNoteId, "enhance"),
    "enhance",
  );
  const done = status !== "generating" && hasStoredNoteContent(content);

  return done ? <NoteSeal /> : null;
}
