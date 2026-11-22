import type { OnDeviceStatus } from "@syntheo/plugin-transcription";

import { useConfigValues } from "~/shared/config";
import { isConfiguredSttModel } from "~/stt/capabilities";
import {
  isOnDeviceUsable,
  useOnDeviceCommissioning,
  useOnDeviceStatus,
} from "~/stt/on-device";

/** Source de la transcription en direct. */
export type TranscriptionSource = "server" | "on_device";

export type UsableTranscription = {
  /** Une écoute peut être transcrite : serveur configuré, ou « Sur ce poste »
   * choisi et prêt. */
  usable: boolean;
  /** Source active de l'écoute, si elle peut servir. */
  active: TranscriptionSource | null;
  /** Un serveur de transcription est configuré (import de fichiers, dictée). */
  serverConfigured: boolean;
  /** « Sur ce poste » est choisi (et autorisé) mais pas prêt : modèles
   * absents ou poste non mesuré. */
  onDeviceNotReady: boolean;
};

/**
 * Seule règle de « transcription utilisable » (toast, bandeau, statut des
 * serveurs) : un serveur configuré, ou la source « Sur ce poste » choisie,
 * autorisée, avec compagnon et modèles installés et un profil retenu par la
 * mise en service.
 */
export function resolveUsableTranscription({
  serverConfigured,
  onDeviceChosen,
  onDeviceStatus,
  commissionedProfile,
}: {
  serverConfigured: boolean;
  onDeviceChosen: boolean;
  onDeviceStatus: OnDeviceStatus | null | undefined;
  commissionedProfile: string | null | undefined;
}): UsableTranscription {
  // Source interdite par l'organisation : ignorée, comme pour l'écoute.
  const chosen = onDeviceChosen && onDeviceStatus?.allowed !== false;
  const onDeviceReady =
    chosen && isOnDeviceUsable(onDeviceStatus) && !!commissionedProfile;
  return {
    usable: serverConfigured || onDeviceReady,
    active: onDeviceReady ? "on_device" : serverConfigured ? "server" : null,
    serverConfigured,
    onDeviceNotReady: chosen && !!onDeviceStatus && !onDeviceReady,
  };
}

export function useUsableTranscription(): UsableTranscription {
  const { current_stt_provider, current_stt_model, stt_on_device } =
    useConfigValues([
      "current_stt_provider",
      "current_stt_model",
      "stt_on_device",
    ] as const);
  const status = useOnDeviceStatus();
  const installed = isOnDeviceUsable(status.data);
  const commissioning = useOnDeviceCommissioning(!!stt_on_device && installed);
  return resolveUsableTranscription({
    serverConfigured: isConfiguredSttModel(
      current_stt_provider as string | undefined,
      current_stt_model as string | undefined,
    ),
    onDeviceChosen: !!stt_on_device,
    onDeviceStatus: status.data,
    commissionedProfile: commissioning.data?.profile,
  });
}
