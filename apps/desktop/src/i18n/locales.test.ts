import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SOURCE_LOCALE,
  SUPPORTED_DISPLAY_LOCALES,
  legacyDisplayLocale,
  resolveDisplayLocale,
  resolveUiLanguagePreference,
} from "./locales";

describe("locales supportées", () => {
  it("se limite à en et fr", () => {
    expect([...SUPPORTED_DISPLAY_LOCALES].sort()).toEqual(["en", "fr"]);
  });

  it("n'a que les dossiers de catalogue en et fr", () => {
    const dirs = readdirSync(resolve(process.cwd(), "src/i18n/locales")).sort();
    expect(dirs).toEqual(["en", "fr"]);
  });

  it("garde l'anglais comme source", () => {
    expect(SOURCE_LOCALE).toBe("en");
  });
});

describe("resolveDisplayLocale", () => {
  it("suit la première langue préférée du système en mode automatique", () => {
    expect(resolveDisplayLocale("auto", ["fr-FR", "en-US"])).toBe("fr");
    expect(resolveDisplayLocale("auto", ["en-US", "fr-FR"])).toBe("en");
    expect(resolveDisplayLocale(undefined, ["fr"])).toBe("fr");
  });

  it("retombe sur l'anglais sans catalogue pour la langue du système", () => {
    expect(resolveDisplayLocale("auto", ["zh-CN", "fr-FR"])).toBe("en");
    expect(resolveDisplayLocale("auto", ["de-DE"])).toBe("en");
    expect(resolveDisplayLocale("auto", [])).toBe("en");
    expect(resolveDisplayLocale("auto", null)).toBe("en");
    expect(resolveDisplayLocale("auto", ["xx-invalid"])).toBe("en");
  });

  it("donne la priorité au réglage explicite sur le système", () => {
    expect(resolveDisplayLocale("fr", ["en-US"])).toBe("fr");
    expect(resolveDisplayLocale("en", ["fr-FR"])).toBe("en");
  });

  it("traite une valeur inconnue comme le mode automatique", () => {
    expect(resolveDisplayLocale("de", ["fr-FR"])).toBe("fr");
    expect(resolveDisplayLocale("de", ["zh-CN"])).toBe("en");
  });
});

describe("legacyDisplayLocale", () => {
  it("reproduit l'ancienne règle : anglais seulement pour une langue en", () => {
    expect(legacyDisplayLocale("en-US")).toBe("en");
    expect(legacyDisplayLocale("de")).toBe("fr");
    expect(legacyDisplayLocale(undefined)).toBe("fr");
  });
});

describe("resolveUiLanguagePreference", () => {
  it("lit le réglage enregistré", () => {
    expect(
      resolveUiLanguagePreference({
        values: { ui_language: "en", ai_language: "fr" },
        hasValues: new Set(["ui_language", "ai_language"]),
      }),
    ).toBe("en");
  });

  it("garde la langue affichée jusqu'ici pour un profil existant", () => {
    expect(
      resolveUiLanguagePreference({
        values: { ai_language: "de" },
        hasValues: new Set(["ai_language"]),
      }),
    ).toBe("fr");
  });

  it("reste en automatique pour un nouveau profil", () => {
    expect(
      resolveUiLanguagePreference({ values: {}, hasValues: new Set() }),
    ).toBe("auto");
  });
});
