import { useLingui } from "@lingui/react/macro";

import { cn } from "@syntheo/utils";

import {
  type ServerConnectionState,
  type ServerKind,
  useServerConnection,
} from "~/settings/ai/shared/server-connection";
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

function useStatusLabel(kind: ServerKind, state: ServerConnectionState) {
  const { t } = useLingui();
  if (kind === "stt") {
    switch (state.status) {
      case "connected":
        return t`Transcription · connected`;
      case "failed":
        return t`Transcription · unreachable`;
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
      return t`Synthesis · unreachable`;
    case "testing":
      return t`Synthesis · testing…`;
    case "untested":
      return t`Synthesis · not tested`;
    case "unconfigured":
      return t`Synthesis · no server`;
  }
}

// Transcription : la source « Sur ce poste », quand elle est choisie, passe
// avant l'état du serveur (même règle que le toast et le bandeau).
function useStatus(kind: ServerKind): { label: string; tone: Tone } {
  const { t } = useLingui();
  const { state } = useServerConnection(kind);
  const serverLabel = useStatusLabel(kind, state);
  const transcription = useUsableTranscription();
  if (kind === "stt" && transcription.isLoading) {
    return { label: t`Transcription · checking…`, tone: "idle" };
  }
  if (kind === "stt" && transcription.active === "on_device") {
    return { label: t`Transcription · on this computer`, tone: "ok" };
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
  const { label, tone } = useStatus(kind);
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
