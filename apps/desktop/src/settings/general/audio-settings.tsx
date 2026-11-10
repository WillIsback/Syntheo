import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { ArrowsClockwise } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@syntheo/ui/components/ui/select";
import { cn } from "@syntheo/utils";

import { MicrophoneLevelMeter, SpeakerLevelMeter } from "./microphone-level";

import type { SettingId } from "~/settings/search-index";
import { SETTING_CONTROL_CLASS, SettingRow } from "~/settings/setting-row";
import type { AecModelState } from "~/types/tauri.gen";

type AudioDeviceSetting = {
  value: string;
  devices: string[];
  onChange: (value: string) => void;
  // Détection terminée : une liste vide veut alors dire « aucun périphérique ».
  devicesLoaded?: boolean;
  onSearchAgain?: () => void;
  searching?: boolean;
};

// Ni rétention audio ni empreintes vocales : Syntheo ne conserve jamais l'audio.
export function AudioSettingsView({
  microphoneDevice,
  speakerDevice,
  echoCancellation,
}: {
  microphoneDevice: AudioDeviceSetting;
  // Sortie capturée comme son système (issue 450) ; absente quand la
  // plateforme ne permet pas de la choisir (macOS).
  speakerDevice?: AudioDeviceSetting & {
    // Sortie réellement capturée, ou celle que capterait une écoute.
    captured?: string | null;
  };
  // Modèles d'annulation d'écho téléchargés au premier usage (issue 509).
  echoCancellation?: EchoCancellationStatus;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AudioDeviceRow
        settingId="meetings-microphone"
        title={<Trans>Microphone</Trans>}
        description={
          <Trans>Choose the microphone that captures your voice.</Trans>
        }
        value={microphoneDevice.value}
        devices={microphoneDevice.devices}
        onChange={microphoneDevice.onChange}
        devicesLoaded={microphoneDevice.devicesLoaded}
        onSearchAgain={microphoneDevice.onSearchAgain}
        searching={microphoneDevice.searching}
        meter={<MicrophoneLevelMeter device={microphoneDevice.value} />}
      />
      {speakerDevice ? (
        <AudioDeviceRow
          settingId="meetings-system-audio"
          title={<Trans>System sound</Trans>}
          description={
            <Trans>
              Choose the output whose sound Syntheo transcribes: the one where
              you hear the other participants.
            </Trans>
          }
          defaultLabel={<Trans>Current default output</Trans>}
          unavailableLabel={
            <Trans>(Unavailable — using the default output)</Trans>
          }
          emptyMessage={
            <Trans>
              No audio output detected. Plug in headphones or speakers, then
              search again.
            </Trans>
          }
          value={speakerDevice.value}
          devices={speakerDevice.devices}
          onChange={speakerDevice.onChange}
          devicesLoaded={speakerDevice.devicesLoaded}
          onSearchAgain={speakerDevice.onSearchAgain}
          searching={speakerDevice.searching}
          meter={<SpeakerLevelMeter device={speakerDevice.value} />}
          hint={
            speakerDevice.captured ? (
              <p className="text-muted-foreground text-xs" role="status">
                <Trans>Captured right now:</Trans>{" "}
                <span className="text-foreground font-medium">
                  {speakerDevice.captured}
                </span>
              </p>
            ) : null
          }
        />
      ) : null}
      {echoCancellation ? (
        <EchoCancellationRow
          state={echoCancellation.state}
          onRetry={echoCancellation.onRetry}
        />
      ) : null}
    </div>
  );
}

type EchoCancellationStatus = {
  state: AecModelState | undefined;
  onRetry: () => void;
};

// L'annulation d'écho n'a pas de réglage : la ligne n'apparaît que lorsque ses
// modèles manquent, pour dire que l'écoute marche sans et proposer un nouvel
// essai sans attendre le prochain automatique.
function EchoCancellationRow({ state, onRetry }: EchoCancellationStatus) {
  if (state !== "failed" && state !== "downloading") {
    return null;
  }

  return (
    <SettingRow
      title={<Trans>Echo cancellation</Trans>}
      description={
        <span role="status">
          {state === "failed" ? (
            <Trans>
              Unavailable: the models could not be downloaded (offline?).
              Listening works without it.
            </Trans>
          ) : (
            <Trans>Downloading the echo cancellation models…</Trans>
          )}
        </span>
      }
    >
      {(labelProps) =>
        state === "failed" ? (
          <Button
            aria-describedby={labelProps["aria-describedby"]}
            type="button"
            variant="outline"
            className={SETTING_CONTROL_CLASS}
            onClick={onRetry}
          >
            <ArrowsClockwise aria-hidden="true" className="size-4" />
            <Trans>Retry</Trans>
          </Button>
        ) : null
      }
    </SettingRow>
  );
}

const SYSTEM_DEFAULT_DEVICE = "__system_default_device__";

export function AudioDeviceRow({
  title,
  description,
  value,
  devices,
  onChange,
  settingId,
  devicesLoaded = false,
  onSearchAgain,
  searching = false,
  meter,
  hint,
  defaultLabel = <Trans>Current default</Trans>,
  unavailableLabel = <Trans>(Unavailable — using current default)</Trans>,
  emptyMessage = (
    <Trans>
      No microphone detected. Plug in a microphone or check permissions.
    </Trans>
  ),
}: {
  title: ReactNode;
  description: ReactNode;
  value: string;
  devices: string[];
  onChange: (value: string) => void;
  settingId?: SettingId;
  devicesLoaded?: boolean;
  onSearchAgain?: () => void;
  searching?: boolean;
  meter?: ReactNode;
  hint?: ReactNode;
  defaultLabel?: ReactNode;
  unavailableLabel?: ReactNode;
  emptyMessage?: ReactNode;
}) {
  const availableDevices = [...new Set(devices)].sort((a, b) =>
    a.localeCompare(b),
  );

  // Aucun périphérique (issue 419, VM sans carte son) : un message clair et
  // une nouvelle détection plutôt qu'une liste vide.
  if (devicesLoaded && availableDevices.length === 0 && onSearchAgain) {
    return (
      <SettingRow
        title={title}
        description={<span role="status">{emptyMessage}</span>}
        settingId={settingId}
      >
        {(labelProps) => (
          <Button
            aria-describedby={labelProps["aria-describedby"]}
            type="button"
            variant="outline"
            className={SETTING_CONTROL_CLASS}
            disabled={searching}
            onClick={onSearchAgain}
          >
            <ArrowsClockwise
              aria-hidden="true"
              className={cn([
                "size-4",
                searching && "animate-spin motion-reduce:animate-none",
              ])}
            />
            <Trans>Search again</Trans>
          </Button>
        )}
      </SettingRow>
    );
  }

  const selectedDeviceUnavailable =
    Boolean(value) && !availableDevices.includes(value);
  if (selectedDeviceUnavailable) {
    availableDevices.unshift(value);
  }

  return (
    <SettingRow title={title} description={description} settingId={settingId}>
      {(labelProps) => (
        <div className="flex w-full min-w-0 flex-col gap-2">
          <Select
            value={value || SYSTEM_DEFAULT_DEVICE}
            onValueChange={(device) =>
              onChange(device === SYSTEM_DEFAULT_DEVICE ? "" : device)
            }
          >
            <SelectTrigger {...labelProps} className={SETTING_CONTROL_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value={SYSTEM_DEFAULT_DEVICE}>
                {defaultLabel}
              </SelectItem>
              {availableDevices.map((device) => (
                <SelectItem key={device} value={device}>
                  {device}
                  {selectedDeviceUnavailable && device === value ? (
                    <> {unavailableLabel}</>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {meter}
          {hint}
        </div>
      )}
    </SettingRow>
  );
}
