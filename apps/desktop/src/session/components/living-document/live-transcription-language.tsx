import { useLingui } from "@lingui/react/macro";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@syntheo/ui/components/ui/tooltip";
import { cn } from "@syntheo/utils";

import { getBaseLanguageDisplayName } from "~/settings/general/language";
import { useLiveTranscriptionLanguages } from "~/store/zustand/live-transcription-languages";
import { useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";

// Une ligne discrète sous le titre de la marge, seulement pendant l'écoute et
// quand le modèle laisse des langues parlées de côté (issue 351, remplace le
// toast affiché à chaque démarrage).
export function LiveTranscriptionLanguage({
  sessionId,
}: {
  sessionId: string;
}) {
  const { t, i18n } = useLingui();
  const listening = useListener(
    (state) =>
      state.live.status === "active" && state.live.sessionId === sessionId,
  );
  const languages = useLiveTranscriptionLanguages(
    (state) => state.bySession[sessionId],
  );
  const openNew = useTabs((state) => state.openNew);

  if (!listening || !languages || languages.omitted.length === 0) {
    return null;
  }

  const language = getBaseLanguageDisplayName(languages.primary, i18n.locale);
  const omittedLanguages = languages.omitted
    .map((code) => getBaseLanguageDisplayName(code, i18n.locale))
    .join(", ");
  const omittedDescription = t`Other languages (${omittedLanguages}) won't be transcribed live.`;

  return (
    <p
      data-live-transcription-language
      className="text-muted-foreground -mt-1 flex min-w-0 items-center gap-1.5 text-xs"
    >
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-description={omittedDescription}
            className="focus-visible:ring-ring min-w-0 truncate rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            {t`Live transcription: ${language}`}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-60 whitespace-normal">
          {omittedDescription}
        </TooltipContent>
      </Tooltip>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() =>
          openNew({ type: "settings", state: { tab: "transcription" } })
        }
        className={cn([
          "hover:text-foreground shrink-0 rounded-sm underline-offset-2 transition-colors hover:underline",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        ])}
      >
        {t`Change`}
      </button>
    </p>
  );
}
