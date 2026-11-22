import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open as selectFile } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import {
  commands as transcriptionCommands,
  type Probe,
  type Profile,
  type Refusal,
} from "@syntheo/plugin-transcription";
import { CircleNotch } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import { ServerCard } from "~/settings/ai/shared/server-card";
import { useSetSettingValues } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";
import {
  isEligible,
  ON_DEVICE_STATUS_QUERY_KEY,
  runOnDeviceProbe,
  useOnDeviceStatus,
} from "~/stt/on-device";

// Carte « Sur ce poste » (issue 685) : sonde du poste, module installé,
// choix de la source. Masquée quand l'organisation interdit le module.

function formatSize(bytes: number) {
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

function useLabels() {
  const { t } = useLingui();
  const profile: Record<Profile, string> = {
    two_streams_diarized: t`microphone and system audio, with speakers`,
    two_streams: t`microphone and system audio, without speakers`,
    one_stream_diarized: t`one audio stream, with speakers`,
    one_stream: t`one audio stream, without speakers`,
  };
  const refusal: Record<Refusal, string> = {
    no_avx2: t`the processor lacks AVX2 instructions`,
    not_enough_memory: t`not enough free memory (1.5 GB needed)`,
    not_enough_disk: t`not enough free disk space (2 GB needed)`,
    disk_unknown: t`the data disk could not be checked`,
    too_slow: t`the processor is too slow for live transcription`,
  };
  return { profile, refusal };
}

export function ProbeVerdict({ probe }: { probe: Probe }) {
  const { t } = useLingui();
  const labels = useLabels();
  const verdict = probe.verdict;
  let text: string;
  switch (verdict.kind) {
    case "propose":
      text = t`This computer can transcribe your meetings on its own: ${labels.profile[verdict.profile]}.`;
      break;
    case "propose_degraded":
      text = t`This computer can transcribe with a reduced profile: ${labels.profile[verdict.profile]}.`;
      break;
    case "refuse":
      text = t`This computer is not eligible: ${verdict.reasons.map((r) => labels.refusal[r]).join(", ")}.`;
      break;
    case "interrupted":
      text = t`The test was interrupted by a recording. Run it again.`;
      break;
  }
  return (
    <div data-testid="on-device-verdict" className="flex flex-col gap-1">
      <p className="text-[13px]">{text}</p>
      {probe.powerAdvice ? (
        <p className="text-muted-foreground text-[13px]">
          <Trans>
            The computer is on battery or in power saving mode: plug it in or
            switch to performance mode, then run the test again.
          </Trans>
        </p>
      ) : null}
    </div>
  );
}

export function OnDeviceCard() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const status = useOnDeviceStatus();
  const { stt_on_device } = useConfigValues(["stt_on_device"] as const);
  const setSettings = useSetSettingValues();
  const [probe, setProbe] = useState<Probe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ON_DEVICE_STATUS_QUERY_KEY });

  const probing = useMutation({
    mutationFn: runOnDeviceProbe,
    onSuccess: (result) => {
      setError(null);
      setProbe(result);
    },
    onError: () => setError(t`The test could not run. Try again later.`),
  });

  const installing = useMutation({
    mutationFn: async () => {
      const selected = await selectFile({
        multiple: false,
        directory: false,
        filters: [{ name: "manifest.json", extensions: ["json"] }],
      });
      if (typeof selected !== "string") return;
      const result = await transcriptionCommands.onDeviceInstall(selected);
      if (result.status === "error") throw new Error(result.error);
    },
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (e: Error) =>
      setError(t`The module was not installed: ${e.message}`),
  });

  const uninstalling = useMutation({
    mutationFn: async () => {
      const result = await transcriptionCommands.onDeviceUninstall();
      if (result.status === "error") throw new Error(result.error);
      setSettings({ stt_on_device: false });
    },
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (e: Error) =>
      setError(t`The module was not uninstalled: ${e.message}`),
  });

  if (!status.data?.allowed) return null;
  const module = status.data.module;
  const installed = module.kind === "installed";
  const busy = installing.isPending || uninstalling.isPending;

  return (
    <ServerCard
      title={<Trans>On this computer</Trans>}
      status={
        installed ? (
          <span className="bg-accent text-accent-foreground rounded-full px-2.5 py-0.5 text-[13px] font-medium">
            <Trans>Installed</Trans>
          </span>
        ) : null
      }
    >
      <p className="text-muted-foreground text-[13px]">
        <Trans>
          Transcribe without a server: the transcription module runs on this
          computer and audio never leaves it.
        </Trans>
      </p>

      <div
        data-setting-id="stt-on-device-probe"
        className="flex flex-col gap-2"
      >
        {probe ? <ProbeVerdict probe={probe} /> : null}
        <div>
          <button
            type="button"
            disabled={probing.isPending}
            onClick={() => probing.mutate()}
            className="border-border hover:bg-muted inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[13px] disabled:opacity-60"
          >
            {probing.isPending ? (
              <CircleNotch className="size-3.5 animate-spin motion-reduce:animate-none" />
            ) : null}
            {probe ? (
              <Trans>Test this computer again</Trans>
            ) : (
              <Trans>Test this computer</Trans>
            )}
          </button>
        </div>
      </div>

      <div
        data-setting-id="stt-on-device-module"
        className="flex flex-col gap-2"
      >
        {module.kind === "installed" ? (
          <p className="text-[13px]">
            {t`Module installed: version ${module.version}, ${formatSize(module.sizeBytes)}.`}
          </p>
        ) : module.kind === "invalid" ? (
          <p className="text-destructive text-[13px]" role="alert">
            {t`The installed module is refused: ${module.reason}.`}
          </p>
        ) : (
          <p className="text-muted-foreground text-[13px]">
            <Trans>
              Module not installed. Download from Syntheo is coming soon.
            </Trans>
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => installing.mutate()}
            className="border-border hover:bg-muted inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[13px] disabled:opacity-60"
          >
            {installing.isPending ? (
              <CircleNotch className="size-3.5 animate-spin motion-reduce:animate-none" />
            ) : null}
            <Trans>Install from a file…</Trans>
          </button>
          {module.kind !== "not_installed" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => uninstalling.mutate()}
              className="border-border hover:bg-muted rounded-md border px-2.5 py-1 text-[13px] disabled:opacity-60"
            >
              <Trans>Uninstall</Trans>
            </button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-[12px]">
          <Trans>
            Choose the manifest.json file of a module folder. Its signature and
            every file are checked before installation.
          </Trans>
        </p>
      </div>

      <label
        data-setting-id="stt-on-device-use"
        className={cn([
          "flex items-center gap-2 text-[13px]",
          !installed && "text-muted-foreground",
        ])}
      >
        <input
          type="checkbox"
          disabled={!installed}
          checked={installed && !!stt_on_device}
          onChange={(event) =>
            setSettings({ stt_on_device: event.target.checked })
          }
        />
        <Trans>Use this computer for transcription instead of the server</Trans>
      </label>

      {error ? (
        <p className="text-destructive text-[13px]" role="alert">
          {error}
        </p>
      ) : null}
      {isEligible(probe) && !installed ? (
        <p className="text-muted-foreground text-[13px]">
          <Trans>Once the module is installed, you can turn it on here.</Trans>
        </p>
      ) : null}
    </ServerCard>
  );
}
