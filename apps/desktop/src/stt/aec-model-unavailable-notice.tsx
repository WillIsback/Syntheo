import { t } from "@lingui/core/macro";
import { useEffect } from "react";

import { toast } from "@syntheo/ui/components/ui/toast";

import { useAecModelState, useRetryAecModelDownload } from "./aec-model-status";

import { useListener } from "~/stt/contexts";

// Pendant une écoute, prévient sans bloquer quand l'annulation d'écho est
// inactive faute de modèles (premier lancement hors ligne, issue 509), comme
// les autres changements audio (issues 433, 450). Paramètres › Audio garde
// l'indication tant que les modèles manquent.
export function AecModelUnavailableNotice() {
  const active = useListener((state) => state.live.status === "active");
  const sessionId = useListener((state) => state.live.sessionId);
  const modelState = useAecModelState(active);
  const retry = useRetryAecModelDownload();

  useEffect(() => {
    if (!active || !sessionId) {
      return;
    }
    const id = `aec-model-unavailable-${sessionId}`;
    if (modelState === "ready") {
      toast.dismiss(id);
      return;
    }
    if (modelState !== "failed") {
      return;
    }
    toast.warning(t`Echo cancellation unavailable`, {
      id,
      description: t`The models could not be downloaded (offline?). Listening continues without it.`,
      action: { label: t`Retry`, onClick: () => retry() },
    });
  }, [active, sessionId, modelState, retry]);

  return null;
}
