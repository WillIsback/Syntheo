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

import { MicrophoneLevelMeter } from "./microphone-level";

import type { SettingId } from "~/settings/search-index";
import { SETTING_CONTROL_CLASS, SettingRow } from "~/settings/setting-row";

// Ni rétention audio ni empreintes vocales : Syntheo ne conserve jamais l'audio.
export function AudioSettingsView({
  microphoneDevice,
}: {
  microphoneDevice: {
    value: string;
    devices: string[];
    onChange: (value: string) => void;
    // Détection terminée : une liste vide veut alors dire « aucun micro ».
    devicesLoaded?: boolean;
    onSearchAgain?: () => void;
    searching?: boolean;
  };
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
    </div>
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
}) {
  const availableDevices = [...new Set(devices)].sort((a, b) =>
    a.localeCompare(b),
  );

  // Aucun périphérique d'entrée (issue 419, VM sans carte son) : un message
  // clair et une nouvelle détection plutôt qu'une liste vide.
  if (devicesLoaded && availableDevices.length === 0 && onSearchAgain) {
    return (
      <SettingRow
        title={title}
        description={
          <span role="status">
            <Trans>
              No microphone detected. Plug in a microphone or check permissions.
            </Trans>
          </span>
        }
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
                <Trans>Current default</Trans>
              </SelectItem>
              {availableDevices.map((device) => (
                <SelectItem key={device} value={device}>
                  {device}
                  {selectedDeviceUnavailable && device === value ? (
                    <>
                      {" "}
                      <Trans>(Unavailable — using current default)</Trans>
                    </>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {meter}
        </div>
      )}
    </SettingRow>
  );
}
