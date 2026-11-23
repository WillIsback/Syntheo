import { useMountEffect } from "@syntheo/ui/hooks/use-mount-effect";

import { useSetSettingValues } from "~/settings/queries";

/**
 * Enregistre le fournisseur et le modèle choisis par défaut. Un champ omis
 * (`undefined`) n'est pas écrit : réglage imposé par l'administration, que
 * le déclencheur de managed_app_settings refuserait, et avec lui toute la
 * transaction (issue 710).
 */
export function PersistAiSelection({
  type,
  provider,
  model,
}: {
  type: "llm" | "stt";
  provider?: string;
  model?: string;
}) {
  const setSettingValues = useSetSettingValues();

  useMountEffect(() => {
    const values =
      type === "llm"
        ? {
            ...(provider === undefined
              ? {}
              : { current_llm_provider: provider }),
            ...(model === undefined ? {} : { current_llm_model: model }),
          }
        : {
            ...(provider === undefined
              ? {}
              : { current_stt_provider: provider }),
            ...(model === undefined ? {} : { current_stt_model: model }),
          };
    if (Object.keys(values).length > 0) setSettingValues(values);
  });

  return null;
}
