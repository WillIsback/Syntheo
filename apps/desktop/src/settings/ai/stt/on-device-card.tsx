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
  launchRefusal,
  downloadOnDeviceModels,
  installOnDeviceModelsFromFolder,
  isEligible,
  ON_DEVICE_COMMISSIONING_QUERY_KEY,
  ON_DEVICE_STATUS_QUERY_KEY,
  runOnDeviceCommissioning,
  useOnDeviceCommissioning,
  runOnDeviceProbe,
  useOnDeviceStatus,
} from "~/stt/on-device";

// Carte « Sur ce poste » (issues 683 et 685) : sonde du poste, modèles du
// programme compagnon livré avec l'application, mise en service, choix de la
// source. Masquée quand l'organisation interdit la source.

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

const INSTALL_PROGRESS_QUERY_KEY = ["on-device-install-progress"] as const;

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
  const installedNow =
    !!status.data?.companion && status.data.models.kind === "installed";
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
      const refusal = launchRefusal(result);
      if (refusal) {
        setNotice(null);
        setError(
          t`The measurement did not complete: ${describeOnDeviceError(refusal)}`,
        );
      } else {
        setNotice(
          result.profile
            ? t`Measurement done: ${profileLabels[result.profile as Profile]}.`
            : t`Measurement done: this computer is too slow for live transcription.`,
        );
      }
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

  // Modèles (issue 683) : téléchargés ou installés depuis un dossier choisi
  // côté Rust (aucun chemin ne part de l'interface), puis mise en service.
  const afterInstall = (models: { kind: string } | null) => {
    setError(null);
    if (models?.kind === "installed") {
      setNotice(
        t`Models installed. Measuring this computer (one to two minutes)…`,
      );
      void queryClient.invalidateQueries({
        queryKey: ON_DEVICE_COMMISSIONING_QUERY_KEY,
      });
      commissioningRun.mutate();
    }
    void refresh();
  };
  const installError = (e: Error) => {
    setError(
      t`The models were not installed: ${describeOnDeviceError(e.message)}`,
    );
    void refresh();
  };
  // Fin d'une installation lancée ici : l'avancement est oublié aussitôt
  // (l'hôte l'a déjà effacé), sans attendre la lecture suivante.
  const forgetInstallProgress = async () => {
    await queryClient.cancelQueries({
      queryKey: INSTALL_PROGRESS_QUERY_KEY,
    });
    queryClient.setQueryData(INSTALL_PROGRESS_QUERY_KEY, null);
  };
  const downloading = useMutation({
    mutationFn: downloadOnDeviceModels,
    onMutate: () => setNotice(null),
    onSettled: forgetInstallProgress,
    onSuccess: afterInstall,
    onError: installError,
  });
  const fromFolder = useMutation({
    mutationFn: installOnDeviceModelsFromFolder,
    onMutate: () => setNotice(null),
    onSettled: forgetInstallProgress,
    onSuccess: afterInstall,
    onError: installError,
  });
  // Installation depuis un dossier : la commande attend d'abord le choix du
  // dossier ; l'installation ne commence (et l'hôte ne rend un avancement)
  // qu'une fois le dossier choisi.
  const pendingHere = downloading.isPending || fromFolder.isPending;
  // Toujours lu tant que la carte est affichée : une carte remontée pendant
  // une installation (lancée avant de quitter les réglages) en reprend
  // l'affichage et bloque les boutons.
  const installProgress = useQuery({
    queryKey: INSTALL_PROGRESS_QUERY_KEY,
    queryFn: async () => {
      const result = await transcriptionCommands.onDeviceInstallProgress();
      return result.status === "ok" ? result.data : null;
    },
    refetchInterval: (query) => (pendingHere || query.state.data ? 500 : 2000),
  });
  const choosingFolder = fromFolder.isPending && !installProgress.data;
  const installingHere =
    downloading.isPending || (fromFolder.isPending && !choosingFolder);
  const installingElsewhere = !pendingHere && !!installProgress.data;
  const installingAny = installingHere || installingElsewhere;
  // Fin d'une installation suivie depuis une carte remontée : état relu.
  const [sawElsewhere, setSawElsewhere] = useState(false);
  useEffect(() => {
    if (installingElsewhere) {
      setSawElsewhere(true);
    } else if (sawElsewhere) {
      setSawElsewhere(false);
      void queryClient.invalidateQueries({
        queryKey: ON_DEVICE_STATUS_QUERY_KEY,
      });
    }
  }, [installingElsewhere, sawElsewhere, queryClient]);

  const removing = useMutation({
    mutationFn: async () => {
      const result = await transcriptionCommands.onDeviceRemoveModels();
      if (result.status === "error") throw new Error(result.error);
      setSettings({ stt_on_device: false });
    },
    onSuccess: () => {
      setError(null);
      setNotice(t`Models removed.`);
      void refresh();
    },
    onError: (e: Error) =>
      setError(
        t`The models were not removed: ${describeOnDeviceError(e.message)}`,
      ),
  });

  if (!status.data?.allowed) return null;
  const { companion, models, downloadable } = status.data;
  const installed = installedNow;
  const chosen = !!stt_on_device;
  const measuringElsewhere = !commissioningRun.isPending && !!progress.data;
  const measuringAny = commissioningRun.isPending || measuringElsewhere;
  const busy =
    installingAny || choosingFolder || removing.isPending || measuringAny;
  const done = installProgress.data;
  const measured = commissioning.data;
  const progressValue = progress.data;
  const usable = installed && !!measured?.profile;
  const refusal = launchRefusal(measured);

  return (
    <ServerCard
      title={<Trans>On this computer</Trans>}
      status={
        installed && !refusal ? (
          <span className="bg-accent text-accent-foreground rounded-full px-2.5 py-0.5 text-[13px] font-medium">
            <Trans>Ready</Trans>
          </span>
        ) : null
      }
    >
      <p className="text-muted-foreground text-[13px]">
        <Trans>
          Transcribe without a server: transcription runs on this computer and
          audio never leaves it.
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
        {!companion ? (
          <p className="text-muted-foreground text-[13px]">
            <Trans>
              This version of Syntheo does not include transcription on this
              computer.
            </Trans>
          </p>
        ) : installingAny ? (
          <p className="text-[13px]" data-testid="on-device-install-progress">
            {done && done.totalBytes > 0
              ? t`Installing the models: ${formatSize(done.doneBytes)} of ${formatSize(done.totalBytes)}…`
              : t`Installing the models…`}
          </p>
        ) : models.kind === "installed" ? (
          <p className="text-[13px]">
            {t`Models installed (${formatSize(models.totalBytes)}).`}
          </p>
        ) : models.kind === "partial" ? (
          // Les octets des téléchargements interrompus comptent (QA 0.8.0-3) :
          // le téléchargement reprend là où il s'est arrêté.
          <p className="text-muted-foreground text-[13px]">
            {models.resumable && downloadable
              ? t`Download interrupted: ${formatSize(models.presentBytes)} of ${formatSize(models.totalBytes)} downloaded. You can resume it.`
              : t`Models partly installed: ${formatSize(models.presentBytes)} of ${formatSize(models.totalBytes)}.`}
          </p>
        ) : (
          <p className="text-muted-foreground text-[13px]">
            {t`The transcription models (${formatSize(models.totalBytes)}) are not installed yet.`}
          </p>
        )}
        {companion ? (
          <div className="flex flex-wrap gap-1.5">
            {installingAny ? (
              <button
                type="button"
                onClick={() =>
                  void transcriptionCommands.onDeviceCancelInstall()
                }
                className="border-border hover:bg-muted inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[13px]"
              >
                <CircleNotch className="size-3.5 animate-spin motion-reduce:animate-none" />
                <Trans>Cancel</Trans>
              </button>
            ) : models.kind !== "installed" ? (
              <>
                {downloadable ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => downloading.mutate()}
                    className="border-border hover:bg-muted rounded-md border px-2.5 py-1 text-[13px] disabled:opacity-60"
                  >
                    {models.kind === "partial" ? (
                      <Trans>Resume the download</Trans>
                    ) : (
                      t`Download the models (${formatSize(models.totalBytes)})`
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fromFolder.mutate()}
                  className="border-border hover:bg-muted rounded-md border px-2.5 py-1 text-[13px] disabled:opacity-60"
                >
                  <Trans>Install from a folder…</Trans>
                </button>
              </>
            ) : null}
            {models.kind !== "missing" && !installingAny ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => removing.mutate()}
                className="border-border hover:bg-muted rounded-md border px-2.5 py-1 text-[13px] disabled:opacity-60"
              >
                <Trans>Remove the models</Trans>
              </button>
            ) : null}
          </div>
        ) : null}
        {companion && models.kind !== "installed" && !installingAny ? (
          <p className="text-muted-foreground text-[12px]">
            {downloadable ? (
              <Trans>
                Each file is checked against the version expected by this
                application before it is put in place. Without network access,
                install them from a folder that contains them.
              </Trans>
            ) : (
              <Trans>
                Choose the folder that contains the model files. Each file is
                checked against the version expected by this application before
                it is put in place.
              </Trans>
            )}
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
                : refusal
                  ? describeOnDeviceError(refusal)
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
            {!companion ? (
              <Trans>
                This computer is chosen for transcription, but this version of
                Syntheo does not include transcription on this computer: live
                transcription is paused.
              </Trans>
            ) : installed && refusal ? (
              t`This computer is chosen for transcription, but live transcription is paused: ${describeOnDeviceError(refusal)}`
            ) : installed ? (
              <Trans>
                This computer is chosen for transcription, but it has not been
                measured or is too slow: live transcription is paused.
              </Trans>
            ) : (
              <Trans>
                This computer is chosen for transcription, but its models are
                not installed: live transcription is paused.
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
            ) : companion && downloadable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => downloading.mutate()}
                className="border-border hover:bg-muted rounded-md border px-2.5 py-1 disabled:opacity-60"
              >
                <Trans>Download the models</Trans>
              </button>
            ) : companion ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => fromFolder.mutate()}
                className="border-border hover:bg-muted rounded-md border px-2.5 py-1 disabled:opacity-60"
              >
                <Trans>Install from a folder…</Trans>
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
      {isEligible(probe) && !installed && companion ? (
        <p className="text-muted-foreground text-[13px]">
          <Trans>Once the models are installed, you can turn it on here.</Trans>
        </p>
      ) : null}
    </ServerCard>
  );
}
