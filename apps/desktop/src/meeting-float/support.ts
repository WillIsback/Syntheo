import { platform } from "@tauri-apps/plugin-os";

// Le panneau natif macOS (swift-lib) n'a pas encore les commandes de pause
// (issue 353) : il reste masqué pendant la pause.
export function isPausedFloatingBarSupported(currentPlatform = platform()) {
  return currentPlatform === "windows" || currentPlatform === "linux";
}

export function isFloatingBarSupported(currentPlatform = platform()) {
  return (
    currentPlatform === "macos" ||
    currentPlatform === "windows" ||
    currentPlatform === "linux"
  );
}
