import { setupI18n, type I18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffect, useState, type ReactNode } from "react";

import {
  getStartupStatus,
  waitUntilReady,
  type StartupStatus,
} from "@syntheo/plugin-db";
import { ArrowClockwise } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";
import { cn } from "@syntheo/utils";

import { BrandLoadingView } from "./brand-loading-view";

import { createI18n } from "~/i18n/catalogs";
import {
  SOURCE_LOCALE,
  UI_LANGUAGE_AUTO,
  resolveDisplayLocale,
} from "~/i18n/locales";
import { loadSystemLanguages } from "~/i18n/system-languages";

export const LONG_LOAD_SPLASH_DELAY_MS = 400;
const STARTUP_STATUS_REFETCH_INTERVAL_MS = 250;

function dismissBootSplash() {
  document.getElementById("boot-splash")?.remove();
}

export function LongLoadGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { data: startupStatus } = useQuery({
    queryKey: ["database-startup-status"],
    queryFn: getStartupStatus,
    enabled: !ready && !error,
    refetchInterval: ready ? false : STARTUP_STATUS_REFETCH_INTERVAL_MS,
    retry: false,
  });

  useEffect(() => {
    if (ready || showSplash || error) {
      dismissBootSplash();
    }
  }, [ready, showSplash, error]);

  useMountEffect(() => {
    let cancelled = false;
    const splashTimer = window.setTimeout(() => {
      if (!cancelled) {
        setShowSplash(true);
      }
    }, LONG_LOAD_SPLASH_DELAY_MS);

    void waitUntilReady()
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      })
      .finally(() => {
        window.clearTimeout(splashTimer);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(splashTimer);
    };
  });

  if (error) {
    return <StartupErrorView error={error} />;
  }
  if (ready) {
    return children;
  }
  if (!showSplash) {
    return null;
  }
  return <BrandLoadingView detail={getStartupDetail(startupStatus)} />;
}

function getStartupDetail(status: StartupStatus | undefined) {
  switch (status?.phase) {
    case "preparing_database":
      return "Checking your local database. This is taking longer than expected.";
    case "migrating_database": {
      const progress =
        status.migrationCurrent && status.migrationTotal
          ? ` (${status.migrationCurrent} of ${status.migrationTotal})`
          : "";
      return `Migrating your local database${progress}. This may take a few minutes.`;
    }
    case "ready":
    case "failed":
    case undefined:
      return undefined;
  }
}

let fallback: I18n | null = null;
function fallbackI18n(): I18n {
  if (!fallback) {
    fallback = setupI18n({
      locale: SOURCE_LOCALE,
      messages: { [SOURCE_LOCALE]: {} },
    });
  }
  return fallback;
}

// La base n'a pas démarré : le réglage de langue n'est pas lisible. L'écran
// d'erreur suit la langue du système, comme le réglage « automatique ».
async function loadStartupI18n() {
  const languages = await loadSystemLanguages();
  return createI18n(resolveDisplayLocale(UI_LANGUAGE_AUTO, languages));
}

function StartupErrorView({ error }: { error: Error }) {
  const { data: i18n, isError } = useQuery({
    queryKey: ["startup-error-i18n"],
    queryFn: loadStartupI18n,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!i18n && !isError) return null;
  // Catalogue illisible : textes sources (anglais), jamais une fenêtre
  // blanche (useLingui exige un fournisseur).
  return (
    <I18nProvider i18n={i18n ?? fallbackI18n()}>
      <StartupErrorContent error={error} />
    </I18nProvider>
  );
}

function StartupErrorContent({ error }: { error: Error }) {
  const { t } = useLingui();
  const needsUpdate = error.message.includes(
    "created by a newer version of Syntheo",
  );
  // Réglages gérés invalides (crates/db-app, managed_settings.rs) : le
  // fichier est nommé, son contenu jamais affiché.
  const invalidManagedSettings = error.message.includes(
    "invalid managed settings file",
  );

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (cause) {}
  };

  return (
    <div
      data-tauri-drag-region
      className={cn([
        "bg-background flex h-screen w-screen items-center justify-center p-6",
      ])}
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-foreground text-base font-semibold">
          {needsUpdate
            ? t`Syntheo needs an update`
            : t`Syntheo could not start`}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {needsUpdate
            ? t`Your data was updated by a newer version of Syntheo, such as Syntheo Nightly, and this version cannot open it yet. Your existing data was left unchanged. Install the latest version of Syntheo, or keep using the newer app until this version catches up.`
            : invalidManagedSettings
              ? t`The settings file managed by your organization (managed_settings.json) is invalid, so Syntheo does not start. Your existing data was left unchanged. Contact your administrator: Syntheo will start once the file is fixed.`
              : t`Your existing data was left unchanged. Please restart the app. If the problem continues, contact support.`}
        </p>
        {needsUpdate ? null : (
          <Button size="sm" onClick={() => void handleRestart()}>
            <ArrowClockwise className="mr-1.5 h-3.5 w-3.5" />
            <Trans>Restart App</Trans>
          </Button>
        )}
      </div>
    </div>
  );
}
