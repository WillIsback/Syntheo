import { useLingui } from "@lingui/react/macro";

import {
  type Icon as IconComponent,
  Microphone,
  MicrophoneSlash,
  SpeakerHigh,
  SpeakerX,
} from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import {
  ariaShortcut,
  type ShortcutId,
  type ShortcutPlatform,
  shortcutTooltip,
} from "~/shared/shortcuts";

// Couper le micro ou le son système pendant l'écoute (issue 447) : deux
// bascules entre le niveau sonore et « Mettre en pause ». Coupée, l'icône
// passe sur fond `recording`, barrée ; l'infobulle dit ce que fait le clic.
export function ChannelToggles({
  micMuted,
  speakerMuted,
  onToggleMic,
  onToggleSpeaker,
  disabled,
  os,
}: {
  micMuted: boolean;
  speakerMuted: boolean;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  disabled?: boolean;
  os: ShortcutPlatform;
}) {
  const { t } = useLingui();

  return (
    <>
      <ChannelToggle
        channel="mic"
        muted={micMuted}
        onClick={onToggleMic}
        disabled={disabled}
        label={t`Mute the microphone`}
        action={micMuted ? t`Unmute the microphone` : t`Mute the microphone`}
        icon={micMuted ? MicrophoneSlash : Microphone}
        shortcut="toggleMicrophone"
        os={os}
      />
      <ChannelToggle
        channel="speaker"
        muted={speakerMuted}
        onClick={onToggleSpeaker}
        disabled={disabled}
        label={t`Mute system audio`}
        action={speakerMuted ? t`Unmute system audio` : t`Mute system audio`}
        icon={speakerMuted ? SpeakerX : SpeakerHigh}
        shortcut="toggleSystemAudio"
        os={os}
      />
    </>
  );
}

function ChannelToggle({
  channel,
  muted,
  onClick,
  disabled,
  label,
  action,
  icon: Icon,
  shortcut,
  os,
}: {
  channel: "mic" | "speaker";
  muted: boolean;
  onClick: () => void;
  disabled?: boolean;
  // Nom accessible constant ; `aria-pressed` dit si le canal est coupé.
  label: string;
  // Infobulle : ce que fait le clic, avec le raccourci.
  action: string;
  icon: IconComponent;
  shortcut: ShortcutId;
  os: ShortcutPlatform;
}) {
  return (
    <button
      type="button"
      data-channel-toggle={channel}
      aria-label={label}
      aria-pressed={muted}
      aria-keyshortcuts={ariaShortcut(shortcut, os)}
      title={shortcutTooltip(action, shortcut, os)}
      onClick={onClick}
      disabled={disabled}
      className={cn([
        "rounded-pill grid size-8 shrink-0 place-items-center transition-colors",
        "focus-visible:ring-primary-foreground focus-visible:ring-offset-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        "disabled:cursor-default disabled:opacity-60",
        muted
          ? "bg-recording text-background hover:brightness-110"
          : "hover:bg-primary-foreground/10",
      ])}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
