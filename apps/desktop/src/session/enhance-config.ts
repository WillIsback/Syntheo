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
 * Synthèse coupée par l'administration (intelligence_disabled) : l'onglet le
 * dit, sans bouton qui aboutirait à « Set up AI summaries first. »
 * (issue 707).
 */
export function isSummaryManagedOff(status: LLMConnectionStatus) {
  return status.status === "pending" && status.reason === "managed_disabled";
}
