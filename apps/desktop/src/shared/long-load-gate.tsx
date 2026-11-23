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
import { messages as sourceMessages } from "~/i18n/locales/en/messages";
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

  // Monté au-dessus d'AppI18nProvider, sans réglage de langue lisible : les
  // écrans d'attente et d'erreur suivent la langue du système, avec un seul
  // catalogue chargé pour les deux. Le splash statique reste affiché tant
  // qu'il n'est pas prêt : jamais de texte anglais remplacé un instant plus
  // tard, ni de fenêtre blanche.
  const startupI18n = useQuery({
    queryKey: ["startup-i18n"],
    queryFn: loadStartupI18n,
    enabled: !ready && (showSplash || error !== null),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // Catalogue illisible : textes sources (anglais), jamais une fenêtre
  // blanche (useLingui exige un fournisseur).
  const i18n =
    startupI18n.data ?? (startupI18n.isError ? fallbackI18n() : undefined);
  const viewReady = i18n !== undefined && (showSplash || error !== null);

  useEffect(() => {
    if (ready || viewReady) {
      dismissBootSplash();
    }
  }, [ready, viewReady]);

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

  if (ready && !error) {
    return children;
  }
  if (!viewReady) {
    return null;
  }
  return (
    <I18nProvider i18n={i18n}>
      {error ? (
        <StartupErrorContent error={error} />
      ) : (
        <StartupSplashContent status={startupStatus} />
      )}
    </I18nProvider>
  );
}

// Les t`` restent dans le composant : la macro ne transforme que le t issu
// de useLingui dans sa portée.
function StartupSplashContent({
  status,
}: {
  status: StartupStatus | undefined;
}) {
  const { t } = useLingui();
  let detail: string | undefined;
  switch (status?.phase) {
    case "preparing_database":
      detail = t`Checking your local database. This is taking longer than expected.`;
      break;
    case "migrating_database": {
      const current = status.migrationCurrent;
      const total = status.migrationTotal;
      detail =
        current && total
          ? t`Migrating your local database (${current} of ${total}). This may take a few minutes.`
          : t`Migrating your local database. This may take a few minutes.`;
      break;
    }
    case "ready":
    case "failed":
    case undefined:
      break;
  }
  return <BrandLoadingView detail={detail} />;
}

// Repli si le catalogue de la langue du système ne se charge pas : le
// catalogue anglais, embarqué. En production, la macro Lingui ne garde que
// les identifiants des messages ; un catalogue vide afficherait donc ces
// identifiants au lieu des textes anglais.
let fallback: I18n | null = null;
export function fallbackI18n(): I18n {
  if (!fallback) {
    fallback = setupI18n({
      locale: SOURCE_LOCALE,
      messages: { [SOURCE_LOCALE]: sourceMessages },
    });
  }
  return fallback;
}

// La base n'a pas démarré : le réglage de langue n'est pas lisible. Les
// écrans d'attente et d'erreur suivent la langue du système, comme le
// réglage « automatique ».
async function loadStartupI18n() {
  const languages = await loadSystemLanguages();
  return createI18n(resolveDisplayLocale(UI_LANGUAGE_AUTO, languages));
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
