import { Trans, useLingui } from "@lingui/react/macro";

import { commands as openerCommands } from "@syntheo/plugin-opener2";
import { Button } from "@syntheo/ui/components/ui/button";

import { useLiveQuery } from "~/db";
import { useUpdater } from "~/services/updater/store";
import { useSetSettingValue } from "~/settings/queries";
import { SettingSwitchRow } from "~/settings/setting-row";
import { useConfigValues } from "~/shared/config";
import { useListener } from "~/stt/contexts";

const MANAGED_SQL = `
  SELECT 1 AS managed FROM managed_app_settings WHERE id = 'automatic_updates'
`;

/** La vérification au démarrage est fixée par l'administration du poste. */
function useUpdatesManaged(): boolean {
  const { data = false } = useLiveQuery<{ managed: number }, boolean>({
    sql: MANAGED_SQL,
    mapRows: (rows) => rows.length > 0,
  });
  return data;
}

function openReleasePage(url: string) {
  void openerCommands.openUrl(url, null).catch((error) => {
    console.error("[updater] failed to open the release page", error);
  });
}

function formatBytes(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 0,
  }).format(bytes / 1_000_000);
}

// Mise à jour intégrée (issue 593), Paramètres › Profil : version installée,
// vérification à la demande, téléchargement, installation et relance, et
// l'interrupteur de vérification au démarrage. Aucune installation ni relance
// pendant une écoute ou une finalisation.
export function UpdateSection({ version }: { version: string | undefined }) {
  const { t, i18n } = useLingui();
  const { automatic_updates } = useConfigValues(["automatic_updates"] as const);
  const setAutomaticUpdates = useSetSettingValue("automatic_updates");
  const managed = useUpdatesManaged();
  const phase = useUpdater((state) => state.phase);
  const update = useUpdater((state) => state.update);
  const progress = useUpdater((state) => state.progress);
  const error = useUpdater((state) => state.error);
  const check = useUpdater((state) => state.check);
  const download = useUpdater((state) => state.download);
  const install = useUpdater((state) => state.install);
  const listening = useListener(
    (state) =>
      state.live.status === "active" || state.live.status === "finalizing",
  );

  const busy =
    phase === "checking" || phase === "downloading" || phase === "installing";
  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <section
      aria-labelledby="settings-updates-title"
      className="flex flex-col gap-3"
    >
      <h2
        id="settings-updates-title"
        className="font-sans text-lg font-semibold"
      >
        <Trans>Updates</Trans>
      </h2>
      <p className="text-muted-foreground text-sm">
        {version ? (
          <Trans>Installed version: {version}</Trans>
        ) : (
          <Trans>Installed version: unknown</Trans>
        )}
      </p>

      <div role="status" aria-live="polite" className="text-sm">
        {phase === "checking" ? <Trans>Checking for updates…</Trans> : null}
        {phase === "up_to_date" ? <Trans>Syntheo is up to date.</Trans> : null}
        {phase === "unavailable" ? (
          <Trans>Updates are not checked in this build.</Trans>
        ) : null}
        {update &&
        (phase === "available" ||
          phase === "downloading" ||
          phase === "ready" ||
          phase === "installing") ? (
          <Trans>Version {update.version} is available.</Trans>
        ) : null}
        {phase === "downloading" ? (
          <span className="text-muted-foreground block">
            {percent !== null ? (
              <Trans>Downloading… {percent}%</Trans>
            ) : (
              <Trans>
                Downloading…{" "}
                {formatBytes(progress?.downloaded ?? 0, i18n.locale)}
              </Trans>
            )}
          </span>
        ) : null}
        {phase === "ready" ? (
          <span className="text-muted-foreground block">
            <Trans>The update is downloaded and ready to install.</Trans>
          </span>
        ) : null}
        {phase === "installing" ? (
          <span className="text-muted-foreground block">
            <Trans>Installing… Syntheo will restart.</Trans>
          </span>
        ) : null}
        {phase === "error" ? (
          <span className="text-destructive block">
            <Trans>The update failed: {error}</Trans>
          </span>
        ) : null}
      </div>

      {phase === "downloading" ? (
        <progress
          className="accent-primary h-1.5 w-full max-w-sm"
          aria-label={t`Download progress`}
          max={100}
          value={percent ?? undefined}
        />
      ) : null}

      {update?.notes &&
      (phase === "available" ||
        phase === "downloading" ||
        phase === "ready") ? (
        <details className="max-w-prose text-sm">
          <summary className="cursor-pointer">
            <Trans>What's new in {update.version}</Trans>
          </summary>
          <p className="text-muted-foreground mt-2 whitespace-pre-line">
            {update.notes}
          </p>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-setting-id="check-for-updates"
          variant="outline"
          disabled={busy}
          onClick={() => void check({ manual: true })}
        >
          <Trans>Check for updates</Trans>
        </Button>
        {update && !update.installable && phase === "available" ? (
          <Button onClick={() => openReleasePage(update.releaseUrl)}>
            <Trans>Open the download page</Trans>
          </Button>
        ) : null}
        {update?.installable && phase === "available" ? (
          <Button onClick={() => void download()}>
            <Trans>Download the update</Trans>
          </Button>
        ) : null}
        {phase === "ready" ? (
          <Button disabled={listening} onClick={() => void install()}>
            <Trans>Install and restart</Trans>
          </Button>
        ) : null}
        {(phase === "error" || phase === "available") && update ? (
          <Button
            variant="link"
            className="px-1"
            onClick={() => openReleasePage(update.releaseUrl)}
          >
            <Trans>Release page</Trans>
          </Button>
        ) : null}
      </div>
      {phase === "ready" && listening ? (
        <p className="text-muted-foreground text-xs">
          <Trans>
            A meeting is being recorded: install the update once it ends.
          </Trans>
        </p>
      ) : null}
      {update && !update.installable && phase === "available" ? (
        <p className="text-muted-foreground text-xs">
          <Trans>
            This installation (.deb or MSI) is updated by downloading the new
            package.
          </Trans>
        </p>
      ) : null}

      <SettingSwitchRow
        settingId="check-updates-on-startup"
        title={<Trans>Check for updates at startup</Trans>}
        description={
          managed ? (
            <Trans>Set by your administrator.</Trans>
          ) : (
            <Trans>
              Reads the latest version on GitHub. Nothing is installed without
              your action.
            </Trans>
          )
        }
        checked={automatic_updates && !managed}
        disabled={managed}
        onChange={setAutomaticUpdates}
      />
    </section>
  );
}
