import { t } from "@lingui/core/macro";
import { useCallback } from "react";

import { toast } from "@syntheo/ui/components/ui/toast";

import { useAITaskTask, useLanguageModel } from "~/ai/hooks";
import {
  isMainAITaskHostWindow,
  requestMainAITaskCancel,
  requestMainEnhance,
} from "~/ai/task-window-sync";
import { getEnhancerService } from "~/services/enhancer";
import {
  getEligibility,
  getSummaryIneligibilityReason,
} from "~/services/enhancer/eligibility";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import { useEnhancedNote } from "~/session/queries";
import { useIntelligenceDisabled } from "~/settings/managed";
import { createTaskId } from "~/store/zustand/ai-task/task-configs";

export function useEnhancedNoteActions({
  enhancedNoteId,
  sessionId,
}: {
  enhancedNoteId: string | null;
  sessionId: string;
}) {
  const model = useLanguageModel();
  const taskId = enhancedNoteId
    ? createTaskId(enhancedNoteId, "enhance")
    : null;

  const note = useEnhancedNote(enhancedNoteId ?? "");
  const noteTemplateId = note?.templateId || undefined;

  const enhanceTask = useAITaskTask(taskId, "enhance");
  // Synthèse coupée (intelligence_disabled, politique en vigueur ou copie
  // restée dans app_settings) : les points d'entrée « Régénérer » sont
  // retirés, et un appel resté en vol ne part pas (issue 707).
  const summaryOff = useIntelligenceDisabled().blocked;

  const onRegenerate = useCallback(
    async (templateId: string | null) => {
      if (!enhancedNoteId || summaryOff) {
        return;
      }

      if (!model) {
        toast.error(
          t`Set up Intelligence in Settings before regenerating this summary.`,
        );
        return;
      }

      const snapshot = await loadSessionContentSnapshot(sessionId);
      if (snapshot) {
        const eligibility = getEligibility(snapshot.transcripts);
        if (
          !eligibility.eligible &&
          eligibility.code === "transcript_too_short"
        ) {
          toast.warning(t`Summary wasn't generated`, {
            id: `auto-summary-too-short-${sessionId}`,
            description: getSummaryIneligibilityReason(eligibility),
          });
          return;
        }
      }

      if (!isMainAITaskHostWindow()) {
        void requestMainEnhance(sessionId, {
          templateId: templateId ?? noteTemplateId,
          targetNoteId: note ? enhancedNoteId : undefined,
        });
        return;
      }

      if (!note) {
        await getEnhancerService()?.enhance(sessionId, {
          templateId: templateId ?? noteTemplateId,
        });
        return;
      }

      await enhanceTask.start({
        model,
        args: {
          sessionId,
          enhancedNoteId,
          templateId: templateId ?? noteTemplateId,
        },
      });
    },
    [
      enhancedNoteId,
      summaryOff,
      model,
      enhanceTask.start,
      sessionId,
      noteTemplateId,
      note,
    ],
  );

  const onCancel = useCallback(() => {
    if (!taskId) {
      return;
    }

    if (!isMainAITaskHostWindow()) {
      void requestMainAITaskCancel(taskId);
      return;
    }

    enhanceTask.cancel();
  }, [enhanceTask.cancel, taskId]);

  return {
    isGenerating: enhanceTask.isGenerating,
    isError: enhanceTask.isError,
    error: enhanceTask.error,
    summaryOff,
    onRegenerate,
    onCancel,
  };
}
