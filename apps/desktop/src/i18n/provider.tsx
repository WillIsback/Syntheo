import { I18nProvider } from "@lingui/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";

import { commands as detectCommands } from "@syntheo/plugin-detect";
import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { createI18n } from "./catalogs";
import {
  UI_LANGUAGE_AUTO,
  resolveDisplayLocale,
  resolveUiLanguagePreference,
} from "./locales";

import { useStoredSettingValues } from "~/settings/queries";

async function loadSystemLanguages(): Promise<string[]> {
  try {
    const result = await detectCommands.getPreferredLanguages();
    return result.status === "ok" ? result.data : [];
  } catch {
    return [];
  }
}

// La langue de l'interface suit le réglage `ui_language` (issue 549), et non
// plus la langue de transcription. En automatique, la langue du système.
export function AppI18nProvider({ children }: { children: ReactNode }) {
  const preference = resolveUiLanguagePreference(useStoredSettingValues());
  const followsSystem = preference === UI_LANGUAGE_AUTO;
  const systemLanguages = useQuery({
    queryKey: ["system-preferred-languages"],
    queryFn: loadSystemLanguages,
    enabled: followsSystem,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  const locale = resolveDisplayLocale(preference, systemLanguages.data);
  const { data: i18n } = useQuery({
    queryKey: ["i18n-catalog", locale],
    queryFn: () => createI18n(locale),
    enabled: !followsSystem || systemLanguages.isFetched,
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  if (!i18n) return null;

  return (
    <I18nProvider i18n={i18n}>
      <DocumentLanguage key={i18n.locale} locale={i18n.locale} />
      {children}
    </I18nProvider>
  );
}

function DocumentLanguage({ locale }: { locale: string }) {
  useMountEffect(() => {
    document.documentElement.lang = locale;
  });

  return null;
}
