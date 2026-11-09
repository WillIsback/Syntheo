import type { LanguageModel } from "ai";

// Le modèle local configuré (Paramètres › Synthèse), le même que celui de la
// synthèse et du chat. Les automatisations tournent hors de React : la
// racine de l'application enregistre ici de quoi le lire au moment voulu.

type LanguageModelGetter = () => LanguageModel | null;

let getModel: LanguageModelGetter = () => null;

export function registerAutomationLanguageModel(
  getter: LanguageModelGetter,
): () => void {
  getModel = getter;
  return () => {
    if (getModel === getter) {
      getModel = () => null;
    }
  };
}

export function automationLanguageModel(): LanguageModel | null {
  return getModel();
}
