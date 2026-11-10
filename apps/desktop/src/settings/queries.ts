import { disable, enable } from "@tauri-apps/plugin-autostart";
import { useCallback } from "react";

import { commands as detectCommands } from "@syntheo/plugin-detect";
import { commands as templateCommands } from "@syntheo/plugin-template";
import { commands as trayCommands } from "@syntheo/plugin-tray";
import { commands as windowsCommands } from "@syntheo/plugin-windows";

import {
  type AppSettingRow,
  type StoredSettingValues,
  parseSettingRows,
  parseStringArray,
} from "./queries-parse";

import { executeTransaction, liveQueryClient, useLiveQuery } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";
import { normalizeStoredLlmSelection } from "~/settings/ai/llm/selection";
import {
  SETTING_DEFINITIONS,
  SYNCED_SETTING_KEYS,
  type SettingKey,
  type SettingValue,
  type SettingValues,
} from "~/settings/schema";
import {
  getDefaultSttModel,
  normalizeStoredSttSelection,
} from "~/stt/model-selection";

export { type StoredSettingValues, parseSettingRows } from "./queries-parse";

const EMPTY_STORED_SETTINGS: StoredSettingValues = {
  values: {},
  hasValues: new Set(),
};
const LEGACY_SUMMARY_TEMPLATE_TOKEN = /\{\{\s*template\s*\}\}/g;
const LEGACY_DEFAULT_SUMMARY_INSTRUCTION =
  "Use the selected summary template for the summary structure and section headings.";

// Synced rows sort after device rows so parseSettingRows' last-write-wins map
// prefers the synced value when a key exists in both tables.
const SETTING_ROWS_SQL = `
  SELECT id, value_json, 0 AS source_rank FROM app_settings
  UNION ALL
  SELECT id, value_json, 1 AS source_rank FROM synced_preferences
  ORDER BY id, source_rank
`;

export function useStoredSettingValuesQuery() {
  return useLiveQuery<AppSettingRow, StoredSettingValues>({
    sql: SETTING_ROWS_SQL,
    mapRows: parseSettingRows,
  });
}

export function useStoredSettingValues(): StoredSettingValues {
  const { data = EMPTY_STORED_SETTINGS } = useStoredSettingValuesQuery();
  return data;
}

export function useSettingsReady(): boolean {
  const { isLoading, error } = useStoredSettingValuesQuery();
  return !isLoading && !error;
}

export function useStoredSettingValue<K extends SettingKey>(
  key: K,
): {
  value: SettingValue<K> | undefined;
  hasValue: boolean;
} {
  const { values, hasValues } = useStoredSettingValues();
  return {
    value: values[key] as SettingValue<K> | undefined,
    hasValue: hasValues.has(key),
  };
}

export async function getStoredSettingValues(): Promise<StoredSettingValues> {
  const rows = await liveQueryClient.execute<AppSettingRow>(SETTING_ROWS_SQL);
  return parseSettingRows(rows);
}

export async function initializeApplicationSettings(): Promise<void> {
  const stored = await getStoredSettingValues();
  const languageResult = await detectCommands
    .getPreferredLanguages()
    .catch(() => null);
  const normalizedSttSelection = normalizeStoredSttSelection(
    stored.values.current_stt_provider,
    stored.values.current_stt_model,
  );
  const normalizedLlmSelection = normalizeStoredLlmSelection(
    stored.values.current_llm_provider,
    stored.values.current_llm_model,
  );

  const updates: SettingValues = {
    ...collectSelectionUpdates(
      stored,
      normalizedSttSelection,
      normalizedLlmSelection,
    ),
    ...collectLanguageUpdates(
      stored,
      languageResult?.status === "ok" ? languageResult.data : null,
    ),
  };

  if (!normalizedSttSelection.model) {
    const defaultModel = getDefaultSttModel(normalizedSttSelection.provider);
    if (defaultModel) {
      updates.current_stt_model = defaultModel;
    }
  }

  const migratedAutoPrompt = await migrateLegacyAutoSummaryPrompt(stored);
  if (migratedAutoPrompt !== null) {
    updates.auto_summary_prompt = migratedAutoPrompt;
  }

  if (Object.keys(updates).length > 0) {
    await setSettingValues(updates);
  }
  const current =
    Object.keys(updates).length > 0 ? await getStoredSettingValues() : stored;
  applySettingSideEffects(current.values);
}

function collectSelectionUpdates(
  stored: StoredSettingValues,
  sttSelection: ReturnType<typeof normalizeStoredSttSelection>,
  llmSelection: ReturnType<typeof normalizeStoredLlmSelection>,
): SettingValues {
  const updates: SettingValues = {};
  if (sttSelection.provider !== stored.values.current_stt_provider) {
    updates.current_stt_provider = sttSelection.provider;
  }
  if (sttSelection.model !== stored.values.current_stt_model) {
    updates.current_stt_model = sttSelection.model;
  }
  if (llmSelection.provider !== stored.values.current_llm_provider) {
    updates.current_llm_provider = llmSelection.provider;
  }
  if (llmSelection.model !== stored.values.current_llm_model) {
    updates.current_llm_model = llmSelection.model;
  }
  return updates;
}

function collectLanguageUpdates(
  stored: StoredSettingValues,
  preferredLanguages: readonly string[] | null,
): SettingValues {
  const updates: SettingValues = {};
  if (!preferredLanguages || preferredLanguages.length === 0) {
    return updates;
  }

  if (!stored.hasValues.has("ai_language")) {
    // Français d'abord : la transcription par défaut est le français.
    updates.ai_language = "fr";
  }

  const storedSpokenLanguages = parseStringArray(
    stored.values.spoken_languages ?? "[]",
  );
  const isSystemDefault =
    stored.values.ai_language === preferredLanguages[0] &&
    storedSpokenLanguages.length === preferredLanguages.length &&
    storedSpokenLanguages.every(
      (language, index) => language === preferredLanguages[index],
    );
  if (!stored.hasValues.has("spoken_languages") || isSystemDefault) {
    updates.spoken_languages = JSON.stringify(preferredLanguages.slice(1));
  }

  return updates;
}

async function migrateLegacyAutoSummaryPrompt(
  stored: StoredSettingValues,
): Promise<string | null> {
  if (
    stored.hasValues.has("auto_summary_prompt") ||
    !stored.hasValues.has("custom_summary_instructions")
  ) {
    return null;
  }

  const legacyInstructions = cleanLegacySummaryInstructions(
    stored.values.custom_summary_instructions ?? "",
  );
  if (!legacyInstructions) {
    return null;
  }

  try {
    const sourceResult =
      await templateCommands.getTemplateSource("enhanceFormat");
    if (sourceResult.status === "error" || !sourceResult.data.trim()) {
      return null;
    }

    return `${sourceResult.data.trimEnd()}\n\n${escapeJinjaOpeners(legacyInstructions)}`;
  } catch {
    return null;
  }
}

function cleanLegacySummaryInstructions(value: string): string {
  return value
    .replace(LEGACY_SUMMARY_TEMPLATE_TOKEN, "")
    .replace(LEGACY_DEFAULT_SUMMARY_INSTRUCTION, "")
    .trim();
}

function escapeJinjaOpeners(value: string): string {
  return value.replace(/\{\{|\{%|\{#/g, (opener) => `{{ "${opener}" }}`);
}

export function setSettingValue<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  return setSettingValues({ [key]: value } as SettingValues);
}

export function setSettingValues(values: SettingValues): Promise<void> {
  return enqueueDatabaseWrite("app-settings", () =>
    persistSettingValues(values),
  );
}

export function updateSettingValue<K extends SettingKey>(
  key: K,
  update: (current: SettingValue<K> | undefined) => SettingValue<K>,
): Promise<SettingValue<K>> {
  return enqueueDatabaseWrite("app-settings", async () => {
    const stored = await getStoredSettingValues();
    const definition = SETTING_DEFINITIONS[key];
    const fallback =
      "default" in definition
        ? (definition.default as SettingValue<K>)
        : undefined;
    const current = stored.hasValues.has(key)
      ? (stored.values[key] as unknown as SettingValue<K>)
      : fallback;
    const next = update(current);
    await persistSettingValues({ [key]: next } as SettingValues);
    return next;
  });
}

export function useSetSettingValue<K extends SettingKey>(key: K) {
  return useCallback(
    (value: SettingValue<K>) => {
      void setSettingValue(key, value).catch((error) => {
        console.error(`[settings] failed to update ${key}`, error);
      });
    },
    [key],
  );
}

export function useSetSettingValues() {
  return useCallback((values: SettingValues) => {
    void setSettingValues(values).catch((error) => {
      console.error("[settings] failed to update values", error);
    });
  }, []);
}

async function persistSettingValues(values: SettingValues): Promise<void> {
  const now = new Date().toISOString();
  const statements = Object.entries(values).map(([key, value]) => ({
    sql: SYNCED_SETTING_KEYS.has(key as SettingKey)
      ? `
      INSERT INTO synced_preferences (id, workspace_id, value_json, updated_at)
      VALUES (?, NULLIF((
        SELECT json_extract(value_json, '$.workspace_id')
        FROM app_settings
        WHERE id = 'cloudsync_workspace_binding'
      ), ''), ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `
      : `
      INSERT INTO app_settings (id, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
    params: [key, JSON.stringify(value), now],
  }));
  if (statements.length > 0) await executeTransaction(statements);
  applySettingSideEffects(values);
}

function applySettingSideEffects(values: SettingValues): void {
  if (values.autostart !== undefined) {
    void (values.autostart ? enable() : disable()).catch(console.error);
  }
  if (values.respect_dnd !== undefined) {
    void detectCommands
      .setRespectDoNotDisturb(values.respect_dnd)
      .catch(console.error);
  }
  if (values.ignored_platforms !== undefined) {
    void detectCommands
      .setIgnoredBundleIds(parseStringArray(values.ignored_platforms))
      .catch(console.error);
  }
  if (values.included_platforms !== undefined) {
    void detectCommands
      .setIncludedBundleIds(parseStringArray(values.included_platforms))
      .catch(console.error);
  }
  if (values.mic_active_threshold !== undefined) {
    void detectCommands
      .setMicActiveThreshold(values.mic_active_threshold)
      .catch(console.error);
  }
  if (values.show_app_in_dock !== undefined) {
    void windowsCommands
      .setShowAppInDock(values.show_app_in_dock)
      .catch(console.error);
  }
  if (values.show_tray_icon !== undefined) {
    void trayCommands
      .setTrayIconVisible(values.show_tray_icon)
      .catch(console.error);
  }
}
