import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { useConfigValues } from "~/shared/config";
import { useTabs } from "~/store/zustand/tabs";
import {
  getLiveTranscriptionConfig,
  getTranscriptionLanguages,
  isConfiguredSttModel,
} from "~/stt/capabilities";

// Sous les langues parlées, quand le modèle de transcription en direct ne
// garderait que la langue principale (même calcul qu'au démarrage de
// l'écoute, issue 351).
export function SingleLanguageModelHint({
  mainLanguage,
  spokenLanguages,
}: {
  mainLanguage: string;
  spokenLanguages: readonly string[];
}) {
  const { current_stt_provider, current_stt_model } = useConfigValues([
    "current_stt_provider",
    "current_stt_model",
  ] as const);
  const openNew = useTabs((state) => state.openNew);
  const languages = getTranscriptionLanguages(mainLanguage, spokenLanguages);

  const liveConfig = useQuery({
    queryKey: [
      "live-transcription-config",
      current_stt_provider,
      current_stt_model,
      languages,
    ],
    queryFn: () =>
      getLiveTranscriptionConfig({
        provider: current_stt_provider,
        model: current_stt_model,
        languages,
      }),
    enabled:
      isConfiguredSttModel(current_stt_provider, current_stt_model) &&
      languages.length > 1,
  });

  if (!liveConfig.data?.omittedLanguages?.length) {
    return null;
  }

  return (
    <p
      data-single-language-model-hint
      className="text-muted-foreground mt-2 text-xs"
    >
      <Trans>
        The live transcription model handles one language at a time. To
        transcribe several,{" "}
        <button
          type="button"
          onClick={() =>
            openNew({ type: "settings", state: { tab: "transcription" } })
          }
          className="text-foreground focus-visible:ring-ring rounded-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
        >
          change models
        </button>
        .
      </Trans>
    </p>
  );
}
