import { useQuery } from "@tanstack/react-query";
import { downloadDir } from "@tauri-apps/api/path";

import { getStoredSettingValues } from "~/settings/queries";

// Dossier d'enregistrement de l'export, affiché sous « Enregistrer » (étude
// UX de la navigation, section 6) : la personne sait où chercher le fichier.
type ExportFolder = {
  path: string;
  // Aucun dossier choisi dans les paramètres : Téléchargements.
  isDownloads: boolean;
};

/**
 * Dossier d'export : celui des paramètres, sinon Téléchargements. `null`
 * quand le système n'a pas de dossier Téléchargements (pas de dossiers
 * utilisateur XDG, issue 615) : l'export passe alors par « Enregistrer
 * sous ». Une lecture des paramètres en échec reste une erreur : on n'écrit
 * pas ailleurs que dans le dossier choisi par la personne.
 */
export async function resolveExportFolder(): Promise<ExportFolder | null> {
  const { values } = await getStoredSettingValues();
  if (values.export_directory) {
    return { path: values.export_directory, isDownloads: false };
  }
  try {
    return { path: await downloadDir(), isDownloads: true };
  } catch (error) {
    console.warn("[export] no Downloads folder, asking where to save", error);
    return null;
  }
}

// Dernier élément du chemin, sous Windows comme ailleurs.
export function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function useExportFolder(enabled: boolean) {
  return useQuery({
    queryKey: ["export-folder"],
    queryFn: resolveExportFolder,
    enabled,
    staleTime: 0,
    retry: false,
  });
}
