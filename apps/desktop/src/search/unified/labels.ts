import { plural } from "@lingui/core/macro";

import { folderPathLabel } from "~/session/folders";

// Libellés communs à la palette et aux mentions.

/** « Réunion produit Atlas › Ateliers » : le chemin lisible d'un dossier. */
export function formatFolderPath(path: string): string {
  return folderPathLabel(path);
}

/** « 17 réunions » : nombre de notes d'un dossier. */
export function formatMeetingCount(count: number): string {
  return plural(count, { one: "# meeting", other: "# meetings" });
}
