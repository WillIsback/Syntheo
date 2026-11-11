type ModelEntry = {
  id: string;
  isDownloaded?: boolean;
};

type PreferredProviderModelOptions = {
  allowSavedModelWithoutChoices?: boolean;
  keepUnavailableSavedModel?: boolean;
};

// NVIDIA NeMo-Speech.cpp serves the single model it loaded and ignores the
// model named by the client; `/v1/models` announces it once the connection is
// tested. Until then the selection carries the reference streaming model.
export const NEMO_SPEECH_DEFAULT_MODEL = "nemotron-3.5-asr-streaming-0.6b";

// Model ids of the retired NVIDIA NIM protocol. A selection saved with one of
// them moves to the NeMo-Speech.cpp default without user action.
const RETIRED_NIM_MODELS = new Set([
  "nemotron-asr-streaming",
  "parakeet-tdt-0.6b-v3",
  "parakeet-tdt-0.6b-v2",
  "cache-aware-parakeet-rnnt-multi-asr-streaming-sortformer",
]);

const DEFAULT_EXTERNAL_STT_MODELS: Record<string, string> = {
  nvidia: NEMO_SPEECH_DEFAULT_MODEL,
};

// Providers that still exist. A selection saved with a removed cloud provider
// is cleared so the settings ask for an on-prem endpoint instead.
const KNOWN_STT_PROVIDERS = new Set(["openai", "nvidia"]);

export function getDefaultSttModel(provider?: string | null) {
  return provider ? DEFAULT_EXTERNAL_STT_MODELS[provider] : undefined;
}

export function normalizeStoredSttSelection(
  provider: string | undefined,
  model: string | undefined,
) {
  // Chaîne vide et non undefined : value_json est TEXT NOT NULL en base.
  const cleared = { provider: "", model: "" };

  if (!provider) {
    return { provider, model };
  }

  if (!KNOWN_STT_PROVIDERS.has(provider)) {
    return cleared;
  }

  if (provider === "nvidia" && model && RETIRED_NIM_MODELS.has(model)) {
    return { provider, model: NEMO_SPEECH_DEFAULT_MODEL };
  }

  return { provider, model };
}

export function getPreferredProviderModel(
  savedModel: string | undefined,
  models: ModelEntry[],
  options?: PreferredProviderModelOptions,
) {
  const selectableModels = models.filter((model) => model.isDownloaded ?? true);

  if (
    options?.keepUnavailableSavedModel &&
    savedModel &&
    models.some((model) => model.id === savedModel)
  ) {
    return savedModel;
  }

  if (savedModel && selectableModels.some((model) => model.id === savedModel)) {
    return savedModel;
  }

  if (selectableModels.length > 0) {
    return selectableModels[0].id;
  }

  if (options?.allowSavedModelWithoutChoices) {
    return savedModel ?? "";
  }

  return "";
}
