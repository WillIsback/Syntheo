import { useCallback } from "react";

import { getEnhancedNoteTitle } from "./header-shared";
import type { TemplateSelection } from "./template-picker";

import { getEnhancerService } from "~/services/enhancer";
import { useEnhancedNote } from "~/session/queries";
import { useUserTemplate, type TemplateIcon } from "~/templates";

export function useEnhancedViewTitle(enhancedNoteId: string) {
  const enhancedNote = useEnhancedNote(enhancedNoteId);
  const rawTitle = enhancedNote?.title;
  const templateId = enhancedNote?.templateId;
  const { data: template } = useUserTemplate(templateId);
  const templateTitle = template?.title?.trim() || null;
  const templateIcon: TemplateIcon | null = template?.icon ?? null;
  const viewTitle = getEnhancedNoteTitle({
    rawTitle,
    templateTitle,
    templateId,
  });

  return {
    viewTitle,
    templateIcon,
    templateTooltip:
      templateId && templateTitle
        ? `${templateTitle} was used to generate this summary.`
        : undefined,
  };
}

// Changer le modèle d'une synthèse la régénère avec ce modèle.
export function useSummaryTemplateSelection({
  sessionId,
  enhancedNoteId,
  isGenerating,
  onSelectNote,
}: {
  sessionId: string;
  enhancedNoteId: string;
  isGenerating: boolean;
  onSelectNote?: (enhancedNoteId: string) => void;
}) {
  return useCallback(
    (selection: TemplateSelection) => {
      if (isGenerating) {
        return;
      }

      const service = getEnhancerService();
      if (!service) {
        return;
      }

      onSelectNote?.(enhancedNoteId);

      void Promise.resolve(
        service.enhance(sessionId, {
          templateId: selection.templateId,
          targetNoteId: enhancedNoteId,
          templateTitle: selection.templateId ? selection.title : undefined,
        }),
      )
        .then((result) => {
          if (
            (result.type === "started" || result.type === "already_active") &&
            result.noteId !== enhancedNoteId
          ) {
            onSelectNote?.(result.noteId);
          }
        })
        .catch((error) => {
          console.error("[enhancer] failed to replace summary template", error);
        });
    },
    [enhancedNoteId, isGenerating, onSelectNote, sessionId],
  );
}
