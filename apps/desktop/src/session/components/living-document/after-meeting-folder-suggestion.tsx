import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";

import { Button } from "@syntheo/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@syntheo/ui/components/ui/popover";

import type { NoteStage } from "../capsule/stage";

import { FOLDER_SUGGESTION_BANNER_ENABLED } from "~/folders/suggestion/activation";
import { loadFolderSuggestion } from "~/folders/suggestion/load";
import {
  claimFolderSuggestion,
  dismissFolderSuggestion,
  offerFolderSuggestion,
  useFolderSuggestionOffer,
} from "~/folders/suggestion/offers";
import type { FolderSuggestion } from "~/folders/suggestion/rule";
import { FolderPickerContent } from "~/session/components/folder-picker";
import { folderDisplayName } from "~/session/folders";
import { useSession, useUpdateSession } from "~/session/queries";

// Suggestion de dossier après la réunion (issue 499). À l'arrêt de l'écoute
// (passage d'Écouter à Synthèse), une note non rangée reçoit une seule
// proposition, calculée par la règle déterministe de
// `~/folders/suggestion/rule`. Rien n'est rangé sans clic : « Ranger » passe
// par la mise à jour de dossier habituelle, et la proposition de
// régénération du rangement tardif (`~/session/late-filing`) suit si le modèle
// effectif change. Désactivée tant que la précision mesurée n'atteint pas le
// seuil (`~/folders/suggestion/activation`).
export function AfterMeetingFolderSuggestion({
  sessionId,
  stage,
  enabled = FOLDER_SUGGESTION_BANNER_ENABLED,
}: {
  sessionId: string;
  stage: NoteStage;
  enabled?: boolean;
}) {
  useFolderSuggestionAtStop({ sessionId, stage, enabled });
  const offer = useFolderSuggestionOffer(sessionId);
  const filed = Boolean(useSession(sessionId)?.folder_id);

  // Rangée entre-temps (par la bannière ou ailleurs) : la proposition tombe.
  useEffect(() => {
    if (offer && filed) dismissFolderSuggestion(sessionId);
  }, [filed, offer, sessionId]);

  if (!enabled || stage !== "synthesis" || !offer || filed) return null;
  return <FolderSuggestionBanner sessionId={sessionId} suggestion={offer} />;
}

function useFolderSuggestionAtStop({
  sessionId,
  stage,
  enabled,
}: {
  sessionId: string;
  stage: NoteStage;
  enabled: boolean;
}) {
  const previous = useRef<{ sessionId: string; stage: NoteStage } | null>(null);

  useEffect(() => {
    const last = previous.current;
    previous.current = { sessionId, stage };
    if (!enabled || !last || last.sessionId !== sessionId) return;
    if (last.stage !== "listen" || stage !== "synthesis") return;
    if (!claimFolderSuggestion(sessionId)) return;
    void loadFolderSuggestion(sessionId)
      .then((suggestion) => {
        if (suggestion) offerFolderSuggestion(sessionId, suggestion);
      })
      .catch((error) => {
        console.error("[folder-suggestion] failed to compute", error);
      });
  }, [enabled, sessionId, stage]);
}

function FolderSuggestionBanner({
  sessionId,
  suggestion,
}: {
  sessionId: string;
  suggestion: FolderSuggestion;
}) {
  const { t } = useLingui();
  const updateSession = useUpdateSession(sessionId);
  const [choosing, setChoosing] = useState(false);
  const folderName = folderDisplayName(suggestion.folderPath);
  const reason = suggestion.reasons
    .flatMap((item) => {
      if (item === "title") return [t`same title`];
      if (item === "participants") return [t`same participants`];
      return [];
    })
    .join(" / ");

  const file = () => {
    dismissFolderSuggestion(sessionId);
    void updateSession({ folder_id: suggestion.folderPath }).catch((error) => {
      console.error("[folder-suggestion] failed to file the note", error);
    });
  };

  return (
    <div
      role="status"
      data-folder-suggestion-banner
      className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-2.5"
    >
      <p
        className="text-foreground min-w-0 text-[13px]"
        title={suggestion.folderPath}
      >
        <Trans>
          This meeting looks like {folderName} ({reason})
        </Trans>
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button type="button" size="sm" onClick={file}>
          <Trans>File it</Trans>
        </Button>
        <Popover open={choosing} onOpenChange={setChoosing}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Trans>Choose…</Trans>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            variant="app"
            align="end"
            className="w-72 overflow-hidden pb-0"
          >
            <FolderPickerContent
              sessionId={sessionId}
              onClose={() => setChoosing(false)}
              suggestedPath={suggestion.folderPath}
              suggestionHint={reason}
            />
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => dismissFolderSuggestion(sessionId)}
        >
          <Trans>Ignore</Trans>
        </Button>
      </div>
    </div>
  );
}
