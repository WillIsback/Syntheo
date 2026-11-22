import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useStore } from "zustand";

import type { DegradedError } from "@syntheo/plugin-transcription";

import { listenerStore } from "~/store/zustand/listener/instance";
import {
  ON_DEVICE_COMMISSIONING_QUERY_KEY,
  ON_DEVICE_STATUS_QUERY_KEY,
} from "~/stt/on-device";

/** L'écoute s'est arrêtée parce que le système refuse d'exécuter le module. */
export function isExecutionBlocked(degraded: DegradedError | null): boolean {
  return (
    degraded?.type === "on_device_unavailable" &&
    degraded.reason === "execution_blocked"
  );
}

// QA 0.8.0-3 : un refus d'exécution pendant une écoute, après une mise en
// service réussie, retire le profil côté hôte (speech-host). La carte « Sur ce
// poste » et le statut de la transcription relisent alors l'état, au lieu de
// garder « prêt » jusqu'au prochain rechargement.
export function OnDeviceRefusalSync() {
  const blocked = useStore(listenerStore, (state) =>
    isExecutionBlocked(state.live.degraded),
  );
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!blocked) return;
    void queryClient.invalidateQueries({
      queryKey: ON_DEVICE_COMMISSIONING_QUERY_KEY,
    });
    void queryClient.invalidateQueries({
      queryKey: ON_DEVICE_STATUS_QUERY_KEY,
    });
  }, [blocked, queryClient]);
  return null;
}
