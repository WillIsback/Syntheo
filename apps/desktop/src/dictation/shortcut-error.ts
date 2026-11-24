import { t } from "@lingui/core/macro";

import { describeServiceError, errorText } from "~/shared/service-error";

// Refus du raccourci de dictée (plugin shortcut, côté Rust) : messages
// anglais fixes, traduits ici (passe QA 0.8.1-1 : toast brut quand le
// bureau Wayland n'offre pas le portail Global Shortcuts). Un autre message
// passe par les erreurs de serveur (issue 713).
export function describeDictationError(error: unknown): string {
  const message = errorText(error);
  // Code stable du plugin pour tout échec du portail (passe QA 0.8.1-2) ;
  // messages bruts d'avant gardés en repli.
  if (
    message.trim() === "portal_unavailable" ||
    message.includes("Global Shortcuts portal") ||
    message.includes("Portal request failed")
  ) {
    return t`This desktop does not offer global shortcuts to apps (Global Shortcuts portal): dictation by shortcut is not available in this session.`;
  }
  if (message.includes("Global shortcuts are unavailable")) {
    return t`Global shortcuts are not available in this desktop session: dictation by shortcut is not available.`;
  }
  if (message.includes("Shortcut setup timed out")) {
    return t`The shortcut was not set up in time. Try again and approve your desktop's shortcut prompt.`;
  }
  if (message.includes("Could not register dictation shortcut")) {
    return t`The dictation shortcut could not be registered: another app may already use it. Choose another shortcut.`;
  }
  const unsupportedKey =
    /The (.+) key is not supported for Wayland dictation shortcuts/.exec(
      message,
    );
  if (unsupportedKey) {
    const key = unsupportedKey[1];
    return t`The ${key} key cannot be used for dictation shortcuts on Wayland. Choose another key.`;
  }
  if (message.includes("Invalid dictation shortcut")) {
    return t`This dictation shortcut is not valid. Choose another one.`;
  }
  if (
    message.includes("Choose a shortcut with Control, Alt, Shift, or Command")
  ) {
    return t`Choose a shortcut with Control, Alt, Shift, or Command.`;
  }
  if (message.includes("Escape is reserved for cancelling dictation")) {
    return t`Escape is reserved for cancelling dictation. Choose another key.`;
  }
  return describeServiceError(error);
}
