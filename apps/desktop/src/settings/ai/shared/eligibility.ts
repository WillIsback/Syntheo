export type ConfigField = "base_url" | "api_key";

export type ProviderRequirement =
  | { kind: "requires_auth" }
  | { kind: "requires_config"; fields: ConfigField[] }
  | { kind: "requires_platform"; platform: "apple_silicon" };

export type ProviderEligibilityContext = {
  isAuthenticated: boolean;
  config?: { base_url?: string; api_key?: string };
};

export function getProviderSelectionBlockers(
  requirements: readonly ProviderRequirement[],
  context: ProviderEligibilityContext,
): EligibilityBlocker[] {
  const blockers: EligibilityBlocker[] = [];

  for (const req of requirements) {
    switch (req.kind) {
      case "requires_auth":
        if (!context.isAuthenticated) {
          blockers.push({ code: "requires_auth" });
        }
        break;
      case "requires_config": {
        const missingFields = req.fields.filter((field) => {
          const value = context.config?.[field];
          return !value || value.trim() === "";
        });
        if (missingFields.length > 0) {
          blockers.push({ code: "missing_config", fields: missingFields });
        }
        break;
      }
      case "requires_platform":
        break;
    }
  }

  return blockers;
}

type EligibilityBlocker =
  | { code: "missing_provider" }
  | { code: "missing_model" }
  | { code: "provider_disabled" }
  | { code: "requires_auth" }
  | { code: "missing_config"; fields: Array<"base_url" | "api_key"> }
  | { code: "model_not_downloaded"; modelId: string }
  | { code: "unsupported_platform"; required: "apple_silicon" };
