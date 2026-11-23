import { commands as fsSyncCommands } from "@syntheo/plugin-fs-sync";
import { commands } from "@syntheo/plugin-session";

import {
  requireBasename,
  requireText,
  validateAttachmentInput,
} from "./attachment-validation";
import { normalizeFolderPath } from "./folders";

import { liveQueryClient, useLiveQuery } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";

type FolderMaterialRecord = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  relativePath: string;
};

type FolderMaterialSqlRow = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  relative_path: string;
};

const EMPTY_FOLDER_MATERIALS: FolderMaterialRecord[] = [];

const FOLDER_MATERIAL_COLUMNS = `
  SELECT id, filename, content_type, size_bytes, relative_path
  FROM folder_attachments
`;

function mapFolderMaterial(row: FolderMaterialSqlRow): FolderMaterialRecord {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    relativePath: row.relative_path,
  };
}

export function useFolderMaterials(folderPath: string): FolderMaterialRecord[] {
  const { data = EMPTY_FOLDER_MATERIALS } = useLiveQuery<
    FolderMaterialSqlRow,
    FolderMaterialRecord[]
  >({
    sql: `
      ${FOLDER_MATERIAL_COLUMNS}
      WHERE folder_path = ?
        AND deleted_at IS NULL
      ORDER BY filename, id
    `,
    params: [folderPath],
    enabled: folderPath.length > 0,
    mapRows: (rows) => rows.map(mapFolderMaterial),
  });
  return data;
}

export async function loadFolderMaterials(
  folderPath: string,
): Promise<FolderMaterialRecord[]> {
  const namedPath = requireNamedFolderPath(folderPath);
  const rows = await liveQueryClient.execute<FolderMaterialSqlRow>(
    `
      ${FOLDER_MATERIAL_COLUMNS}
      WHERE folder_path = ?
        AND deleted_at IS NULL
      ORDER BY filename, id
    `,
    [namedPath],
  );
  return rows.map(mapFolderMaterial);
}

export async function loadFolderMaterial(
  folderPath: string,
  attachmentId: string,
): Promise<FolderMaterialRecord | null> {
  const namedPath = requireNamedFolderPath(folderPath);
  const materialId = requireText(attachmentId, "folder material ID", 512);
  const rows = await liveQueryClient.execute<FolderMaterialSqlRow>(
    `
      ${FOLDER_MATERIAL_COLUMNS}
      WHERE folder_path = ?
        AND id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [namedPath, materialId],
  );
  const row = rows[0];
  return row ? mapFolderMaterial(row) : null;
}

export async function catalogLocalFolderMaterial(input: {
  folderPath: string;
  attachmentId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<void> {
  const folderPath = requireNamedFolderPath(input.folderPath);
  const { attachmentId, filename, contentType } =
    validateAttachmentInput(input);

  await enqueueDatabaseWrite(`folder:${folderPath}`, async () => {
    const result = await commands.catalogFolderMaterial({
      folder_path: folderPath,
      attachment_id: attachmentId,
      filename,
      content_type: contentType,
      size_bytes: input.sizeBytes,
      sha256: input.sha256,
    });
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export async function deleteLocalFolderMaterial(input: {
  folderPath: string;
  attachmentId: string;
}): Promise<void> {
  const folderPath = requireNamedFolderPath(input.folderPath);
  const attachmentId = requireBasename(input.attachmentId, "attachment ID");
  await enqueueDatabaseWrite(`folder:${folderPath}`, async () => {
    const tombstoned = await commands.tombstoneFolderMaterial({
      folder_path: folderPath,
      attachment_id: attachmentId,
    });
    if (tombstoned.status === "error") {
      throw new Error(tombstoned.error);
    }

    const result = await fsSyncCommands.folderAttachmentRemove(
      folderPath,
      attachmentId,
    );
    if (result.status === "error") {
      throw new Error(result.error);
    }
  });
}

export function diskAttachmentId(relativePath: string): string {
  const parts = relativePath.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

function requireNamedFolderPath(value: string): string {
  const normalized = normalizeFolderPath(value);
  if (!normalized) {
    throw new Error("invalid folder path");
  }
  return normalized;
}
