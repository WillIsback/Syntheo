import { Plural, Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";

import { ArrowsClockwise, UsersThree } from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";

import { SpeakerNamingDialog } from "./dialog";
import { summaryMentionsAnonymousSpeakers } from "./speakers";
import {
  clearSpeakerNamed,
  consumeSpeakerNamingRequest,
  setSpeakerNamingAvailable,
  useSpeakerNamingStore,
} from "./store";
import { useSpeakerCards } from "./use-speaker-cards";

import { useEnhancedNoteActions } from "~/session/components/note-input/enhanced-actions";
import { useListener } from "~/stt/contexts";

/**
 * Ligne discrète en haut de la synthèse (issue 321) : « 2 intervenants à
 * nommer » et le bouton qui ouvre le panneau ; puis, une fois des noms
 * donnés, la proposition de régénérer la synthèse si elle parle encore de
 * locuteurs anonymes. Jamais de régénération automatique.
 */
export function SpeakerNamingBar({
  sessionId,
  enhancedNoteId,
  summaryMarkdown,
}: {
  sessionId: string;
  enhancedNoteId: string;
  summaryMarkdown: string;
}) {
  const listening = useListener(
    (state) =>
      state.live.sessionId === sessionId && state.live.status !== "inactive",
  );
  const { cards, ready } = useSpeakerCards(sessionId, !listening);
  const named = useSpeakerNamingStore((state) =>
    Boolean(state.named[sessionId]),
  );
  const requested = useSpeakerNamingStore(
    (state) => state.requested === sessionId,
  );
  const { isGenerating, onRegenerate } = useEnhancedNoteActions({
    sessionId,
    enhancedNoteId,
  });
  const [open, setOpen] = useState(false);

  const count = ready ? cards.length : 0;
  useEffect(() => {
    setSpeakerNamingAvailable(count > 0 ? { sessionId, count } : null);
    return () => {
      if (useSpeakerNamingStore.getState().available?.sessionId === sessionId)
        setSpeakerNamingAvailable(null);
    };
  }, [count, sessionId]);

  // Ouvert par le bouton, ou par la commande de la palette Ctrl K.
  const isOpen = open || (requested && ready);
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && requested) consumeSpeakerNamingRequest();
    },
    [requested],
  );

  const proposeRegenerate =
    ready &&
    !isGenerating &&
    summaryMentionsAnonymousSpeakers(summaryMarkdown) &&
    (count === 0 || named);

  const handleRegenerate = () => {
    clearSpeakerNamed(sessionId);
    void onRegenerate(null);
  };

  const dialog = (
    <SpeakerNamingDialog
      key={isOpen ? "open" : "closed"}
      sessionId={sessionId}
      cards={cards}
      open={isOpen}
      onOpenChange={handleOpenChange}
    />
  );

  const showBar = count > 0 || proposeRegenerate;

  return (
    <>
      {showBar ? (
        <div
          data-speaker-naming-bar
          className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
        >
          {count > 0 ? (
            <>
              <span className="flex items-center gap-1.5">
                <UsersThree className="size-3.5" aria-hidden="true" />
                <Plural
                  value={count}
                  one="# speaker to name"
                  other="# speakers to name"
                />
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={() => setOpen(true)}
              >
                <Trans>Name speakers</Trans>
              </Button>
            </>
          ) : (
            <span>
              <Trans>The summary still mentions unnamed speakers.</Trans>
            </span>
          )}
          {proposeRegenerate ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={handleRegenerate}
            >
              <ArrowsClockwise className="size-3.5" aria-hidden="true" />
              <Trans>Regenerate summary with names</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
      {dialog}
    </>
  );
}
