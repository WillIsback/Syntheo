import { Trans } from "@lingui/react/macro";
import { useCallback, useRef, useState } from "react";

import { Button } from "@syntheo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";

import { assignSpeakerCard } from "./assign";
import { SpeakerNamingCard } from "./speaker-card";
import type { SpeakerCard } from "./speakers";
import { markSpeakerNamed } from "./store";

import {
  type SpeakerParticipantOption,
  useSpeakerParticipants,
} from "~/session/components/note-input/transcript/renderer/speaker-participants";

/**
 * Panneau « Nommer les intervenants » (issue 321). `cards` est figé à
 * l'ouverture : une carte nommée reste visible (avec son nom) au lieu de
 * disparaître de la liste.
 */
export function SpeakerNamingDialog({
  sessionId,
  cards,
  open,
  onOpenChange,
}: {
  sessionId: string;
  cards: SpeakerCard[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { participants, contacts, resolveHumanId } =
    useSpeakerParticipants(sessionId);
  const source = { participants, contacts };
  // Figées au montage (le panneau est remonté à chaque ouverture).
  const [frozenCards] = useState(cards);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const handlePick = useCallback(
    (index: number, card: SpeakerCard, option: SpeakerParticipantOption) => {
      setSaving(card.id);
      setFailed(null);
      void resolveHumanId(option)
        .then(async (humanId) => {
          if (!humanId) throw new Error("No person to assign");
          await assignSpeakerCard(card, humanId);
          markSpeakerNamed(sessionId);
          setAssigned((current) => ({ ...current, [card.id]: option.name }));
          // Entrée valide puis passe au locuteur suivant.
          requestAnimationFrame(() => inputs.current[index + 1]?.focus());
        })
        .catch((error) => {
          console.error("[speaker-naming] failed to assign speaker", error);
          setFailed(card.id);
        })
        .finally(() => setSaving(null));
    },
    [resolveHumanId, sessionId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(640px,calc(100vh-80px))] w-full max-w-lg flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">
            <Trans>Name speakers</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Read what each speaker said, then say who it is. Tab moves to the
              next speaker, Enter confirms.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        {frozenCards.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            <Trans>Every speaker has a name.</Trans>
          </p>
        ) : (
          <ol className="scrollbar-soft flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {frozenCards.map((card, index) => (
              <SpeakerNamingCard
                key={card.id}
                ref={(node) => {
                  inputs.current[index] = node;
                }}
                card={card}
                source={source}
                assignedName={assigned[card.id]}
                saving={saving === card.id}
                failed={failed === card.id}
                onPick={(option) => handlePick(index, card, option)}
              />
            ))}
          </ol>
        )}

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            <Trans>Done</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
