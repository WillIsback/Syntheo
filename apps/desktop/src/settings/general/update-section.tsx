import { Trans, useLingui } from "@lingui/react/macro";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { changelogComponents } from "@syntheo/changelog";
import { commands as openerCommands } from "@syntheo/plugin-opener2";
import { streamdownIcons } from "@syntheo/ui/components/streamdown-icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { useLiveQuery } from "~/db";
import { type UpdaterErrorCode, useUpdater } from "~/services/updater/store";
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

/** Liste des versions, quand aucune mise à jour n'est connue. */
const RELEASES_URL = "https://github.com/WillIsback/Syntheo/releases";

function openReleasePage(url: string) {
  void openerCommands.openUrl(url, null).catch((error) => {
    console.error("[updater] failed to open the release page", error);
  });
}

// Les notes viennent de `latest.json` (note de version en Markdown, issue 598).
// HTML brut ignoré, images non chargées, et un lien n'ouvre que le navigateur :
// la fenêtre de l'application ne navigue jamais.
const updateNotesComponents = {
  ...changelogComponents,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) =>
    href && /^https?:\/\//i.test(href) ? (
      <a
        className="text-primary decoration-primary/40 underline underline-offset-2"
        href={href}
        onClick={(event) => {
          event.preventDefault();
          openReleasePage(href);
        }}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }: { alt?: string }) => (alt ? <span>{alt}</span> : null),
};

// Sans `rehype-raw` : le HTML reste un nœud brut, que `skipHtml` retire.
const updateNotesRehypePlugins = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
];

function UpdateNotes({ notes }: { notes: string }) {
  return (
    <div
      data-testid="update-notes"
      className="scroll-fade-y mt-2 max-h-72 overflow-y-auto pr-2"
    >
      <Streamdown
        icons={streamdownIcons}
        components={updateNotesComponents}
        rehypePlugins={updateNotesRehypePlugins}
        skipHtml
        mode="static"
        isAnimating={false}
        controls={false}
        linkSafety={{ enabled: false }}
      >
        {notes}
      </Streamdown>
    </div>
  );
}

// Libellé par code d'erreur (issue 601) : le détail technique est dans le
// journal, pas à l'écran.
function UpdateErrorMessage({ code }: { code: UpdaterErrorCode | null }) {
  switch (code) {
    // Pas de renvoi vers le téléchargement manuel : il ferait installer à la
    // main le fichier que la vérification vient de refuser.
    case "signature":
      return (
        <Trans>
          The update's signature could not be verified: nothing was installed.
          Try again later; if it happens again, report it.
        </Trans>
      );
    case "offline":
      return (
        <Trans>
          Can't reach the update server. Check your connection, then try again.
        </Trans>
      );
    case "interrupted":
      return <Trans>The download was interrupted. Try again.</Trans>;
    case "manifest":
      return (
        <Trans>
          The update information could not be read. Try again later, or use the
          release page.
        </Trans>
      );
    default:
      return (
        <Trans>The update failed. Try again, or use the release page.</Trans>
      );
  }
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
export function UpdateSection({
  version,
  versionFailed = false,
}: {
  version: string | undefined;
  /** La lecture de la version a échoué (pas seulement pas encore lue). */
  versionFailed?: boolean;
}) {
  const { t, i18n } = useLingui();
  const { automatic_updates } = useConfigValues(["automatic_updates"] as const);
  const setAutomaticUpdates = useSetSettingValue("automatic_updates");
  const managed = useUpdatesManaged();
  const phase = useUpdater((state) => state.phase);
  const update = useUpdater((state) => state.update);
  const progress = useUpdater((state) => state.progress);
  const error = useUpdater((state) => state.error);
  const supported = useUpdater((state) => state.supported);
  const loadSupport = useUpdater((state) => state.loadSupport);
  const check = useUpdater((state) => state.check);
  const download = useUpdater((state) => state.download);
  const install = useUpdater((state) => state.install);
  const listening = useListener(
    (state) =>
      state.live.status === "active" || state.live.status === "finalizing",
  );

  // Alpha `devtools` : l'indisponibilité s'affiche dès l'ouverture.
  useMountEffect(() => {
    void loadSupport();
  });

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
      {/* « inconnue » seulement si la lecture a échoué : pendant le chargement,
          la ligne n'apparaît pas encore (reprise QA de #601). */}
      {version ? (
        <p className="text-muted-foreground text-sm">
          <Trans>Installed version: {version}</Trans>
        </p>
      ) : versionFailed ? (
        <p className="text-muted-foreground text-sm">
          <Trans>Installed version: unknown</Trans>
        </p>
      ) : null}

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
            <UpdateErrorMessage code={error} />
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

      {update?.notes?.trim() &&
      (phase === "available" ||
        phase === "downloading" ||
        phase === "ready") ? (
        <details className="max-w-prose text-sm">
          <summary className="cursor-pointer">
            <Trans>What's new in {update.version}</Trans>
          </summary>
          <UpdateNotes notes={update.notes} />
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
        {/* En erreur, les messages renvoient à la page de la version : le lien
            est toujours là (liste des versions sans mise à jour connue), sauf
            pour une signature refusée. */}
        {(phase === "available" && update) ||
        (phase === "error" && error !== "signature") ? (
          <Button
            variant="link"
            className="px-1"
            onClick={() => openReleasePage(update?.releaseUrl ?? RELEASES_URL)}
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

      {/* Seulement quand la mise à jour intégrée est confirmée : ni pendant la
          lecture du support (premier rendu), ni sur une alpha devtools. */}
      {supported !== true ? null : (
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
      )}
    </section>
  );
}
