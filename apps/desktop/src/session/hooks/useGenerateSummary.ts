import { t } from "@lingui/core/macro";
import { useMutation } from "@tanstack/react-query";

import {
  isMainAITaskHostWindow,
  requestMainEnhance,
} from "~/ai/task-window-sync";
import { getEnhancerService } from "~/services/enhancer";

/** Génère le compte rendu de la note à la demande (« Générer le compte rendu »). */
export function useGenerateSummary(sessionId: string) {
  const mutation = useMutation({
    mutationFn: async () => {
      if (!isMainAITaskHostWindow()) {
        await requestMainEnhance(sessionId);
        return;
      }
      const service = getEnhancerService();
      if (!service) throw new Error(t`Summary generation is not ready yet.`);
      const result = await service.enhance(sessionId);
      if (result.type === "no_model")
        throw new Error(t`Set up AI summaries first.`);
      if (result.type === "too_short")
        throw new Error(
          t`Not enough transcript was recorded to write a summary.`,
        );
    },
  });

  return {
    generate: mutation.mutate,
    pending: mutation.isPending,
    error: mutation.error,
  };
}
