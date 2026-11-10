import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type AecModelState, commands } from "~/types/tauri.gen";

// Modèles d'annulation d'écho téléchargés au premier usage (issue 429) : tant
// qu'ils manquent, l'écoute marche sans annulation d'écho (issue 509).
export const AEC_MODEL_STATUS_QUERY_KEY = ["aec-model-status"] as const;

// L'état vit en mémoire côté natif : le relire est gratuit. On cesse dès que
// les modèles sont prêts, ils ne repartent plus.
const POLL_MS = 5_000;

async function loadAecModelState(): Promise<AecModelState> {
  const result = await commands.getAecModelStatus();
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data.state;
}

export function useAecModelState(enabled = true) {
  return useQuery({
    queryKey: AEC_MODEL_STATUS_QUERY_KEY,
    queryFn: loadAecModelState,
    enabled,
    refetchInterval: (query) =>
      query.state.data === "ready" ? false : POLL_MS,
  }).data;
}

export function useRetryAecModelDownload() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await commands.retryAecModelDownload();
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data.state;
    },
    onSuccess: (state) => {
      queryClient.setQueryData(AEC_MODEL_STATUS_QUERY_KEY, state);
    },
  });
  return mutation.mutate;
}
