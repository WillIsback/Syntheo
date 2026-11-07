import { useQuery } from "@tanstack/react-query";
import { downloadDir } from "@tauri-apps/api/path";

import { getStoredSettingValues } from "~/settings/queries";

// Dossier d'enregistrement de l'export, affiché sous « Enregistrer » (étude
// UX de la navigation, section 6) : la personne sait où chercher le fichier.
export type ExportFolder = {
  path: string;
  // Aucun dossier choisi dans les paramètres : Téléchargements.
  isDownloads: boolean;
};

export async function resolveExportFolder(): Promise<ExportFolder> {
  const { values } = await getStoredSettingValues();
  if (values.export_directory) {
    return { path: values.export_directory, isDownloads: false };
  }
  return { path: await downloadDir(), isDownloads: true };
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
