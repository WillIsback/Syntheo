import { entries } from "virtual:changelog";

export type ChangelogEntry = (typeof entries)[number];

// Résolu au build par le plugin Vite : aucun téléchargement à l'exécution.
export const changelogEntries: readonly ChangelogEntry[] = entries;
