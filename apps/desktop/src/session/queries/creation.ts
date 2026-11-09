import { commands } from "@syntheo/plugin-session";

import type { SessionChanges } from "./types";

import { ensureFolderCatalog } from "~/session/folder-catalog";
import { normalizeFolderPath } from "~/session/folders";
import { DEFAULT_USER_ID } from "~/shared/utils";

export async function createSession(
  title = "",
  userId = DEFAULT_USER_ID,
  initial?: Pick<SessionChanges, "folder_id" | "raw_md"> & {
    metadata_json?: string;
  },
): Promise<string> {
  const folderPath = normalizeFolderPath(initial?.folder_id ?? "") ?? "";

  const result = await commands.createSession({
    title,
    user_id: userId,
    metadata_json: initial?.metadata_json ?? "",
    folder_path: folderPath,
    raw_md: initial?.raw_md ?? "",
  });
  if (result.status === "error") throw new Error(result.error);
  const sessionId = result.data;

  if (folderPath) {
    await ensureFolderCatalog(folderPath);
  }

  return sessionId;
}
