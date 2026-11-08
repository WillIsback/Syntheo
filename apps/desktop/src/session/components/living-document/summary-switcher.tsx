import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  formatVersionDate,
  SummaryOptionItem,
  SummarySwitcherView,
  type SynthesisView,
} from "./summary-switcher-view";

import { useEnhancedNoteActions } from "~/session/components/note-input/enhanced-actions";
import {
  useEnhancedViewTitle,
  useSummaryTemplateSelection,
} from "~/session/components/note-input/header-enhanced";
import {
  copyTextToClipboard,
  getStoredNoteMarkdown,
} from "~/session/components/note-input/header-shared";
import { TemplatePickerPopover } from "~/session/components/note-input/template-picker";
import {
  deleteEnhancedNote,
  useEnhancedNote,
  useSummaryVersions,
} from "~/session/queries";

export { formatVersionDate, type SynthesisView };

// Sélecteur « Mes notes | Synthèse · vN ▾ » de l'étape Synthèse (issue 415).
// Il remplace l'ancien sélecteur de comptes rendus : le menu ▾ liste les
// versions de la synthèse (l'actuelle en tête) et garde ce que faisait
// l'ancien sélecteur (passer d'une synthèse à l'autre, régénérer, changer de
// modèle, copier, retirer).
export function SummarySwitcher({
  sessionId,
  enhancedNoteIds,
  currentNoteId,
  onSelectNote,
  view,
  onSelectView,
}: {
  sessionId: string;
  enhancedNoteIds: readonly string[];
  currentNoteId: string | null;
  onSelectNote: (enhancedNoteId: string) => void;
  view: SynthesisView;
  onSelectView: (view: SynthesisView) => void;
}) {
  if (enhancedNoteIds.length === 0 || !currentNoteId) {
    return null;
  }

  return (
    <SummarySwitcherForNote
      sessionId={sessionId}
      enhancedNoteIds={enhancedNoteIds}
      currentNoteId={currentNoteId}
      onSelectNote={onSelectNote}
      view={view}
      onSelectView={onSelectView}
    />
  );
}

function SummarySwitcherForNote({
  sessionId,
  enhancedNoteIds,
  currentNoteId,
  onSelectNote,
  view,
  onSelectView,
}: {
  sessionId: string;
  enhancedNoteIds: readonly string[];
  currentNoteId: string;
  onSelectNote: (enhancedNoteId: string) => void;
  view: SynthesisView;
  onSelectView: (view: SynthesisView) => void;
}) {
  const { t, i18n } = useLingui();
  const note = useEnhancedNote(currentNoteId);
  const versions = useSummaryVersions(currentNoteId);
  const { isGenerating, onRegenerate } = useEnhancedNoteActions({
    sessionId,
    enhancedNoteId: currentNoteId,
  });
  const selectTemplate = useSummaryTemplateSelection({
    sessionId,
    enhancedNoteId: currentNoteId,
    isGenerating,
    onSelectNote,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRequested = useRef(false);

  const versionOptions = useMemo(
    () =>
      versions.map((version) => ({
        id: version.id,
        version: version.version,
        date: formatVersionDate(
          version.generatedAt ?? version.supersededAt,
          i18n.locale,
        ),
      })),
    [i18n.locale, versions],
  );
  const noteMarkdown = useMemo(
    () => getStoredNoteMarkdown(note?.content),
    [note?.content],
  );

  const regenerate = useCallback(() => {
    onSelectView({ kind: "summary" });
    void onRegenerate(null);
  }, [onRegenerate, onSelectView]);
  const handleRemove = useCallback(() => {
    const index = enhancedNoteIds.indexOf(currentNoteId);
    const previous = enhancedNoteIds[index - 1];
    if (previous) {
      onSelectNote(previous);
    }
    void deleteEnhancedNote(currentNoteId).catch((error) => {
      console.error("[living-document] failed to remove summary", error);
    });
  }, [currentNoteId, enhancedNoteIds, onSelectNote]);

  return (
    <TemplatePickerPopover
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      onSelectTemplate={(selection) => {
        onSelectView({ kind: "summary" });
        selectTemplate(selection);
      }}
      usedTemplateId={note?.templateId?.trim() || null}
      onRegenerateUsed={regenerate}
      isRegenerating={isGenerating}
      trigger={
        <SummarySwitcherView
          view={view}
          onSelectView={onSelectView}
          currentVersion={(versions[0]?.version ?? 0) + 1}
          currentDate={formatVersionDate(note?.generatedAt, i18n.locale)}
          versions={versionOptions}
          isGenerating={isGenerating}
          summaryItems={
            enhancedNoteIds.length > 1
              ? enhancedNoteIds.map((id) => (
                  <SummaryTemplateItem key={id} enhancedNoteId={id} />
                ))
              : undefined
          }
          currentNoteId={currentNoteId}
          onSelectNote={onSelectNote}
          canCopy={noteMarkdown.length > 0}
          canRemove={currentNoteId !== enhancedNoteIds[0]}
          onRegenerate={regenerate}
          onChangeTemplate={() => {
            pickerRequested.current = true;
            setPickerOpen(true);
          }}
          onCopy={() => {
            void copyTextToClipboard(noteMarkdown, {
              success: t`Copied to clipboard`,
              error: t`Failed to copy`,
            });
          }}
          onRemove={handleRemove}
          onMenuCloseAutoFocus={(event) => {
            // Le sélecteur de modèle prend le focus à la place du menu.
            if (pickerRequested.current) {
              pickerRequested.current = false;
              event.preventDefault();
            }
          }}
        />
      }
    />
  );
}

function SummaryTemplateItem({ enhancedNoteId }: { enhancedNoteId: string }) {
  const { viewTitle } = useEnhancedViewTitle(enhancedNoteId);
  return <SummaryOptionItem value={enhancedNoteId} label={viewTitle} />;
}
