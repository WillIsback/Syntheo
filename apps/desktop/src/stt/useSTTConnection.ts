import { useMemo } from "react";

import type { AIProviderStorage } from "@syntheo/store";

import { type ProviderId, PROVIDERS } from "~/settings/ai/stt/shared";
import { useAiProvidersState } from "~/settings/providers";
import { useSettingsReady } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";
import { getDefaultSttModel } from "~/stt/model-selection";
import {
  ON_DEVICE_BASE_URL,
  onDeviceUnavailability,
  useOnDeviceStatus,
} from "~/stt/on-device";

/**
 * Source « Sur ce poste » choisie : connexion au module local, ou aucune si
 * le module manque. Une source interdite par l'organisation est ignorée : la
 * transcription repasse par le serveur configuré.
 */
export function resolveOnDeviceConnection({
  chosen,
  allowed,
  installed,
}: {
  chosen: boolean;
  allowed: boolean | undefined;
  installed: boolean;
}) {
  if (!chosen || allowed === false) return undefined;
  if (!installed) return null;
  return {
    provider: "nvidia" as ProviderId,
    model: getDefaultSttModel("nvidia") ?? "",
    baseUrl: ON_DEVICE_BASE_URL,
    apiKey: "",
  };
}

export const useSTTConnection = () => {
  const settingsReady = useSettingsReady();
  const { current_stt_provider, current_stt_model, stt_on_device } =
    useConfigValues([
      "current_stt_provider",
      "current_stt_model",
      "stt_on_device",
    ] as const) as {
      current_stt_provider: ProviderId | undefined;
      current_stt_model: string | undefined;
      stt_on_device: boolean | undefined;
    };
  const onDevice = useOnDeviceStatus();

  const { providers, isReady: providerConfigReady } =
    useAiProvidersState("stt");
  const providerConfig = (
    current_stt_provider ? providers[`stt:${current_stt_provider}`] : undefined
  ) as AIProviderStorage | undefined;

  const serverConnection = useMemo(() => {
    if (!current_stt_provider || !current_stt_model) {
      return null;
    }

    // Un réglage hérité peut désigner un provider retiré ou désactivé : aucune
    // connexion, même si sa configuration (URL cloud, clé) est encore stockée.
    const provider = PROVIDERS.find(({ id }) => id === current_stt_provider);
    if (!provider || provider.disabled) {
      return null;
    }

    // Aucune URL n'est livrée par défaut : seule l'URL enregistrée compte.
    const baseUrl = providerConfig?.base_url?.trim() || "";

    // Les endpoints on-prem n'exigent pas forcément de clé.
    if (!baseUrl) {
      return null;
    }

    // Le protocole est désigné explicitement : un hôte on-prem ne permet pas
    // de le deviner.
    const url = new URL(baseUrl);
    url.searchParams.set("provider", current_stt_provider);
    return {
      provider: current_stt_provider,
      model: current_stt_model,
      baseUrl: url.toString(),
      apiKey: providerConfig?.api_key?.trim() ?? "",
    };
  }, [current_stt_provider, current_stt_model, providerConfig]);

  // Écoute en direct : la source « Sur ce poste » si elle est choisie. La
  // dictée et la transcription de fichiers passent toujours par le serveur
  // (`serverConn`) : le module ne fait que le direct d'une écoute.
  const connection = useMemo(() => {
    const local = resolveOnDeviceConnection({
      chosen: !!stt_on_device,
      allowed: onDevice.data?.allowed,
      installed:
        !!onDevice.data?.companion && onDevice.data.models.kind === "installed",
    });
    return local === undefined ? serverConnection : local;
  }, [serverConnection, stt_on_device, onDevice.data]);

  // « Sur ce poste » choisi mais module absent (`conn` null) : la raison, pour
  // que le démarrage d'une écoute ne parle pas d'un fournisseur manquant
  // (issue 763).
  const onDeviceUnavailable =
    !!stt_on_device && onDevice.data?.allowed
      ? onDeviceUnavailability(onDevice.data)
      : null;

  return {
    conn: connection,
    onDeviceUnavailable,
    serverConn: serverConnection,
    isReady: settingsReady && connection !== null && providerConfigReady,
    // Réglages ou fournisseurs encore en chargement : `conn` null ne veut pas
    // encore dire « aucun fournisseur » (issue 515).
    isLoading:
      !settingsReady ||
      !providerConfigReady ||
      (!!stt_on_device && onDevice.isLoading),
  };
};
