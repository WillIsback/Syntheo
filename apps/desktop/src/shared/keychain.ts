import { t } from "@lingui/core/macro";

import { commands as store2Commands } from "@syntheo/plugin-store2";

const MACOS_KEYCHAIN_ACCESS_ERROR_PREFIX =
  "macOS couldn't access your login Keychain.";

export function isKeychainAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith(MACOS_KEYCHAIN_ACCESS_ERROR_PREFIX);
}

// Messages du trousseau Linux renvoyés par store2 (commands.rs), en anglais.
// Le texte brut de keyring (« No default store… ») est gardé pour une app dont
// la partie native serait plus ancienne.
const LINUX_SECRET_SERVICE_ACCESS_ERROR =
  "Linux couldn't access Secret Service. Unlock your login keyring, then try again.";
const LINUX_SECRET_SERVICE_UNAVAILABLE_ERRORS = [
  "Linux Secret Service is unavailable. Start your desktop keyring service, then try again.",
  "No default store has been set, so cannot search or create entries",
];

// Issue 560 : l'erreur du trousseau s'affichait brute, en anglais.
export function localizeSecureStoreError(message: string): string {
  if (message === LINUX_SECRET_SERVICE_ACCESS_ERROR) {
    return t`Syntheo couldn't access the system keyring. Unlock your login keyring, then try again.`;
  }
  if (LINUX_SECRET_SERVICE_UNAVAILABLE_ERRORS.includes(message)) {
    return t`The system keyring is unavailable, so Syntheo can't save this key. Start your desktop's keyring service (GNOME Keyring or KWallet, for example), then try again.`;
  }
  return message;
}

export async function repairKeychainAccess(): Promise<void> {
  const result = await store2Commands.repairKeychainAccess();
  if (result.status === "error") {
    throw new Error(result.error);
  }
}
