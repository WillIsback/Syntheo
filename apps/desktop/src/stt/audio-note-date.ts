import {
  type AudioSourceMetadata,
  commands as fsSyncCommands,
} from "@syntheo/plugin-fs-sync";

export function estimateUploadedAudioSessionCreatedAt(
  metadata: Pick<
    AudioSourceMetadata,
    "createdAt" | "modifiedAt" | "durationMs"
  >,
): string | null {
  const anchor = metadata.createdAt ?? metadata.modifiedAt;
  if (!anchor) {
    return null;
  }

  const anchorMs = Date.parse(anchor);
  if (Number.isNaN(anchorMs)) {
    return null;
  }

  const durationMs =
    typeof metadata.durationMs === "number" && metadata.durationMs > 0
      ? metadata.durationMs
      : 0;

  return new Date(Math.max(0, anchorMs - durationMs)).toISOString();
}

// Durée de l'audio importé en secondes (issue 526), `null` si inconnue.
function audioSeconds(durationMs: number | null) {
  return durationMs !== null && durationMs > 0 ? durationMs / 1000 : null;
}

export async function readAudioSeconds(filePath: string) {
  try {
    const result = await fsSyncCommands.audioSourceMetadata(filePath);
    return result.status === "ok" ? audioSeconds(result.data.durationMs) : null;
  } catch {
    return null;
  }
}
