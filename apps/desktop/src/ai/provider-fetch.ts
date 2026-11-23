import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { validateProviderRequestUrl } from "@syntheo/provider-validation";

// Requêtes vers les serveurs d'inférence (connexion, modèles, synthèse, chat).
// Issue 678 : la règle d'adresse est revalidée à chaque requête, avant tout
// envoi, et une redirection n'est jamais suivie (`maxRedirections: 0` : le
// plugin HTTP de Tauri ignore `redirect`).
export const providerFetch: typeof fetch = async (input, init) => {
  const url = validateProviderRequestUrl(
    input instanceof Request ? input.url : input,
  );
  const options = { ...init, maxRedirections: 0 };
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("Origin")) {
      // Tauri's unsafe-headers transport removes an empty Origin instead of
      // injecting the webview origin, which local servers can reject.
      headers.set("Origin", "");
      return tauriFetch(input, { ...options, headers });
    }
  }

  return tauriFetch(input, options);
};
