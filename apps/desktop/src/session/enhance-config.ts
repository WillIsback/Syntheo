import type { LLMConnectionStatus } from "~/ai/hooks";

export function shouldShowEmptySummaryConfigError(status: LLMConnectionStatus) {
  if (status.status === "pending") {
    return (
      status.reason === "missing_provider" || status.reason === "missing_model"
    );
  }

  if (status.status !== "error") {
    return false;
  }

  return status.reason === "missing_config";
}

/**
 * Synthèse coupée (intelligence_disabled, politique en vigueur ou copie
 * restée dans app_settings) : l'onglet n'offre pas de bouton qui aboutirait
 * à « Set up AI summaries first. » (issue 707). Le message « Réglé par votre
 * administrateur. » ne vient que de la politique (useIntelligenceDisabled).
 */
export function isSummaryOff(status: LLMConnectionStatus) {
  return status.status === "pending" && status.reason === "managed_disabled";
}
