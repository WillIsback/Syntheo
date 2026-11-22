import { I18nProvider } from "@lingui/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReactNode, useLayoutEffect } from "react";

import { createI18n } from "./catalogs";
import {
  UI_LANGUAGE_AUTO,
  resolveDisplayLocale,
  resolveUiLanguagePreference,
} from "./locales";
import { loadSystemLanguages } from "./system-languages";

import { useStoredSettingValues } from "~/settings/queries";

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
  const { data: i18n, isPlaceholderData } = useQuery({
    queryKey: ["i18n-catalog", locale],
    queryFn: () => createI18n(locale),
    enabled: !followsSystem || systemLanguages.isFetched,
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  // `createI18n` active l'instance Lingui globale et la requête la garde en
  // cache : revenir à une langue déjà chargée (anglais → français → automatique
  // en anglais) ne relance pas la requête, donc ne réactivait pas la langue, et
  // l'interface restait dans l'ancienne jusqu'au rechargement (issue 558). Ses
  // messages sont déjà chargés : on la réactive avant l'affichage.
  // `<html lang>` suit la langue active, écrit après l'activation : lu au
  // rendu, il retardait d'une bascule vers une langue en cache (issue 616).
  useLayoutEffect(() => {
    if (!i18n) return;
    if (!isPlaceholderData && i18n.locale !== locale) {
      i18n.activate(locale);
    }
    document.documentElement.lang = i18n.locale;
  }, [i18n, isPlaceholderData, locale]);

  if (!i18n) return null;

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
