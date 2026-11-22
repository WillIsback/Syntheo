import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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
  describeOnDeviceError,
  isEligible,
  ON_DEVICE_COMMISSIONING_QUERY_KEY,
  ON_DEVICE_STATUS_QUERY_KEY,
  runOnDeviceCommissioning,
  useOnDeviceCommissioning,
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
    one_stream_diarized: t`microphone only, with speakers: the computer's sound (remote participants) is not transcribed`,
    one_stream: t`microphone only, without speakers: the computer's sound (remote participants) is not transcribed`,
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

function ProbeVerdict({ probe }: { probe: Probe }) {
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

/**
 * Source choisie mais interdite par l'organisation (revue 685, constat 5) :
 * jamais de retour silencieux au serveur. La case est décochée et la
 * personne est prévenue.
 */
export function OnDevicePolicyNotice() {
  const status = useOnDeviceStatus();
  const { stt_on_device } = useConfigValues(["stt_on_device"] as const);
  const setSettings = useSetSettingValues();
  const [shown, setShown] = useState(false);
  const forbidden = status.data?.allowed === false && !!stt_on_device;
  useEffect(() => {
    if (forbidden) {
      setShown(true);
      setSettings({ stt_on_device: false });
    }
  }, [forbidden, setSettings]);
  if (!shown) return null;
  return (
    <p
      data-testid="on-device-policy-notice"
      role="status"
      className="bg-alert text-alert-foreground rounded-md px-3 py-2 text-[13px]"
    >
      <Trans>
        Transcription on this computer is disabled by your administrator;
        transcription now goes through the server.
      </Trans>
    </p>
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
  const [notice, setNotice] = useState<string | null>(null);
  const [measuringNow, setMeasuringNow] = useState(false);
  const installedNow = status.data?.module.kind === "installed";
  const commissioning = useOnDeviceCommissioning(installedNow);
  const profileLabels = useLabels().profile;

  // Avancement de la mesure, lu chaque seconde pendant qu'elle tourne.
  const progress = useQuery({
    queryKey: ["on-device-commission-progress"],
    queryFn: async () => {
      const result = await transcriptionCommands.onDeviceCommissionProgress();
      return result.status === "ok" ? result.data : null;
    },
    // Toujours lu tant que la carte est affichée : une carte remontée
    // pendant une mesure en reprend l'affichage et bloque le bouton.
    refetchInterval: measuringNow ? 1000 : 2000,
  });

  // Mise en service (issue 686) : après l'installation, puis à la demande.
  const commissioningRun = useMutation({
    mutationFn: runOnDeviceCommissioning,
    onMutate: () => setMeasuringNow(true),
    onSettled: () => setMeasuringNow(false),
    onSuccess: (result) => {
      setError(null);
      queryClient.setQueryData(ON_DEVICE_COMMISSIONING_QUERY_KEY, result);
      setNotice(
        result.profile
          ? t`Measurement done: ${profileLabels[result.profile as Profile]}.`
          : t`Measurement done: this computer is too slow for live transcription.`,
      );
      if (!result.profile) setSettings({ stt_on_device: false });
    },
    onError: (e: Error) =>
      setError(
        t`The measurement did not complete: ${describeOnDeviceError(e.message)}`,
      ),
  });

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

  // Le fichier est choisi côté Rust : aucun chemin ne part de l'interface.
  const installing = useMutation({
    mutationFn: async () => {
      const result = await transcriptionCommands.onDeviceInstall();
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
    onSuccess: (installed) => {
      setError(null);
      if (installed) {
        setNotice(
          t`Module installed. Measuring this computer (one to two minutes)…`,
        );
        void queryClient.invalidateQueries({
          queryKey: ON_DEVICE_COMMISSIONING_QUERY_KEY,
        });
        if (installed.kind === "installed") commissioningRun.mutate();
      }
      void refresh();
    },
    onError: (e: Error) =>
      setError(
        t`The module was not installed: ${describeOnDeviceError(e.message)}`,
      ),
  });

  const uninstalling = useMutation({
    mutationFn: async () => {
      const result = await transcriptionCommands.onDeviceUninstall();
      if (result.status === "error") throw new Error(result.error);
      setSettings({ stt_on_device: false });
    },
    onSuccess: () => {
      setError(null);
      setNotice(t`Module uninstalled.`);
      void refresh();
    },
    onError: (e: Error) =>
      setError(
        t`The module was not uninstalled: ${describeOnDeviceError(e.message)}`,
      ),
  });

  if (!status.data?.allowed) return null;
  const module = status.data.module;
  const installable = status.data.installable;
  const installed = module.kind === "installed";
  const chosen = !!stt_on_device;
  const measuringElsewhere = !commissioningRun.isPending && !!progress.data;
  const measuringAny = commissioningRun.isPending || measuringElsewhere;
  const busy = installing.isPending || uninstalling.isPending || measuringAny;
  const measured = commissioning.data;
  const progressValue = progress.data;
  const usable = installed && !!measured?.profile;

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
        <div aria-live="polite">
          {probe ? <ProbeVerdict probe={probe} /> : null}
        </div>
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
            {t`The installed module is refused: ${describeOnDeviceError(module.reason)}`}
          </p>
        ) : installable ? (
          <p className="text-muted-foreground text-[13px]">
            <Trans>
              Module not installed. Download from Syntheo is coming soon.
            </Trans>
          </p>
        ) : (
          <p className="text-muted-foreground text-[13px]">
            <Trans>Transcription on this computer is coming soon.</Trans>
          </p>
        )}
        {installable || module.kind !== "not_installed" ? (
          <div className="flex flex-wrap gap-1.5">
            {installable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => installing.mutate()}
                className="border-border hover:bg-muted inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[13px] disabled:opacity-60"
              >
                {installing.isPending ? (
                  <CircleNotch className="size-3.5 animate-spin motion-reduce:animate-none" />
                ) : null}
                {installing.isPending ? (
                  <Trans>Installing…</Trans>
                ) : (
                  <Trans>Install from a file…</Trans>
                )}
              </button>
            ) : null}
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
        ) : null}
        {installable ? (
          <p className="text-muted-foreground text-[12px]">
            <Trans>
              Choose the manifest.json file of a module folder. Its signature
              and every file are checked before installation.
            </Trans>
          </p>
        ) : null}
      </div>

      {installed ? (
        <div
          data-setting-id="stt-on-device-commissioning"
          className="flex flex-col gap-2"
        >
          <p className="text-[13px]" data-testid="on-device-commissioning">
            {measuringAny
              ? progressValue
                ? t`Measuring profile ${progressValue.current} of ${progressValue.total}…`
                : t`Measuring this computer (one to two minutes)…`
              : measured?.profile
                ? t`Measured: ${profileLabels[measured.profile as Profile]}.`
                : measured
                  ? t`Measured: this computer is too slow for live transcription.`
                  : t`This computer has not been measured yet.`}
          </p>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => commissioningRun.mutate()}
              className="border-border hover:bg-muted inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[13px] disabled:opacity-60"
            >
              {measuringAny ? (
                <CircleNotch className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : null}
              {measured ? (
                <Trans>Measure again</Trans>
              ) : (
                <Trans>Measure this computer</Trans>
              )}
            </button>
          </div>
        </div>
      ) : null}

      <label
        data-setting-id="stt-on-device-use"
        className={cn([
          "flex items-center gap-2 text-[13px]",
          !usable && !chosen && "text-muted-foreground",
        ])}
      >
        <input
          type="checkbox"
          disabled={!usable && !chosen}
          checked={chosen}
          onChange={(event) =>
            setSettings({ stt_on_device: event.target.checked })
          }
        />
        <Trans>Use this computer for transcription instead of the server</Trans>
      </label>

      {chosen && !usable && !measuringAny ? (
        <div
          data-testid="on-device-missing"
          role="alert"
          className="bg-alert text-alert-foreground flex flex-col gap-2 rounded-md px-3 py-2 text-[13px]"
        >
          <p>
            {installed ? (
              <Trans>
                This computer is chosen for transcription, but it has not been
                measured or is too slow: live transcription is paused.
              </Trans>
            ) : module.kind === "invalid" ? (
              <Trans>
                This computer is chosen for transcription, but its module is
                refused: live transcription is paused.
              </Trans>
            ) : (
              <Trans>
                This computer is chosen for transcription, but its module is not
                installed: live transcription is paused.
              </Trans>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {installed ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => commissioningRun.mutate()}
                className="border-border hover:bg-muted rounded-md border px-2.5 py-1 disabled:opacity-60"
              >
                <Trans>Measure this computer</Trans>
              </button>
            ) : installable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => installing.mutate()}
                className="border-border hover:bg-muted rounded-md border px-2.5 py-1 disabled:opacity-60"
              >
                <Trans>Install</Trans>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSettings({ stt_on_device: false })}
              className="border-border hover:bg-muted rounded-md border px-2.5 py-1"
            >
              <Trans>Go back to the server</Trans>
            </button>
          </div>
        </div>
      ) : null}

      <div aria-live="polite">
        {error ? (
          <p className="text-destructive text-[13px]" role="alert">
            {error}
          </p>
        ) : notice ? (
          <p className="text-muted-foreground text-[13px]">{notice}</p>
        ) : null}
      </div>
      {isEligible(probe) && !installed && installable ? (
        <p className="text-muted-foreground text-[13px]">
          <Trans>Once the module is installed, you can turn it on here.</Trans>
        </p>
      ) : null}
    </ServerCard>
  );
}
