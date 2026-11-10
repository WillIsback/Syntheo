import { describe, expect, it, vi } from "vitest";

import { isKeychainAccessError, localizeSecureStoreError } from "./keychain";

vi.mock("@syntheo/plugin-store2", () => ({ commands: {} }));

// Issue 560 : sans Secret Service, l'erreur brute du trousseau s'affichait.
describe("localizeSecureStoreError", () => {
  it.each([
    "Linux Secret Service is unavailable. Start your desktop keyring service, then try again.",
    "No default store has been set, so cannot search or create entries",
  ])("explains a missing system keyring (%s)", (raw) => {
    expect(localizeSecureStoreError(raw)).toBe(
      "The system keyring is unavailable, so Syntheo can't save this key. Start your desktop's keyring service (GNOME Keyring or KWallet, for example), then try again.",
    );
  });

  it("explains a locked system keyring", () => {
    expect(
      localizeSecureStoreError(
        "Linux couldn't access Secret Service. Unlock your login keyring, then try again.",
      ),
    ).toBe(
      "Syntheo couldn't access the system keyring. Unlock your login keyring, then try again.",
    );
  });

  it("keeps the macOS Keychain error detectable for its repair action", () => {
    const raw =
      "macOS couldn't access your login Keychain. Use “Repair Keychain Access” below, then try again.";
    expect(localizeSecureStoreError(raw)).toBe(raw);
    expect(isKeychainAccessError(new Error(raw))).toBe(true);
  });
});
