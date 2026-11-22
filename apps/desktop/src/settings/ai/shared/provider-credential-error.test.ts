import { i18n } from "@lingui/core";
import { afterEach, describe, expect, test } from "vitest";

import {
  ProviderCredentialError,
  validateProviderBaseUrl,
  type ProviderCredentialErrorCode,
} from "@syntheo/provider-validation";

import {
  describeProviderCredentialError,
  describeProviderCredentialErrorCode,
} from "./provider-credential-error";

import { messages as enMessages } from "~/i18n/locales/en/messages";
import { messages as frMessages } from "~/i18n/locales/fr/messages";

const CODES: ProviderCredentialErrorCode[] = [
  "invalid_url",
  "url_with_credentials",
  "https_required",
  "invalid_api_key",
  "key_rejected",
  "rate_limited",
  "verification_unavailable",
  "key_not_confirmed",
  "network",
];

describe("messages des refus de provider-validation (QA 0.8.0-3)", () => {
  afterEach(() => {
    i18n.load("en", enMessages);
    i18n.activate("en");
  });

  test("en français, l'URL invalide suit la langue de l'interface", () => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
    let error: unknown;
    try {
      validateProviderBaseUrl("not-a-url");
    } catch (caught) {
      error = caught;
    }
    expect(describeProviderCredentialError(error)).toBe(
      "Saisissez une URL de base valide.",
    );
  });

  test("en anglais, le même refus est en anglais", () => {
    i18n.load("en", enMessages);
    i18n.activate("en");
    expect(
      describeProviderCredentialError(
        new ProviderCredentialError("invalid_url"),
      ),
    ).toBe("Enter a valid base URL.");
  });

  test("chaque code a une traduction française distincte du texte source", () => {
    i18n.load("en", enMessages);
    i18n.activate("en");
    const english = CODES.map(describeProviderCredentialErrorCode);
    i18n.load("fr", frMessages);
    i18n.activate("fr");
    const french = CODES.map(describeProviderCredentialErrorCode);
    for (const [index, code] of CODES.entries()) {
      expect(french[index], code).not.toBe(english[index]);
      expect(french[index], code).toBeTruthy();
    }
  });

  test("une autre erreur n'a pas de message traduit", () => {
    expect(describeProviderCredentialError(new Error("autre"))).toBeNull();
  });
});
