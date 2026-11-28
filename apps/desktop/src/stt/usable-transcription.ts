import type { OnDeviceStatus } from "@syntheo/plugin-transcription";

import { useConfigValues } from "~/shared/config";
import {
  isModelsUpdate,
  isOnDeviceUsable,
  useOnDeviceCommissioning,
  useOnDeviceStatus,
} from "~/stt/on-device";
import { useSTTConnection } from "~/stt/useSTTConnection";

/** Source de la transcription en direct. */
export type TranscriptionSource = "server" | "on_device";

export type UsableTranscription = {
  /** Une écoute peut être transcrite par la source choisie. */
  usable: boolean;
  /** Source active de l'écoute, si elle peut servir. */
  active: TranscriptionSource | null;
  /** Un serveur de transcription est configuré et joignable en principe
   * (fournisseur connu, modèle, adresse enregistrée) : import, dictée. */
  serverConfigured: boolean;
  /** « Sur ce poste » est choisi (et autorisé) mais pas prêt : modèles
   * absents ou poste non mesuré. L'écoute est alors refusée, même avec un
   * serveur configuré : elle ne repasse pas par lui. */
  onDeviceNotReady: boolean;
  /** « Sur ce poste » pas prêt parce que ses modèles viennent d'une autre
   * version : l'état et le toast proposent la mise à jour (issue 763). */
  onDeviceModelsUpdate: boolean;
  /** Aucune source : ni serveur, ni « Sur ce poste » choisi. Seul cas où il
   * faut demander un fournisseur (toast « Fournisseur requis ») ; « Sur ce
   * poste » choisi mais pas prêt a son propre toast. */
  needsProvider: boolean;
  /** État de « Sur ce poste » encore en chargement : rien à conclure. */
  isLoading: boolean;
};

/**
 * Seule règle de « transcription utilisable » (toast, bandeau, statut des
 * serveurs). La source choisie décide, comme pour l'écoute :
 * - « Sur ce poste » choisi et autorisé : utilisable seulement si compagnon
 *   et modèles sont installés et qu'un profil est retenu par la mise en
 *   service ; un serveur configuré n'y change rien ;
 * - sinon : utilisable si un serveur est configuré.
 */
export function resolveUsableTranscription({
  serverConfigured,
  onDeviceChosen,
  onDeviceStatus,
  commissionedProfile,
  isLoading = false,
}: {
  serverConfigured: boolean;
  onDeviceChosen: boolean;
  onDeviceStatus: OnDeviceStatus | null | undefined;
  commissionedProfile: string | null | undefined;
  isLoading?: boolean;
}): UsableTranscription {
  // Source interdite par l'organisation : ignorée, comme pour l'écoute.
  const chosen = onDeviceChosen && onDeviceStatus?.allowed !== false;
  if (isLoading) {
    return {
      usable: false,
      active: null,
      serverConfigured,
      onDeviceNotReady: false,
      onDeviceModelsUpdate: false,
      needsProvider: false,
      isLoading: true,
    };
  }
  if (chosen) {
    const ready = isOnDeviceUsable(onDeviceStatus) && !!commissionedProfile;
    return {
      usable: ready,
      active: ready ? "on_device" : null,
      serverConfigured,
      onDeviceNotReady: !ready,
      onDeviceModelsUpdate:
        !ready &&
        !!onDeviceStatus?.companion &&
        isModelsUpdate(onDeviceStatus.models),
      needsProvider: false,
      isLoading: false,
    };
  }
  return {
    usable: serverConfigured,
    active: serverConfigured ? "server" : null,
    serverConfigured,
    onDeviceNotReady: false,
    onDeviceModelsUpdate: false,
    needsProvider: !serverConfigured,
    isLoading: false,
  };
}

/**
 * Chargement : réglages, fournisseurs ou état du poste (useSTTConnection,
 * issue 515), puis la mise en service quand le poste est choisi et installé.
 */
export function isTranscriptionLoading({
  connectionLoading,
  onDeviceChosen,
  onDeviceInstalled,
  commissioningLoading,
}: {
  connectionLoading: boolean;
  onDeviceChosen: boolean;
  onDeviceInstalled: boolean;
  commissioningLoading: boolean;
}) {
  return (
    connectionLoading ||
    (onDeviceChosen && onDeviceInstalled && commissioningLoading)
  );
}

export function useUsableTranscription(): UsableTranscription {
  const { stt_on_device } = useConfigValues(["stt_on_device"] as const);
  const chosen = !!stt_on_device;
  // Même serveur que l'écoute : fournisseur connu, modèle et adresse.
  const { serverConn, isLoading: connectionLoading } = useSTTConnection();
  const status = useOnDeviceStatus();
  const installed = isOnDeviceUsable(status.data);
  const commissioning = useOnDeviceCommissioning(chosen && installed);
  return resolveUsableTranscription({
    serverConfigured: !!serverConn,
    onDeviceChosen: chosen,
    onDeviceStatus: status.data,
    commissionedProfile: commissioning.data?.profile,
    // Tant que ça charge : ni toast ni statut.
    isLoading: isTranscriptionLoading({
      connectionLoading,
      onDeviceChosen: chosen,
      onDeviceInstalled: installed,
      commissioningLoading: commissioning.isLoading,
    }),
  });
}
