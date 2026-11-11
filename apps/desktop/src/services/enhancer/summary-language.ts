import { i18n } from "@lingui/core";

import { commands as templateCommands } from "@syntheo/plugin-template";

import {
  CORE_TRANSCRIPTION_LANGUAGE_CODES,
  getAdditionalSpokenLanguages,
  isAutoMainLanguage,
} from "~/settings/general/language";
import type { SettingValues } from "~/settings/schema";

// Langue du compte rendu et du titre. `uiLocale` : la langue de l'interface
// active, repli de la détection automatique.
export async function resolveSummaryLanguage(
  settingsValues: SettingValues,
  texts: string[],
  uiLocale: string = i18n.locale,
): Promise<string> {
  const mainLanguage = settingsValues.ai_language;
  // Sans langue (ou en détection automatique), le compte rendu suit la langue
  // dominante des textes ; à défaut, celle de l'interface. Une langue absente
  // laisserait le gabarit écrire en anglais (issue 570).
  if (
    typeof mainLanguage !== "string" ||
    mainLanguage.length === 0 ||
    isAutoMainLanguage(mainLanguage)
  ) {
    return detectTextsLanguage(texts, uiLocale);
  }

  const additionalLanguages = getAdditionalSpokenLanguages(
    mainLanguage,
    parseStringArray(settingsValues.spoken_languages ?? "[]"),
  );
  if (
    settingsValues.summary_use_main_language === true ||
    additionalLanguages.length === 0
  ) {
    return mainLanguage;
  }

  try {
    const result = await templateCommands.dominantLanguage({
      texts,
      candidates: [mainLanguage, ...additionalLanguages],
    });
    return result.status === "ok" && result.data ? result.data : mainLanguage;
  } catch {
    return mainLanguage;
  }
}

async function detectTextsLanguage(
  texts: string[],
  uiLocale: string,
): Promise<string> {
  const fallback = uiLocale || "en";
  // Toutes les langues de l'app, celle de l'interface en tête (elle l'emporte
  // à égalité) ; la détection écarte celles qu'elle ne reconnaît pas.
  const candidates = [
    ...new Set([fallback, ...CORE_TRANSCRIPTION_LANGUAGE_CODES]),
  ];
  try {
    const result = await templateCommands.dominantLanguage({
      texts,
      candidates,
    });
    return result.status === "ok" && result.data ? result.data : fallback;
  } catch {
    return fallback;
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}
