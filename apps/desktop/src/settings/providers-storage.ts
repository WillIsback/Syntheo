import { commands as store2Commands } from "@syntheo/plugin-store2";

import { executeTransaction } from "~/db";

export type AiProviderType = "llm" | "stt";

export type AiProviderConfig = {
  type: AiProviderType;
  base_url: string;
  api_key: string;
};

export type AppSettingRow = { id: string; value_json: string };

export const LEGACY_SETTINGS_ID = "legacy_settings_document";
const PROVIDER_SECRET_SCOPE = "ai-provider-api-keys";
export function parseAiProviders(
  rows: AppSettingRow[],
  type: AiProviderType,
): Record<string, AiProviderConfig> {
  const result: Record<string, AiProviderConfig> = {};
  const legacy = rows.find((row) => row.id === LEGACY_SETTINGS_ID);
  const legacyDocument = parseJsonObject(legacy?.value_json);
  const legacyAi = parseObjectValue(legacyDocument.ai);
  const legacyProviders = parseObjectValue(legacyAi[type]);

  for (const [providerId, value] of Object.entries(legacyProviders)) {
    const config = normalizeProvider(value, type);
    if (config) result[providerRowId(type, providerId)] = config;
  }

  const prefix = providerStorageId(type, "");
  for (const row of rows) {
    if (!row.id.startsWith(prefix)) continue;
    const providerId = row.id.slice(prefix.length);
    if (!providerId) continue;
    const config = parseProviderValue(row.value_json, type);
    if (config) result[providerRowId(type, providerId)] = config;
  }

  return result;
}

export function parseLegacyProvider(
  valueJson: string | undefined,
  type: AiProviderType,
  providerId: string,
): AiProviderConfig | undefined {
  return parseAiProviders(
    valueJson ? [{ id: LEGACY_SETTINGS_ID, value_json: valueJson }] : [],
    type,
  )[providerRowId(type, providerId)];
}

export function parseProviderValue(
  valueJson: string,
  type: AiProviderType,
): AiProviderConfig | undefined {
  try {
    return normalizeProvider(JSON.parse(valueJson), type);
  } catch {
    return undefined;
  }
}

function normalizeProvider(
  value: unknown,
  type: AiProviderType,
): AiProviderConfig | undefined {
  const row = parseObjectValue(value);
  if (Object.keys(row).length === 0) return undefined;
  return {
    type,
    base_url: typeof row.base_url === "string" ? row.base_url : "",
    api_key: typeof row.api_key === "string" ? row.api_key : "",
  };
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    return parseObjectValue(JSON.parse(value));
  } catch {
    return {};
  }
}

function parseObjectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getProviderApiKey(
  type: AiProviderType,
  providerId: string,
): Promise<string | null> {
  const result = await store2Commands.getSecret(
    PROVIDER_SECRET_SCOPE,
    providerRowId(type, providerId),
  );
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

export async function setProviderApiKey(
  type: AiProviderType,
  providerId: string,
  apiKey: string,
): Promise<void> {
  const key = providerRowId(type, providerId);
  const result = apiKey
    ? await store2Commands.setSecret(PROVIDER_SECRET_SCOPE, key, apiKey)
    : await store2Commands.deleteSecret(PROVIDER_SECRET_SCOPE, key);
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

export async function migratePlaintextProviderApiKeys(
  rows: AppSettingRow[],
  type: AiProviderType,
): Promise<boolean> {
  const legacyRow = rows.find((row) => row.id === LEGACY_SETTINGS_ID);
  const legacyProviders = parseAiProviders(legacyRow ? [legacyRow] : [], type);
  const directProviders = parseAiProviders(
    rows.filter((row) => row.id.startsWith(providerStorageId(type, ""))),
    type,
  );
  const rowIds = new Set([
    ...Object.keys(legacyProviders),
    ...Object.keys(directProviders),
  ]);
  const providerIds: string[] = [];

  for (const rowId of rowIds) {
    const providerId = rowId.slice(`${type}:`.length);
    const directApiKey = directProviders[rowId]?.api_key.trim() ?? "";
    const legacyApiKey = legacyProviders[rowId]?.api_key.trim() ?? "";
    if (!directApiKey && !legacyApiKey) continue;

    const existingApiKey = await getProviderApiKey(type, providerId);
    if (!existingApiKey) {
      await setProviderApiKey(type, providerId, directApiKey || legacyApiKey);
    }
    providerIds.push(providerId);
  }

  if (providerIds.length > 0) {
    await redactPlaintextProviderApiKeys(rows, type, providerIds);
  }

  return providerIds.length > 0;
}

async function redactPlaintextProviderApiKeys(
  rows: AppSettingRow[],
  type: AiProviderType,
  providerIds: string[],
): Promise<void> {
  const migrated = new Set(providerIds);
  const now = new Date().toISOString();
  const statements = rows.flatMap((row) => {
    const prefix = providerStorageId(type, "");
    if (!row.id.startsWith(prefix)) {
      return [];
    }

    const providerId = row.id.slice(prefix.length);
    const config = parseProviderValue(row.value_json, type);
    if (!migrated.has(providerId) || !config?.api_key) {
      return [];
    }

    return [
      {
        sql: `
          UPDATE app_settings
          SET value_json = ?, updated_at = ?
          WHERE id = ? AND value_json = ?
        `,
        params: [
          JSON.stringify({ ...config, api_key: "" }),
          now,
          row.id,
          row.value_json,
        ],
      },
    ];
  });

  const legacyRow = rows.find((row) => row.id === LEGACY_SETTINGS_ID);
  if (legacyRow) {
    let redactedLegacy = legacyRow.value_json;
    for (const providerId of providerIds) {
      redactedLegacy =
        redactLegacyProviderApiKey(redactedLegacy, type, providerId) ??
        redactedLegacy;
    }
    if (redactedLegacy !== legacyRow.value_json) {
      statements.push({
        sql: `
          UPDATE app_settings
          SET value_json = ?, updated_at = ?
          WHERE id = ?
        `,
        params: [redactedLegacy, now, LEGACY_SETTINGS_ID],
      });
    }
  }

  if (statements.length > 0) {
    await executeTransaction([
      { sql: `PRAGMA secure_delete = ON`, params: [] },
      ...statements,
    ]);
  }
}

export function redactLegacyProviderApiKey(
  valueJson: string | undefined,
  type: AiProviderType,
  providerId: string,
): string | null {
  if (!valueJson) return null;

  try {
    const document = JSON.parse(valueJson) as Record<string, unknown>;
    const ai = parseObjectValue(document.ai);
    const providers = parseObjectValue(ai[type]);
    const provider = parseObjectValue(providers[providerId]);
    if (typeof provider.api_key !== "string" || !provider.api_key) {
      return null;
    }

    provider.api_key = "";
    return JSON.stringify(document);
  } catch {
    return null;
  }
}

export function removeLegacyProvider(
  valueJson: string | undefined,
  type: AiProviderType,
  providerId: string,
): string | null {
  if (!valueJson) return null;

  try {
    const document = JSON.parse(valueJson) as Record<string, unknown>;
    const ai = parseObjectValue(document.ai);
    const providers = parseObjectValue(ai[type]);
    if (!(providerId in providers)) {
      return null;
    }

    delete providers[providerId];
    return JSON.stringify(document);
  } catch {
    return null;
  }
}

export function providerStorageId(
  type: AiProviderType,
  providerId: string,
): string {
  return `ai_provider:${type}:${providerId}`;
}

export function providerRowId(
  type: AiProviderType,
  providerId: string,
): string {
  return `${type}:${providerId}`;
}
