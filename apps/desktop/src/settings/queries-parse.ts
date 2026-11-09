import { normalizeAudioRetentionOrUndefined } from "~/services/audio-retention-policy";
import {
  LEGACY_MAIN_VALUES_ID,
  LEGACY_SETTINGS_ID,
} from "~/settings/legacy-snapshots";
import {
  SETTING_DEFINITIONS,
  type SettingKey,
  type SettingValue,
  type SettingValues,
} from "~/settings/schema";

export type AppSettingRow = { id: string; value_json: string };

export type StoredSettingValues = {
  values: SettingValues;
  hasValues: Set<SettingKey>;
};

const JSON_ARRAY_KEYS = new Set<SettingKey>([
  "spoken_languages",
  "personalization_dictionary_terms",
  "ignored_platforms",
  "included_platforms",
]);
export function parseSettingRows(rows: AppSettingRow[]): StoredSettingValues {
  const directRows = new Map(rows.map((row) => [row.id, row.value_json]));
  const legacySettings = parseJsonObject(directRows.get(LEGACY_SETTINGS_ID));
  const legacyMainValues = parseJsonObject(
    directRows.get(LEGACY_MAIN_VALUES_ID),
  );
  const values: SettingValues = {};
  const hasValues = new Set<SettingKey>();

  for (const key of Object.keys(SETTING_DEFINITIONS) as SettingKey[]) {
    const directJson = directRows.get(key);
    const directValue =
      directJson === undefined ? INVALID : parseJsonValue(directJson);
    const normalizedDirect = normalizeSettingValue(key, directValue, true);
    if (normalizedDirect !== INVALID) {
      setParsedSetting(values, key, normalizedDirect);
      hasValues.add(key);
      continue;
    }

    const legacyValue = readLegacySettingValue(
      legacySettings,
      legacyMainValues,
      key,
    );
    const normalizedLegacy = normalizeSettingValue(key, legacyValue, false);
    if (normalizedLegacy !== INVALID) {
      setParsedSetting(values, key, normalizedLegacy);
      hasValues.add(key);
    }
  }

  return { values, hasValues };
}

function readLegacySettingValue(
  settingsDocument: Record<string, unknown>,
  mainValuesDocument: Record<string, unknown>,
  key: SettingKey,
): unknown {
  const definition = SETTING_DEFINITIONS[key];
  let value = getByPath(settingsDocument, definition.path);

  if (value === undefined && key === "ai_language") {
    value = getByPath(settingsDocument, ["general", "ai_language"]);
  } else if (value === undefined && key === "spoken_languages") {
    value = getByPath(settingsDocument, ["general", "spoken_languages"]);
  } else if (key === "audio_retention") {
    value =
      normalizeAudioRetentionOrUndefined(value) ??
      normalizeAudioRetentionOrUndefined(
        getByPath(settingsDocument, ["general", "saveAudioAfterMeeting"]),
      ) ??
      normalizeAudioRetentionOrUndefined(
        getByPath(settingsDocument, ["general", "save_recordings"]),
      ) ??
      normalizeAudioRetentionOrUndefined(mainValuesDocument.audio_retention) ??
      normalizeAudioRetentionOrUndefined(mainValuesDocument.save_recordings);
  }

  if (value === undefined) value = mainValuesDocument[key];

  return value;
}

const INVALID = Symbol("invalid-setting-value");

function normalizeSettingValue(
  key: SettingKey,
  value: unknown,
  direct: boolean,
): boolean | number | string | typeof INVALID {
  if (value === INVALID || value === undefined) return INVALID;

  if (key === "audio_retention") {
    return normalizeAudioRetentionOrUndefined(value) ?? INVALID;
  }

  if (JSON_ARRAY_KEYS.has(key)) {
    return normalizeJsonArraySettingValue(value, direct);
  }

  return normalizeTypedSettingValue(key, value);
}

function normalizeJsonArraySettingValue(
  value: unknown,
  direct: boolean,
): string | typeof INVALID {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value !== "string") return INVALID;
  try {
    return Array.isArray(JSON.parse(value)) ? value : INVALID;
  } catch {
    if (!direct && value.includes(",")) {
      return JSON.stringify(
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      );
    }
    return INVALID;
  }
}

function normalizeTypedSettingValue(
  key: SettingKey,
  value: unknown,
): boolean | number | string | typeof INVALID {
  const expectedType = SETTING_DEFINITIONS[key].type;
  if (expectedType === "boolean" && typeof value === "boolean") return value;
  if (expectedType === "number" && typeof value === "number") return value;
  if (expectedType === "string" && typeof value === "string") return value;
  return INVALID;
}

function setParsedSetting<K extends SettingKey>(
  values: SettingValues,
  key: K,
  value: boolean | number | string,
): void {
  (values as Record<string, unknown>)[key] = value as SettingValue<K>;
}

function getByPath(
  document: Record<string, unknown>,
  path: readonly [string, string],
): unknown {
  const section = document[path[0]];
  return section && typeof section === "object"
    ? (section as Record<string, unknown>)[path[1]]
    : undefined;
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseJsonValue(value: string | undefined): unknown {
  if (value === undefined) return INVALID;
  try {
    return JSON.parse(value);
  } catch {
    return INVALID;
  }
}

export function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}
