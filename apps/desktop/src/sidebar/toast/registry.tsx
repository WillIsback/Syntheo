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
        lifecycle: { type: "condition-bound" },
      },
      condition: () => !hasUsableSttConfigured && !isAiTranscriptionTabActive,
    },
    {
      toast: {
        id: "on-device-not-ready",
        description: t`Transcription on this computer is not ready`,
        primaryAction: {
          label: t`Open`,
          onClick: onOpenSTTSettings,
        },
        lifecycle: { type: "condition-bound" },
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
        lifecycle: { type: "condition-bound" },
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
