import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

import { cn } from "@syntheo/utils";

import {
  type ServerConnectionState,
  type ServerKind,
  useServerConnection,
} from "~/settings/ai/shared/server-connection";
import { useServerFailureLabel } from "~/settings/ai/shared/server-failure-label";
import { requestSettingFocus } from "~/settings/setting-focus";
import { useTabs } from "~/store/zustand/tabs";
import { useUsableTranscription } from "~/stt/usable-transcription";

// État des serveurs dans le menu des paramètres : une pastille à côté de
// « Transcription » et « Synthèse », et un rappel en bas du menu. C'est la
// seule mention technique que l'interface garde (README, principe 1).

type Tone = "ok" | "ko" | "idle";

function toneOf(state: ServerConnectionState): Tone {
  if (state.status === "connected") return "ok";
  if (state.status === "failed") return "ko";
  return "idle";
}

function StatusPip({ tone }: { tone: Tone }) {
  return (
    <i
      aria-hidden
      className={cn([
        "inline-block size-[7px] shrink-0 rounded-full",
        tone === "ok" && "bg-primary",
        tone === "ko" && "bg-destructive",
        tone === "idle" && "border-faint border",
      ])}
    />
  );
}

// Échec : même raison que la pastille de la carte serveur, par la même
// fonction (issue 713, issue 786) ; une clé refusée, une route absente ou
// une erreur du serveur ne sont pas un serveur injoignable.
function lowerFirst(label: string) {
  return label.charAt(0).toLocaleLowerCase() + label.slice(1);
}

function useStatusLabel(kind: ServerKind, state: ServerConnectionState) {
  const { t } = useLingui();
  const failureLabel = useServerFailureLabel();
  const reason =
    state.status === "failed" ? lowerFirst(failureLabel(state.failure)) : "";
  if (kind === "stt") {
    switch (state.status) {
      case "connected":
        return t`Transcription · connected`;
      case "failed":
        return t`Transcription · ${reason}`;
      case "testing":
        return t`Transcription · testing…`;
      case "untested":
        return t`Transcription · not tested`;
      case "unconfigured":
        return t`Transcription · no server`;
    }
  }
  switch (state.status) {
    case "connected":
      return t`Synthesis · connected`;
    case "failed":
      return t`Synthesis · ${reason}`;
    case "testing":
      return t`Synthesis · testing…`;
    case "untested":
      return t`Synthesis · not tested`;
    case "unconfigured":
      return t`Synthesis · no server`;
  }
}

// Arrivée sur « Mettre à jour les modèles » de la carte « Sur ce poste »
// (issue 763) : même destination que l'action du toast.
function useOpenOnDeviceModels() {
  const currentTab = useTabs((state) => state.currentTab);
  const updateSettingsTabState = useTabs(
    (state) => state.updateSettingsTabState,
  );
  const openNew = useTabs((state) => state.openNew);
  return useCallback(() => {
    requestSettingFocus("stt-on-device-module");
    if (currentTab?.type === "settings") {
      updateSettingsTabState(currentTab, { tab: "transcription" });
    } else {
      openNew({ type: "settings", state: { tab: "transcription" } });
    }
  }, [currentTab, openNew, updateSettingsTabState]);
}

type Status = { label: string; tone: Tone; onAction?: () => void };

// Transcription : la source « Sur ce poste », quand elle est choisie, passe
// avant l'état du serveur (même règle que le toast et le bandeau).
function useStatus(kind: ServerKind): Status {
  const { t } = useLingui();
  const { state, disabled } = useServerConnection(kind);
  const serverLabel = useStatusLabel(kind, state);
  const transcription = useUsableTranscription();
  const openOnDeviceModels = useOpenOnDeviceModels();
  // Synthèse désactivée par réglage géré (intelligence_disabled) : aucune
  // sonde ne part, l'état « non testée » serait trompeur (issue 707).
  if (disabled) {
    return { label: t`Synthesis · disabled`, tone: "idle" };
  }
  if (kind === "stt" && transcription.isLoading) {
    return { label: t`Transcription · checking…`, tone: "idle" };
  }
  if (kind === "stt" && transcription.active === "on_device") {
    return { label: t`Transcription · on this computer`, tone: "ok" };
  }
  // Modèles d'une autre version (issue 763) : dire la mise à jour, pas
  // seulement « pas prêt », et y mener d'un clic comme le toast.
  if (kind === "stt" && transcription.onDeviceModelsUpdate) {
    return {
      label: t`Transcription · models need an update`,
      tone: "ko",
      onAction: openOnDeviceModels,
    };
  }
  if (kind === "stt" && transcription.onDeviceNotReady) {
    return { label: t`Transcription · this computer is not ready`, tone: "ko" };
  }
  return { label: serverLabel, tone: toneOf(state) };
}

export function ServerStatusDot({ kind }: { kind: ServerKind }) {
  const { label, tone } = useStatus(kind);
  return (
    <span className="ml-auto flex items-center" title={label}>
      <StatusPip tone={tone} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ServerStatusLine({ kind }: { kind: ServerKind }) {
  const { label, tone, onAction } = useStatus(kind);
  if (onAction) {
    return (
      <button
        type="button"
        onClick={onAction}
        className="hover:text-foreground flex items-center gap-2 text-left underline-offset-2 hover:underline"
      >
        <StatusPip tone={tone} />
        {label}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <StatusPip tone={tone} />
      {label}
    </span>
  );
}

export function ServersHealthFooter() {
  const { t } = useLingui();
  return (
    <div
      role="status"
      aria-label={t`Server status`}
      className="border-border text-muted-foreground mt-auto flex flex-col gap-1 border-t px-2 pt-2.5 pb-0.5 text-xs"
    >
      <ServerStatusLine kind="stt" />
      <ServerStatusLine kind="llm" />
    </div>
  );
}
