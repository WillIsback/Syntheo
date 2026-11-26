import { t } from "@lingui/core/macro";

import type { ToastCondition, ToastType } from "./types";

import type { DevtoolsToastPreview } from "~/store/zustand/devtools-toast-preview";

type ToastRegistryEntry = {
  toast: ToastType;
  condition: ToastCondition;
};

type ToastRegistryParams = {
  // Mise à jour intégrée (issue 593) : version annoncée, si elle existe.
  availableUpdate?: string | null;
  onOpenUpdate?: () => void;
  hasLLMConfigured: boolean;
  // Synthèse coupée par l'administration (intelligence_disabled) : aucun
  // modèle de langage à demander (issue 707).
  llmManagedOff?: boolean;
  hasSttConfigured: boolean;
  // « Sur ce poste » choisi mais pas prêt (modèles absents, poste non
  // mesuré) : l'écoute est en pause, un serveur n'y changerait rien.
  onDeviceNotReady?: boolean;
  // Pas prêt parce que ses modèles viennent d'une autre version (issue 763) :
  // le toast propose la mise à jour.
  onDeviceModelsUpdate?: boolean;
  onUpdateOnDeviceModels?: () => void;
  isAiTranscriptionTabActive: boolean;
  isAiIntelligenceTabActive: boolean;
  onOpenLLMSettings: () => void;
  onOpenSTTSettings: () => void;
};

type DevtoolsToastPreviewParams = {
  preview: DevtoolsToastPreview;
  onOpenLLMSettings: () => void;
  onOpenSTTSettings: () => void;
};

export function createToastRegistry({
  availableUpdate = null,
  onOpenUpdate = () => {},
  hasLLMConfigured,
  llmManagedOff = false,
  hasSttConfigured,
  onDeviceNotReady = false,
  onDeviceModelsUpdate = false,
  onUpdateOnDeviceModels,
  isAiTranscriptionTabActive,
  isAiIntelligenceTabActive,
  onOpenLLMSettings,
  onOpenSTTSettings,
}: ToastRegistryParams): ToastRegistryEntry[] {
  const hasUsableSttConfigured = hasSttConfigured;
  const hasUsableLlmConfigured = hasLLMConfigured || llmManagedOff;

  // order matters
  return [
    {
      toast: {
        id: "update-available",
        description: t`Version ${availableUpdate ?? ""} is available`,
        detail: t`See what's new and update from Settings.`,
        primaryAction: {
          label: t`See the update`,
          onClick: onOpenUpdate,
        },
        // Fermé pour cette session : il revient au prochain lancement, ou pour
        // une version plus récente.
        lifecycle: {
          type: "persistent",
          dismissal: "session",
          dismissalId: `update-available-${availableUpdate ?? ""}`,
        },
      },
      condition: () => availableUpdate !== null,
    },
    {
      toast: {
        id: "missing-stt",
        description: t`Transcription provider needed`,
        primaryAction: {
          label: t`Add`,
          onClick: onOpenSTTSettings,
        },
        // Issue 778 : à 910×600, il recouvrait « Commencer l'écoute ». Fermé
        // pour cette session seulement, comme la demande de modèle de langage
        // (issue 632) ; l'onglet Transcription le dit aussi.
        lifecycle: { type: "persistent", dismissal: "session" },
      },
      condition: () => !hasUsableSttConfigured && !isAiTranscriptionTabActive,
    },
    {
      toast: {
        id: "on-device-models-update",
        description: t`The transcription models of this computer need an update`,
        primaryAction: {
          label: t`Update the models`,
          onClick: onUpdateOnDeviceModels ?? onOpenSTTSettings,
        },
        // Fermable pour la session : un toast persistant ne doit pas masquer
        // la capsule dans une petite fenêtre (issue 778).
        lifecycle: { type: "persistent", dismissal: "session" },
      },
      condition: () =>
        onDeviceNotReady && onDeviceModelsUpdate && !isAiTranscriptionTabActive,
    },
    {
      toast: {
        id: "on-device-not-ready",
        description: t`Transcription on this computer is not ready`,
        primaryAction: {
          label: t`Open`,
          onClick: onOpenSTTSettings,
        },
        // Issue 778 : tout toast persistant se ferme pour la session.
        lifecycle: { type: "persistent", dismissal: "session" },
      },
      condition: () => onDeviceNotReady && !isAiTranscriptionTabActive,
    },
    {
      toast: {
        id: "missing-llm",
        description: t`Language model needed`,
        primaryAction: {
          label: t`Add`,
          onClick: onOpenLLMSettings,
        },
        // Issue 632 : dans une fenêtre étroite, il recouvrait la capsule et le
        // bouton Export sans pouvoir être écarté. Fermé pour cette session :
        // il revient au prochain lancement tant qu'aucun modèle n'est ajouté ;
        // l'onglet Synthèse le dit aussi (« Configurez les synthèses par IA »).
        lifecycle: { type: "persistent", dismissal: "session" },
      },
      condition: () =>
        hasUsableSttConfigured &&
        !hasUsableLlmConfigured &&
        !isAiIntelligenceTabActive,
    },
  ];
}

export function getToastToShow(
  registry: ToastRegistryEntry[],
  isDismissed: (toast: ToastType) => boolean,
): ToastType | null {
  for (const entry of registry) {
    if (
      entry.condition() &&
      (entry.toast.lifecycle.type === "condition-bound" ||
        !isDismissed(entry.toast))
    ) {
      return entry.toast;
    }
  }
  return null;
}

export function createDevtoolsToastPreview({
  preview,
  onOpenLLMSettings,
  onOpenSTTSettings,
}: DevtoolsToastPreviewParams): ToastType {
  switch (preview) {
    case "language-model":
      return {
        id: "devtools-missing-llm",
        description: t`Language model needed`,
        primaryAction: {
          label: t`Add`,
          onClick: onOpenLLMSettings,
        },
        lifecycle: { type: "condition-bound" },
      };
    case "transcription-model":
      return {
        id: "devtools-missing-stt",
        description: t`Transcription provider needed`,
        primaryAction: {
          label: t`Add`,
          onClick: onOpenSTTSettings,
        },
        lifecycle: { type: "condition-bound" },
      };
    case "transcription-error":
      return {
        id: "devtools-local-stt-unreachable",
        description: t`Transcription unavailable`,
        primaryAction: {
          label: t`Settings`,
          onClick: onOpenSTTSettings,
        },
        lifecycle: { type: "condition-bound" },
        variant: "error",
      };
  }
}
