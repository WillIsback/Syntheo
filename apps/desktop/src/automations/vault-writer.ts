import { md2json } from "@syntheo/editor/markdown";

import type { VaultWriteMode } from "./steps";

import { liveQueryClient } from "~/db";
import { loadSessionContentSnapshot } from "~/session/content-queries";
import { createNamedFolder } from "~/session/folder-catalog";
import { normalizeFolderPath } from "~/session/folders";
import { createSession } from "~/session/queries/creation";
import { loadFolderPaths } from "~/session/queries/folders";
import { updateSession } from "~/session/queries/sessions";

// Étape « Écrire dans le coffre » : crée une note du coffre, ou complète la
// note du même titre dans le dossier choisi. Passe par les mêmes fonctions
// que l'interface (création de note, dossiers), donc par la même base locale.

export type VaultWriteRequest = {
  folder: string;
  title: string;
  content: string;
  mode: VaultWriteMode;
};

export type VaultWriteResult = { sessionId: string; created: boolean };

/** « Tâches / 2026-11 » → « Tâches/2026-11 » ; `null` si le chemin est invalide. */
function normalizeVaultFolder(folder: string): string | null {
  const segments = folder.split(/[\\/]/).map((segment) => segment.trim());
  while (segments.length > 0 && !segments[0]) {
    segments.shift();
  }
  while (segments.length > 0 && !segments[segments.length - 1]) {
    segments.pop();
  }
  return normalizeFolderPath(segments.join("/"));
}

export async function writeVaultNote(
  request: VaultWriteRequest,
): Promise<VaultWriteResult> {
  const folder = normalizeVaultFolder(request.folder);
  if (folder === null) {
    throw new Error(`invalid vault folder: ${request.folder}`);
  }
  if (folder && !(await loadFolderPaths()).includes(folder)) {
    await createNamedFolder(folder);
  }

  if (request.mode === "append") {
    const existing = await findNoteByTitle(folder, request.title);
    if (existing) {
      const snapshot = await loadSessionContentSnapshot(existing, {
        includeTranscriptWords: false,
      });
      const before = snapshot?.rawMarkdown.trim() ?? "";
      const merged = [before, request.content.trim()]
        .filter(Boolean)
        .join("\n\n");
      await updateSession(existing, {
        raw_md: JSON.stringify(md2json(merged)),
      });
      return { sessionId: existing, created: false };
    }
  }

  const sessionId = await createSession(request.title, undefined, {
    folder_id: folder,
    raw_md: JSON.stringify(md2json(request.content)),
  });
  return { sessionId, created: true };
}

async function findNoteByTitle(
  folder: string,
  title: string,
): Promise<string | null> {
  const rows = await liveQueryClient.execute<{ id: string }>(
    `
      SELECT id
      FROM sessions
      WHERE deleted_at IS NULL AND folder_path = ? AND title = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [folder, title],
  );
  return rows[0]?.id ?? null;
}
