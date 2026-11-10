import { t } from "@lingui/core/macro";
import { downloadDir, homeDir } from "@tauri-apps/api/path";
import { open as selectFile } from "@tauri-apps/plugin-dialog";

type UploadKind = "audio" | "transcript";

/**
 * Sans dossier Téléchargements XDG (profil sans `user-dirs.dirs`),
 * `downloadDir()` rejette : on se rabat sur le dossier personnel, puis on
 * laisse le sélecteur choisir. Il doit toujours s'ouvrir (issue 525).
 */
export async function resolveUploadDefaultPath(): Promise<string | undefined> {
  for (const resolve of [downloadDir, homeDir]) {
    try {
      const path = await resolve();
      if (path) {
        return path;
      }
    } catch {
      // Dossier indisponible : on essaie le suivant.
    }
  }
  return undefined;
}

/** Ouvre le sélecteur ; retourne le chemin choisi, ou `null` si annulé. */
export async function selectUploadFile(
  kind: UploadKind,
  extensions: string[],
): Promise<string | null> {
  const defaultPath = await resolveUploadDefaultPath();
  const selection = await selectFile({
    title: kind === "audio" ? t`Upload audio` : t`Upload transcript`,
    multiple: false,
    directory: false,
    defaultPath,
    filters: [{ name: kind === "audio" ? "Audio" : "Transcript", extensions }],
  });
  const path = Array.isArray(selection) ? selection[0] : selection;
  return path || null;
}
