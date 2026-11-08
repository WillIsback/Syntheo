import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { forwardRef, useId, useMemo, useState } from "react";

import { Check, Plus } from "@syntheo/ui/components/icons";
import { cn } from "@syntheo/utils";

import type { SpeakerCard } from "./speakers";

import { ContactImage } from "~/contacts/contact-avatar";
import { ContactFacehash } from "~/contacts/shared";
import {
  buildCreateSpeakerParticipantOption,
  buildSpeakerParticipantGroups,
  type SpeakerParticipantOption,
} from "~/session/components/note-input/transcript/renderer/speaker-participants";

const MAX_OPTIONS = 6;

export type SpeakerOptionSource = {
  participants: SpeakerParticipantOption[];
  eventParticipants: SpeakerParticipantOption[];
  contacts: SpeakerParticipantOption[];
};

export function buildSpeakerCardOptions(
  source: SpeakerOptionSource,
  query: string,
): SpeakerParticipantOption[] {
  const matches = buildSpeakerParticipantGroups({
    sessionParticipants: source.participants,
    eventParticipants: source.eventParticipants,
    contacts: source.contacts,
    query,
  })
    .flatMap((group) => group.options)
    .slice(0, MAX_OPTIONS);
  const create = buildCreateSpeakerParticipantOption({
    query,
    existingOptions: [
      ...source.participants,
      ...source.eventParticipants,
      ...source.contacts,
    ],
  });
  return create ? [...matches, create] : matches;
}

/**
 * Une carte « Locuteur N » : deux extraits puis « Qui est-ce ? ». Le champ
 * est le seul élément atteignable par Tab, pour passer d'un locuteur à
 * l'autre ; les flèches parcourent les propositions, Entrée valide.
 */
export const SpeakerNamingCard = forwardRef<
  HTMLInputElement,
  {
    card: SpeakerCard;
    source: SpeakerOptionSource;
    assignedName?: string;
    saving?: boolean;
    failed?: boolean;
    onPick: (option: SpeakerParticipantOption) => void;
  }
>(function SpeakerNamingCard(
  { card, source, assignedName, saving = false, failed = false, onPick },
  ref,
) {
  const { t } = useLingui();
  const baseId = useId();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  // Liste sans saisie : seulement sur demande (flèche bas ou clic), pour
  // qu'un Entrée réflexe n'attribue pas le premier nom venu.
  const [browsing, setBrowsing] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const options = useMemo(
    () => buildSpeakerCardOptions(source, query),
    [query, source],
  );
  const open =
    focused && options.length > 0 && (query.trim() !== "" || browsing);
  const active = Math.min(highlighted, options.length - 1);
  const listId = `${baseId}-options`;
  const titleId = `${baseId}-title`;
  const number = card.number;
  const part = card.part;
  const turns = card.turns;

  const pick = (option: SpeakerParticipantOption | undefined) => {
    if (!option || saving) return;
    setQuery("");
    setHighlighted(0);
    setBrowsing(false);
    onPick(option);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (open) setHighlighted(Math.min(active + 1, options.length - 1));
      else setBrowsing(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(Math.max(active - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open) pick(options[active]);
    } else if (event.key === "Escape" && (query || open)) {
      // Premier Échap : fermer la liste et vider le champ ; le suivant ferme
      // le panneau.
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
      setBrowsing(false);
    }
  };

  return (
    <li
      aria-labelledby={titleId}
      className={cn([
        "border-border bg-card rounded-xl border p-3",
        assignedName ? "border-primary/40" : null,
      ])}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={titleId} className="text-sm font-semibold">
          {part === null ? (
            <Trans>Speaker {number}</Trans>
          ) : (
            <Trans>
              Speaker {number} · part {part}
            </Trans>
          )}
        </h3>
        <span className="text-muted-foreground shrink-0 text-xs">
          <Plural value={turns} one="# turn" other="# turns" />
        </span>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {card.excerpts.map((excerpt) => (
          <li key={excerpt}>
            <blockquote className="text-muted-foreground border-border border-l-2 pl-2 text-sm leading-5">
              {t`“${excerpt}”`}
            </blockquote>
          </li>
        ))}
      </ul>

      <div className="relative mt-3">
        <label
          htmlFor={`${baseId}-input`}
          className="mb-1 block text-xs font-medium"
        >
          <Trans>Who is it?</Trans>
        </label>
        <input
          ref={ref}
          id={`${baseId}-input`}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-describedby={assignedName ? `${baseId}-assigned` : undefined}
          disabled={saving}
          value={query}
          placeholder={assignedName ? t`Change the name` : t`Type a name`}
          className={cn([
            "border-input bg-background h-9 w-full rounded-md border px-3 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:ring-ring outline-hidden focus-visible:ring-2",
          ])}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setBrowsing(false);
          }}
          onMouseDown={() => setBrowsing(true)}
          onKeyDown={handleKeyDown}
        />
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={t`Suggestions`}
            className="border-border bg-popover text-popover-foreground absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-md border py-1 shadow-md"
          >
            {options.map((option, index) => (
              <li
                key={`${option.id}:${option.name}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn([
                  "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                  index === active ? "bg-accent text-accent-foreground" : null,
                ])}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => pick(option)}
              >
                {option.isCreateOption ? (
                  <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border">
                    <Plus className="size-3" aria-hidden="true" />
                  </span>
                ) : option.avatarDataUrl ? (
                  <ContactImage src={option.avatarDataUrl} size={24} />
                ) : (
                  <ContactFacehash
                    name={option.name || option.email || option.id}
                    size={24}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {option.isCreateOption
                    ? t`Create “${option.name}”`
                    : option.name}
                </span>
                {option.email && !option.isCreateOption ? (
                  <span className="text-muted-foreground truncate text-xs">
                    {option.email}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {assignedName ? (
        <p
          id={`${baseId}-assigned`}
          className="text-primary mt-2 flex items-center gap-1.5 text-xs font-medium"
        >
          <Check className="size-3.5" aria-hidden="true" />
          <Trans>Assigned to {assignedName}</Trans>
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-destructive mt-2 text-xs">
          <Trans>The name could not be saved. Try again.</Trans>
        </p>
      ) : null}
    </li>
  );
});
