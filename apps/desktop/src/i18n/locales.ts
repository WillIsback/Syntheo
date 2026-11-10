export const SOURCE_LOCALE = "en";

export const SUPPORTED_DISPLAY_LOCALES = ["en", "fr"] as const;

export type DisplayLocale = (typeof SUPPORTED_DISPLAY_LOCALES)[number];

// Réglage `ui_language` : « auto » suit la langue du système, sinon une
// locale d'affichage choisie explicitement.
export const UI_LANGUAGE_AUTO = "auto";

export type UiLanguagePreference = typeof UI_LANGUAGE_AUTO | DisplayLocale;

const supportedDisplayLocales = new Set<string>(SUPPORTED_DISPLAY_LOCALES);
const supportedDisplayLocaleByLanguage = new Map(
  SUPPORTED_DISPLAY_LOCALES.map(
    (locale) => [new Intl.Locale(locale).language, locale] as const,
  ),
);

function matchDisplayLocale(
  language: string | null | undefined,
): DisplayLocale | null {
  if (!language) return null;
  try {
    const locale = new Intl.Locale(language);
    const exactLocale = locale.toString();
    if (supportedDisplayLocales.has(exactLocale)) {
      return exactLocale as DisplayLocale;
    }
    return supportedDisplayLocaleByLanguage.get(locale.language) ?? null;
  } catch {
    return null;
  }
}

export function normalizeUiLanguage(
  value: string | null | undefined,
): UiLanguagePreference {
  return matchDisplayLocale(value) ?? UI_LANGUAGE_AUTO;
}

// Langue de l'interface : le réglage explicite d'abord ; en automatique, la
// première langue préférée du système si un catalogue existe, sinon l'anglais
// (y compris pour le chinois, l'allemand…).
export function resolveDisplayLocale(
  uiLanguage: string | null | undefined,
  systemLanguages: readonly string[] | null | undefined,
): DisplayLocale {
  return (
    matchDisplayLocale(uiLanguage) ??
    matchDisplayLocale(systemLanguages?.[0]) ??
    SOURCE_LOCALE
  );
}

// Règle d'avant `ui_language` : l'interface suivait la langue de transcription,
// en anglais seulement si elle était l'anglais, en français sinon.
export function legacyDisplayLocale(
  aiLanguage: string | null | undefined,
): DisplayLocale {
  return matchDisplayLocale(aiLanguage) === "en" ? "en" : "fr";
}

type StoredLanguageSettings = {
  values: { ui_language?: string; ai_language?: string };
  hasValues: ReadonlySet<string>;
};

// Un profil qui a déjà des réglages mais pas encore `ui_language` garde la
// langue qu'il voyait jusqu'ici (la migration l'enregistre au démarrage) ; un
// nouveau profil suit le système.
export function resolveUiLanguagePreference(
  stored: StoredLanguageSettings,
): UiLanguagePreference {
  if (stored.hasValues.has("ui_language")) {
    return normalizeUiLanguage(stored.values.ui_language);
  }
  if (stored.hasValues.size > 0) {
    return legacyDisplayLocale(stored.values.ai_language);
  }
  return UI_LANGUAGE_AUTO;
}
