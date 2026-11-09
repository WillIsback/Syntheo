import { commands as transcriptionCommands } from "@syntheo/plugin-transcription";

/**
 * Un fichier déposé sans chemin disque (WebKitGTK, WebView2) est lu ici par
 * morceaux et transmis à Rust, qui le garde en mémoire jusqu'au batch : rien
 * n'est écrit sur le disque, et la webview ne charge jamais tout le fichier
 * d'un coup (issue 464).
 */
export const AUDIO_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
/** Même plafond que `MAX_AUDIO_UPLOAD_BYTES` côté Rust. */
export const MAX_AUDIO_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export class AudioUploadTooLargeError extends Error {
  constructor() {
    super("audio_upload_too_large");
    this.name = "AudioUploadTooLargeError";
  }
}

export async function streamAudioFileToMemory(
  file: Pick<File, "name" | "size" | "slice">,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
    throw new AudioUploadTooLargeError();
  }

  const begun = await transcriptionCommands.beginAudioUpload(
    file.name,
    file.size,
  );
  if (begun.status === "error") {
    throw new Error(begun.error);
  }

  const uploadId = begun.data;
  try {
    for (
      let offset = 0;
      offset < file.size;
      offset += AUDIO_UPLOAD_CHUNK_BYTES
    ) {
      const chunk = new Uint8Array(
        await file
          .slice(offset, offset + AUDIO_UPLOAD_CHUNK_BYTES)
          .arrayBuffer(),
      );
      if (chunk.byteLength === 0) {
        throw new Error("audio_upload_incomplete");
      }
      const appended = await transcriptionCommands.appendAudioUpload(
        uploadId,
        bytesToBase64(chunk),
      );
      if (appended.status === "error") {
        throw new Error(appended.error);
      }
      onProgress?.(Math.min(1, (offset + chunk.byteLength) / file.size));
    }
    return uploadId;
  } catch (error) {
    await discardAudioUpload(uploadId);
    throw error;
  }
}

/** Libère un envoi resté en mémoire ; sans effet s'il a déjà servi. */
export async function discardAudioUpload(uploadId: string) {
  try {
    await transcriptionCommands.discardAudioUpload(uploadId);
  } catch (error) {
    console.error("[upload] failed to discard in-memory audio:", error);
  }
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCodePoint(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}
