import { getCurrentWindow } from "@tauri-apps/api/window";

// Actions de fenêtre des raccourcis F10 et F11 (issue 372).

// Plein écran (F11 et menu Afficher).
export async function toggleFullscreen() {
  const appWindow = getCurrentWindow();
  const isFullscreen = await appWindow.isFullscreen();
  await appWindow.setFullscreen(!isFullscreen);
}

// F10 : focus sur le menu « Fichier » de la barre de titre, comme la barre de
// menus des applications Windows. Sans barre de titre (macOS), rien.
export const TITLE_BAR_FIRST_MENU_ATTRIBUTE = "data-title-bar-first-menu";

export function focusTitleBarMenu(): boolean {
  const trigger = document.querySelector<HTMLElement>(
    `[${TITLE_BAR_FIRST_MENU_ATTRIBUTE}]`,
  );
  if (!trigger) {
    return false;
  }

  trigger.focus();
  return true;
}
