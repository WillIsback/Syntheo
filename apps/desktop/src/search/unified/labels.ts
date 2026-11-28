import { plural } from "@lingui/core/macro";

import { folderPathLabel, parentFolderPath } from "~/session/folders";

// Libellés communs à la palette et aux mentions.

/** « Réunion produit Atlas › Ateliers » : le chemin lisible d'un dossier. */
export function formatFolderPath(path: string): string {
  return folderPathLabel(path);
}

/**
 * « Réunion produit Atlas › » : le dossier parent d'un sous-dossier, à lire
 * après son nom ; `""` pour un dossier à la racine.
 */
export function formatFolderParent(path: string): string {
  const parent = parentFolderPath(path);
  return parent ? `${formatFolderPath(parent)} ›` : "";
}

/** « 17 réunions » : nombre de notes d'un dossier. */
export function formatMeetingCount(count: number): string {
  return plural(count, { one: "# meeting", other: "# meetings" });
}
