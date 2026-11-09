import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { commands as listenerCommands } from "@syntheo/plugin-transcription";

import { useSetSettingValues } from "~/settings/queries";

const REFRESH_MS = 3_000;

export async function listSpeakerDevices() {
  const result = await listenerCommands.listSpeakerDevices();
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

export async function getCapturedSpeakerDevice(preferred: string) {
  const result = await listenerCommands.getCapturedSpeakerDevice(
    preferred || null,
  );
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

// Ligne « Son système » des réglages (issue 450) : les sorties qu'on peut
// capturer, celle qui l'est vraiment, et le choix conservé comme le micro.
// `undefined` quand la plateforme ne permet pas de choisir (macOS) : la ligne
// n'est pas affichée.
export function useSpeakerDeviceSetting(value: string, enabled: boolean) {
  const setSettingValues = useSetSettingValues();
  const [searching, setSearching] = useState(false);
  const devicesQuery = useQuery({
    queryKey: ["speaker-devices"],
    queryFn: listSpeakerDevices,
    enabled,
    refetchInterval: REFRESH_MS,
  });
  const supported = Array.isArray(devicesQuery.data);
  const capturedQuery = useQuery({
    queryKey: ["captured-speaker-device", value],
    queryFn: () => getCapturedSpeakerDevice(value),
    enabled: enabled && supported,
    refetchInterval: REFRESH_MS,
  });

  if (!supported) {
    return undefined;
  }

  return {
    value,
    devices: devicesQuery.data ?? [],
    onChange: (device: string) => setSettingValues({ speaker_device: device }),
    devicesLoaded: devicesQuery.isSuccess,
    searching,
    onSearchAgain: () => {
      setSearching(true);
      void Promise.all([
        devicesQuery.refetch(),
        capturedQuery.refetch(),
      ]).finally(() => setSearching(false));
    },
    captured: capturedQuery.data?.name ?? null,
  };
}
