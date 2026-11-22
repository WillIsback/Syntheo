import { useLingui } from "@lingui/react/macro";
import { platform } from "@tauri-apps/plugin-os";

import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { useLiveQuery } from "~/db";
import { DEVICE_AUTH_REASON } from "~/lock/auth";
import { useAppLock } from "~/lock/store";
import { BetaData } from "~/mesure/beta-data";
import { privacyMessages } from "~/settings/general/app-settings";
import { SettingsPageTitle } from "~/settings/page-title";
import {
  useSetSettingValues,
  useStoredSettingValuesQuery,
} from "~/settings/queries";
import { SettingSwitchRow } from "~/settings/setting-row";
import { resolveConfigValue } from "~/shared/config";

const MANAGED_BETA_SQL = `
  SELECT id FROM managed_app_settings
  WHERE id IN ('measurement_enabled', 'calibration_enabled')
`;

/** Réglages de la bêta fixés par l'administration du poste. */
function useManagedBetaSettings(): Set<string> {
  const { data = new Set<string>() } = useLiveQuery<
    { id: string },
    Set<string>
  >({
    sql: MANAGED_BETA_SQL,
    mapRows: (rows) => new Set(rows.map((row) => row.id)),
  });
  return data;
}

export function SettingsPrivacy() {
  const { i18n, t } = useLingui();
  const settingsQuery = useStoredSettingValuesQuery();
  const setSettingValues = useSetSettingValues();
  const available = useAppLock((state) => state.available);
  const authenticating = useAppLock((state) => state.authenticating);
  const authenticate = useAppLock((state) => state.authenticate);
  const lockApp = useAppLock((state) => state.lockApp);
  const refreshAvailability = useAppLock((state) => state.refreshAvailability);
  const managedBeta = useManagedBetaSettings();

  useMountEffect(() => {
    void refreshAvailability();
  });

  if (settingsQuery.error) {
    throw settingsQuery.error;
  }
  if (settingsQuery.isLoading || !settingsQuery.data) {
    return null;
  }

  const lockAppEnabled = resolveConfigValue("lock_app", settingsQuery.data);
  const measurementManaged = managedBeta.has("measurement_enabled");
  const calibrationManaged = managedBeta.has("calibration_enabled");
  const measurementEnabled =
    resolveConfigValue("measurement_enabled", settingsQuery.data) &&
    !measurementManaged;
  const calibrationEnabled =
    measurementEnabled &&
    resolveConfigValue("calibration_enabled", settingsQuery.data) &&
    !calibrationManaged;
  const authAvailable = available === true;
  const lockAppDescription = !authAvailable
    ? t`Device authentication is not available on this computer.`
    : platform() === "windows"
      ? t`Require Windows Hello face, PIN, or password when opening Syntheo.`
      : t`Require Touch ID or your password when opening Syntheo.`;

  return (
    <div className="flex flex-col gap-8">
      <SettingsPageTitle title={i18n._(privacyMessages.title)} />

      <section className="flex flex-col gap-4">
        <SettingSwitchRow
          settingId="lock-app"
          title={t`Lock app`}
          description={lockAppDescription}
          checked={lockAppEnabled && authAvailable}
          disabled={!authAvailable || authenticating}
          onChange={(next) => {
            void (async () => {
              const canAuth = await refreshAvailability();
              if (!canAuth) return;
              const ok = await authenticate(
                DEVICE_AUTH_REASON.changeLockSettings,
              );
              if (!ok) return;
              setSettingValues({ lock_app: next });
              if (next) lockApp();
            })();
          }}
        />
      </section>

      {/* Bêta (issue 671) : mesure de la reprise, désactivée par défaut. */}
      <section className="flex flex-col gap-4" aria-label={t`Beta`}>
        <h2 className="text-sm font-semibold">{t`Beta: measure rework`}</h2>
        <SettingSwitchRow
          settingId="measurement-enabled"
          title={t`Measure rework of summaries`}
          description={
            measurementManaged
              ? t`Set by your administrator.`
              : t`Adds “Measure rework…” to the summary menu. You paste the version you sent; only counts are kept on this computer, never text, and nothing is sent.`
          }
          checked={measurementEnabled}
          disabled={measurementManaged}
          onChange={(next) => {
            setSettingValues(
              next
                ? { measurement_enabled: true }
                : { measurement_enabled: false, calibration_enabled: false },
            );
            // L'inscription à la bêta (issue 672) se fait dans la
            // transaction du réglage (settings/queries.ts).
          }}
        />
        <SettingSwitchRow
          settingId="calibration-enabled"
          title={t`Calibration mode`}
          description={
            calibrationManaged
              ? t`Set by your administrator.`
              : t`After a measurement, lists each difference so you can classify it by hand. Excerpts stay on screen; only the agreement counts are kept.`
          }
          checked={calibrationEnabled}
          disabled={calibrationManaged || !measurementEnabled}
          onChange={(next) => setSettingValues({ calibration_enabled: next })}
        />
        {/* Issue 672 : export pseudonymisé et effacement, même désactivée. */}
        <BetaData />
      </section>
    </div>
  );
}
