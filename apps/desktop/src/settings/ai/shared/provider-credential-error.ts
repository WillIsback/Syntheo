import { t } from "@lingui/core/macro";

import {
  ProviderCredentialError,
  type ProviderCredentialErrorCode,
} from "@syntheo/provider-validation";

// Message traduit d'un refus de `@syntheo/provider-validation` : le paquet ne
// donne qu'un code (et un message anglais de repli pour les journaux).
export function describeProviderCredentialErrorCode(
  code: ProviderCredentialErrorCode,
): string {
  switch (code) {
    case "invalid_url":
      return t`Enter a valid base URL.`;
    case "url_with_credentials":
      return t`Enter a base URL without credentials or query parameters.`;
    case "https_required":
      return t`Use HTTPS: plain HTTP is only accepted on this computer or a private network.`;
    case "invalid_api_key":
      return t`Enter a valid API key.`;
    case "key_rejected":
      return t`The provider rejected this key or its permissions. Check the key and try again.`;
    case "rate_limited":
      return t`The provider is limiting verifications. Try again in a few moments.`;
    case "verification_unavailable":
      return t`This key could not be verified with the provider. Check the connection and try again.`;
    case "key_not_confirmed":
      return t`The provider did not confirm this key. Check the key and the connection.`;
    case "network":
      return t`This key could not be verified. Check your connection and try again.`;
  }
}

/** Message traduit d'une erreur de `@syntheo/provider-validation`, sinon `null`. */
export function describeProviderCredentialError(error: unknown): string | null {
  return error instanceof ProviderCredentialError
    ? describeProviderCredentialErrorCode(error.code)
    : null;
}
