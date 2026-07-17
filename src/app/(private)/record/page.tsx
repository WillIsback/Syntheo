"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const ACCEPTED = ".wav,.mp3,.mp4,.m4a,.ogg,.webm,.flac,.aac";

export default function RecordPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<
    "idle" | "creating" | "uploading" | "done"
  >("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleFileChange() {
    const file = inputRef.current?.files?.[0];
    setFileName(file?.name ?? null);
    setError(null);
  }

  async function handleSubmit() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Sélectionnez un fichier audio avant de soumettre.");
      return;
    }

    setError(null);
    setUploadState("creating");
    setUploadProgress(0);

    try {
      // Phase 1 : créer la session en BDD (métadonnées seulement)
      const durationS = await new Promise<number | undefined>((resolve) => {
        const audio = new Audio();
        const url = URL.createObjectURL(file);
        audio.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve(Number.isFinite(audio.duration) ? audio.duration : undefined);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(undefined);
        };
        audio.src = url;
      });

      const initRes = await fetch("/api/transcribe/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          ...(durationS !== undefined && { durationS }),
        }),
      });
      if (!initRes.ok) throw new Error("Échec de la création de session.");
      const { sessionId } = (await initRes.json()) as { sessionId: string };
      const mimeType = file.type || "application/octet-stream";

      // Phase 2 : demander une URL présignée puis uploader directement vers
      // le stockage (contourne la limite de payload des Vercel Functions)
      const uploadUrlRes = await fetch(
        `/api/transcribe/${sessionId}/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mimeType }),
        },
      );
      if (!uploadUrlRes.ok)
        throw new Error("Échec de la préparation de l'envoi.");
      const { uploadUrl, objectKey } = (await uploadUrlRes.json()) as {
        uploadUrl: string;
        objectKey: string;
      };

      setUploadState("uploading");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", mimeType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () =>
          xhr.status < 400
            ? resolve()
            : reject(new Error(`Échec de l'envoi : ${xhr.status}`));
        xhr.onerror = () =>
          reject(new Error("Échec de l'envoi du fichier audio."));
        xhr.send(file);
      });

      // Phase 3 : déclencher la transcription à partir du fichier uploadé
      const audioRes = await fetch(`/api/transcribe/${sessionId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey, filename: file.name, mimeType }),
      });
      if (!audioRes.ok)
        throw new Error("Échec du lancement de la transcription.");

      setUploadState("done");
      router.refresh();
      router.push(`/sessions/${sessionId}`);
    } catch (cause) {
      setUploadState("idle");
      setError(
        cause instanceof Error
          ? cause.message
          : "La transcription a échoué. Réessayez.",
      );
    }
  }

  const isPending = uploadState !== "idle";
  let buttonLabel = "Transcrire";
  if (uploadState === "creating") {
    buttonLabel = "Création de la session…";
  } else if (uploadState === "uploading") {
    const progressLabel = uploadProgress > 0 ? `${uploadProgress} %` : "";
    buttonLabel = `Envoi du fichier… ${progressLabel}`;
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-(--syn-bg) p-6">
      <div className="w-full max-w-140 rounded-2xl border border-(--syn-border) bg-(--syn-surface) p-8">
        <h1 className="mb-1 text-[18px] font-semibold text-(--syn-text)">
          Nouvelle transcription
        </h1>
        <p className="mb-6 text-[13px] text-(--syn-text-3)">
          Importez un fichier audio ou vidéo. Le fichier transite par un
          stockage temporaire chiffré puis est immédiatement supprimé après
          traitement — aucun enregistrement n&apos;est conservé.
        </p>

        <label
          htmlFor="audio-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-(--syn-border) p-8 transition hover:border-(--syn-blue) hover:bg-(--syn-bg)"
        >
          <span className="text-3xl">🎙</span>
          <span className="text-[13.5px] font-medium text-(--syn-text-2)">
            {fileName ?? "Cliquez ou déposez un fichier ici"}
          </span>
          <span className="text-[11.5px] text-(--syn-text-3)">
            WAV, MP3, MP4, M4A, OGG, WebM, FLAC, AAC
          </span>
          <input
            id="audio-file"
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            onChange={handleFileChange}
          />
        </label>

        {uploadState === "uploading" && uploadProgress > 0 && (
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-(--syn-border)">
            <div
              className="h-full bg-(--syn-blue) transition-[width]"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="mt-6 w-full rounded-full bg-(--syn-blue) px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {buttonLabel}
            </span>
          ) : (
            "Transcrire"
          )}
        </button>
      </div>
    </main>
  );
}
