import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  usesDeferredProviderAuthentication,
  validateProviderBaseUrl,
  verifyProviderCredentials,
} from "@syntheo/provider-validation";

import {
  type AiProviderConfig,
  type AiProviderType,
  type AppSettingRow,
  LEGACY_SETTINGS_ID,
  getProviderApiKey,
  migratePlaintextProviderApiKeys,
  parseAiProviders,
  parseLegacyProvider,
  parseProviderValue,
  providerRowId,
  providerStorageId,
  redactLegacyProviderApiKey,
  removeLegacyProvider,
  setProviderApiKey,
} from "./providers-storage";

import { providerFetch } from "~/ai/provider-fetch";
import { executeTransaction, liveQueryClient, useLiveQuery } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";

export {
  type AiProviderType,
  type AiProviderConfig,
  parseAiProviders,
} from "./providers-storage";

export { isKeychainAccessError, repairKeychainAccess } from "~/shared/keychain";
const EMPTY_PROVIDER_API_KEYS: Record<string, string> = {};
const EMPTY_ROWS: AppSettingRow[] = [];

export function useAiProviders(
  type: AiProviderType,
): Record<string, AiProviderConfig> {
  return useAiProvidersState(type).providers;
}

export function useAiProvidersState(type: AiProviderType): {
  providers: Record<string, AiProviderConfig>;
  isLoading: boolean;
  isReady: boolean;
} {
  const { data: rows = EMPTY_ROWS, isLoading: rowsLoading } = useLiveQuery<
    AppSettingRow,
    AppSettingRow[]
  >({
    sql: `SELECT id, value_json FROM app_settings ORDER BY id`,
    mapRows: (rows) => rows,
  });
  const providers = useMemo(() => parseAiProviders(rows, type), [rows, type]);
  const providerIds = Object.keys(providers).sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const secureApiKeysQuery = useQuery({
    queryKey: ["ai-provider-api-keys", type, providerIds],
    queryFn: () => loadSecureAiProviderApiKeys(providerIds, type),
    enabled: !rowsLoading,
    staleTime: Infinity,
  });
  const secureApiKeys = secureApiKeysQuery.data ?? EMPTY_PROVIDER_API_KEYS;
  // Consumers memoize model/transport chains on these objects, so they must
  // keep their identity across renders when nothing changed.
  const resolvedProviders = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(providers).map(([rowId, provider]) => [
          rowId,
          {
            ...provider,
            api_key: secureApiKeys[rowId] ?? provider.api_key,
          },
        ]),
      ),
    [providers, secureApiKeys],
  );

  return {
    providers: resolvedProviders,
    isLoading: rowsLoading || secureApiKeysQuery.isPending,
    isReady: !rowsLoading && secureApiKeysQuery.data !== undefined,
  };
}

export function useAiProvider(
  type: AiProviderType,
  providerId: string | null | undefined,
): AiProviderConfig | undefined {
  const providers = useAiProviders(type);
  return providerId ? providers[providerRowId(type, providerId)] : undefined;
}

export async function getStoredAiProvider(
  type: AiProviderType,
  providerId: string,
): Promise<AiProviderConfig | undefined> {
  const rows = await liveQueryClient.execute<AppSettingRow>(
    `
      SELECT id, value_json
      FROM app_settings
      WHERE id IN (?, ?)
    `,
    [providerStorageId(type, providerId), LEGACY_SETTINGS_ID],
  );
  const provider = parseAiProviders(rows, type)[
    providerRowId(type, providerId)
  ];
  if (!provider) return undefined;

  const secureApiKey = await getProviderApiKey(type, providerId);
  return {
    ...provider,
    api_key: secureApiKey ?? provider.api_key,
  };
}

export function setAiProvider(
  type: AiProviderType,
  providerId: string,
  changes: Partial<Pick<AiProviderConfig, "base_url" | "api_key">>,
): Promise<void> {
  const storageId = providerStorageId(type, providerId);
  return enqueueDatabaseWrite(storageId, async () => {
    const previousApiKey = await getProviderApiKey(type, providerId);

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const rows = await liveQueryClient.execute<AppSettingRow>(
          `
          SELECT id, value_json
          FROM app_settings
          WHERE id IN (?, ?)
        `,
          [storageId, LEGACY_SETTINGS_ID],
        );
        const direct = rows.find((row) => row.id === storageId);
        const legacy = parseLegacyProvider(
          rows.find((row) => row.id === LEGACY_SETTINGS_ID)?.value_json,
          type,
          providerId,
        );
        const current = direct
          ? (parseProviderValue(direct.value_json, type) ?? legacy)
          : legacy;
        const next: AiProviderConfig = {
          type,
          base_url: changes.base_url ?? current?.base_url ?? "",
          api_key: changes.api_key ?? previousApiKey ?? current?.api_key ?? "",
        };
        await setProviderApiKey(type, providerId, next.api_key);

        const persisted = { ...next, api_key: "" };
        const now = new Date().toISOString();
        const statements = [
          direct
            ? {
                sql: `
                UPDATE app_settings
                SET value_json = ?, updated_at = ?
                WHERE id = ? AND value_json = ?
              `,
                params: [
                  JSON.stringify(persisted),
                  now,
                  storageId,
                  direct.value_json,
                ],
              }
            : {
                sql: `
                INSERT INTO app_settings (id, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO NOTHING
              `,
                params: [storageId, JSON.stringify(persisted), now],
              },
        ];

        const legacyRow = rows.find((row) => row.id === LEGACY_SETTINGS_ID);
        const redactedLegacy = redactLegacyProviderApiKey(
          legacyRow?.value_json,
          type,
          providerId,
        );
        if (legacyRow && redactedLegacy) {
          statements.push({
            sql: `
            UPDATE app_settings
            SET value_json = ?, updated_at = ?
            WHERE id = ?
          `,
            params: [redactedLegacy, now, LEGACY_SETTINGS_ID],
          });
        }

        const [updated = 0] = await executeTransaction(statements);
        if (updated === 1) return;
      }

      throw new Error(`Provider ${type}:${providerId} changed too frequently`);
    } catch (error) {
      await setProviderApiKey(type, providerId, previousApiKey ?? "");
      throw error;
    }
  });
}

export function useSetAiProvider(
  type: AiProviderType,
  providerId: string,
  {
    verifyCredentials = false,
    defaultBaseUrl = "",
  }: { verifyCredentials?: boolean; defaultBaseUrl?: string } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    gcTime: 0,
    scope: { id: `ai-provider:${type}:${providerId}` },
    mutationKey: ["set-ai-provider", type, providerId],
    mutationFn: async (
      changes: Partial<Pick<AiProviderConfig, "base_url" | "api_key">>,
    ) => {
      const previous = await getStoredAiProvider(type, providerId);
      const apiKey = (changes.api_key ?? previous?.api_key ?? "").trim();
      const baseUrl =
        (changes.base_url ?? previous?.base_url ?? "").trim() ||
        defaultBaseUrl.trim();

      // L'URL est contrôlée à chaque écriture (HTTPS, ou HTTP vers un hôte
      // privé), même pour un provider on-prem dont la clé n'est vérifiée qu'à
      // l'usage : la sonde de clé ne doit pas être le seul porteur de la règle.
      if (baseUrl) {
        validateProviderBaseUrl(baseUrl);
      }

      // Les endpoints STT on-prem n'ont pas de sonde d'authentification
      // commune : leur clé est vérifiée à l'ouverture de la session.
      if (
        verifyCredentials ||
        usesDeferredProviderAuthentication(type, providerId)
      ) {
        await verifyProviderCredentials(
          {
            type,
            provider: providerId,
            baseUrl,
            apiKey,
          },
          providerFetch,
        );
        changes = { ...changes, base_url: baseUrl, api_key: apiKey };
      }
      await setAiProvider(type, providerId, changes);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["ai-provider-api-keys", type],
        }),
        queryClient.invalidateQueries({
          queryKey: ["default-ai-selection", type],
        }),
      ]);
    },
  });
}

export function clearAiProvider(
  type: AiProviderType,
  providerId: string,
): Promise<void> {
  const storageId = providerStorageId(type, providerId);
  return enqueueDatabaseWrite(storageId, async () => {
    const previousApiKey = await getProviderApiKey(type, providerId);

    try {
      await setProviderApiKey(type, providerId, "");

      const rows = await liveQueryClient.execute<AppSettingRow>(
        `
          SELECT id, value_json
          FROM app_settings
          WHERE id IN (?, ?)
        `,
        [storageId, LEGACY_SETTINGS_ID],
      );
      const direct = rows.find((row) => row.id === storageId);
      const legacyRow = rows.find((row) => row.id === LEGACY_SETTINGS_ID);
      const now = new Date().toISOString();
      const statements: Array<{ sql: string; params: unknown[] }> = [];

      if (direct) {
        statements.push({
          sql: `
            DELETE FROM app_settings
            WHERE id = ? AND value_json = ?
          `,
          params: [storageId, direct.value_json],
        });
      }

      const clearedLegacy = removeLegacyProvider(
        legacyRow?.value_json,
        type,
        providerId,
      );
      if (legacyRow && clearedLegacy) {
        statements.push({
          sql: `
            UPDATE app_settings
            SET value_json = ?, updated_at = ?
            WHERE id = ?
          `,
          params: [clearedLegacy, now, LEGACY_SETTINGS_ID],
        });
      }

      if (statements.length > 0) {
        await executeTransaction(statements);
      }
    } catch (error) {
      await setProviderApiKey(type, providerId, previousApiKey ?? "");
      throw error;
    }
  });
}

export function useClearAiProvider(type: AiProviderType, providerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["clear-ai-provider", type, providerId],
    mutationFn: () => clearAiProvider(type, providerId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["ai-provider-api-keys", type],
        }),
        queryClient.invalidateQueries({
          queryKey: ["default-ai-selection", type],
        }),
      ]);
    },
  });
}

export async function loadSecureAiProviderApiKeys(
  providerRowIds: string[],
  type: AiProviderType,
): Promise<Record<string, string>> {
  const apiKeys: Record<string, string> = {};

  for (const rowId of providerRowIds) {
    const providerId = rowId.slice(`${type}:`.length);
    const apiKey = await getProviderApiKey(type, providerId);
    if (apiKey) {
      apiKeys[rowId] = apiKey;
    }
  }

  return apiKeys;
}

export async function migratePlaintextAiProviderApiKeys(): Promise<void> {
  let rows = await liveQueryClient.execute<AppSettingRow>(
    `SELECT id, value_json FROM app_settings ORDER BY id`,
  );
  const migratedLlm = await migratePlaintextProviderApiKeys(rows, "llm");
  if (migratedLlm) {
    rows = await liveQueryClient.execute<AppSettingRow>(
      `SELECT id, value_json FROM app_settings ORDER BY id`,
    );
  }
  const migratedStt = await migratePlaintextProviderApiKeys(rows, "stt");
  if (migratedLlm || migratedStt) {
    await liveQueryClient.execute(`PRAGMA wal_checkpoint(TRUNCATE)`);
  }
}
