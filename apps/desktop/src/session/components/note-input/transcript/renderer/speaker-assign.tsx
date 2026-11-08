import { Trans, useLingui } from "@lingui/react/macro";
import {
  type ComponentProps,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { MagnifyingGlass, Plus } from "@syntheo/ui/components/icons";
import { Checkbox } from "@syntheo/ui/components/ui/checkbox";
import {
  AppFloatingPanel,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@syntheo/ui/components/ui/popover";
import { cn } from "@syntheo/utils";

import {
  buildCreateSpeakerParticipantOption,
  buildSpeakerParticipantGroups,
  type SpeakerParticipantOption,
  useSpeakerParticipants,
} from "./speaker-participants";
import { preserveScrollPosition } from "./viewport-hooks";

import { ContactImage } from "~/contacts/contact-avatar";
import { ContactFacehash } from "~/contacts/shared";
import { markSpeakerNamed } from "~/session/components/speaker-naming/store";
import type { Segment } from "~/stt/live-segment";
import {
  assignSessionTranscriptSpeaker,
  assignTranscriptSpeaker,
} from "~/stt/queries";

export {
  buildCreateSpeakerParticipantOption,
  buildEventSpeakerParticipantOptions,
  buildSpeakerParticipantGroups,
  type SpeakerParticipantOption,
} from "./speaker-participants";

export type AssignmentMode = "all" | "segment";

export function SpeakerAssignPopover({
  segment,
  transcriptId,
  sessionId,
  color,
  label,
  className,
  onAssigned,
  resolveSegment,
}: {
  segment: Segment;
  // Segment à réattribuer, lu au moment du choix : l'en-tête d'un segment
  // affiché en paragraphes n'en reçoit que le premier (issue 281).
  resolveSegment?: (segment: Segment) => Segment;
  transcriptId: string;
  sessionId?: string;
  color: string;
  label: string;
  className?: string;
  onAssigned?: (humanId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Le Popover Radix (contexte Popper, ancre, contenu) n'est monté qu'à
  // l'ouverture, puis démonté une fois la fermeture terminée : un segment au
  // repos ne porte qu'un bouton simple (issue 445).
  const [popoverMounted, setPopoverMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasInteractedOutsideRef = useRef(false);
  const hasPointerDownOutsideRef = useRef(false);
  const contentId = useId();

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) setPopoverMounted(true);
    setOpen(nextOpen);
  }, []);

  const handleTriggerClick = useCallback(() => {
    setPopoverMounted(true);
    setOpen((prevOpen) => !prevOpen);
  }, []);

  // Sans PopoverTrigger, Radix ne connaît pas le déclencheur : on reprend la
  // logique de PopoverContentNonModal (focus rendu au déclencheur, clic sur le
  // déclencheur qui bascule au lieu de fermer puis rouvrir).
  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    if (!hasInteractedOutsideRef.current) triggerRef.current?.focus();
    hasInteractedOutsideRef.current = false;
    hasPointerDownOutsideRef.current = false;
    setPopoverMounted(false);
  }, []);

  const handleInteractOutside = useCallback<InteractOutsideHandler>((event) => {
    hasInteractedOutsideRef.current = true;
    const originalType = event.detail.originalEvent.type;
    if (originalType === "pointerdown") {
      hasPointerDownOutsideRef.current = true;
    }
    const target = event.target;
    if (target instanceof Node && triggerRef.current?.contains(target)) {
      event.preventDefault();
    }
    if (originalType === "focusin" && hasPointerDownOutsideRef.current) {
      event.preventDefault();
    }
  }, []);

  const handleAssign = useCallback(
    (humanId: string, assignmentMode: AssignmentMode) => {
      const target = resolveSegment?.(segment) ?? segment;
      if (target.words.length === 0) return;
      const anchorWordId = getAssignmentAnchorWordId(target);
      if (!anchorWordId) return;
      const scrollContainer =
        triggerRef.current?.closest<HTMLElement>(
          "[data-transcript-container]",
        ) ?? null;
      const assign = () =>
        assignmentMode === "all" && sessionId
          ? assignSessionTranscriptSpeaker({
              sessionId,
              transcriptId,
              segmentKey: target.key,
              humanId,
              anchorWordId,
              wordIds: getAssignmentWordIds(target),
            })
          : assignTranscriptSpeaker({
              transcriptId,
              segmentKey: target.key,
              humanId,
              anchorWordId,
              mode: assignmentMode,
              wordIds: getAssignmentWordIds(target),
            });
      void preserveScrollPosition(scrollContainer, assign)
        .then(() => {
          if (sessionId) markSpeakerNamed(sessionId);
          onAssigned?.(humanId);
          handleOpenChange(false);
        })
        .catch((error) => {
          console.error("[transcript] failed to assign speaker", error);
        });
    },
    [
      handleOpenChange,
      onAssigned,
      resolveSegment,
      sessionId,
      transcriptId,
      segment,
    ],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-transcript-speaker-assign
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        data-state={open ? "open" : "closed"}
        className={cn([
          "-my-0.5 cursor-pointer rounded-full py-0.5 pr-2",
          "underline-offset-2 hover:underline focus-visible:underline",
          open ? "underline" : null,
          className,
        ])}
        style={{ color }}
        onClick={handleTriggerClick}
      >
        {label}
      </button>
      {open || popoverMounted ? (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverAnchor virtualRef={triggerRef} />
          <PopoverContent
            id={contentId}
            variant="app"
            side="right"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className="w-80"
            onCloseAutoFocus={handleCloseAutoFocus}
            onInteractOutside={handleInteractOutside}
          >
            <SpeakerParticipantPicker
              sessionId={sessionId}
              onSelect={handleAssign}
              showAssignmentScope={Number.isInteger(segment.key.speaker_index)}
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}

type InteractOutsideHandler = NonNullable<
  ComponentProps<typeof PopoverContent>["onInteractOutside"]
>;

export function getAssignmentAnchorWordId(
  segment: Segment,
): string | undefined {
  const word = segment.words.find(
    (word) => typeof word.id === "string" && word.id.length > 0,
  );
  return typeof word?.id === "string" ? word.id : undefined;
}

export function getAssignmentWordIds(segment: Segment): string[] {
  return segment.words
    .map((word) => word.id)
    .filter(
      (wordId): wordId is string =>
        typeof wordId === "string" && wordId.length > 0,
    );
}

export function SpeakerParticipantPicker({
  sessionId,
  onSelect,
  showAssignmentScope = true,
}: {
  sessionId: string | undefined;
  onSelect: (humanId: string, mode: AssignmentMode) => void | Promise<void>;
  showAssignmentScope?: boolean;
}) {
  const { t } = useLingui();
  const { participants, eventParticipants, contacts, resolveHumanId } =
    useSpeakerParticipants(sessionId);

  const [query, setQuery] = useState("");
  const [selectedOption, setSelectedOption] =
    useState<SpeakerParticipantOption | null>(null);
  const [applyToAllMatching, setApplyToAllMatching] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(
    () =>
      buildSpeakerParticipantGroups({
        sessionParticipants: participants,
        eventParticipants,
        contacts,
        query,
      }),
    [contacts, eventParticipants, participants, query],
  );

  const createOption = useMemo(
    () =>
      buildCreateSpeakerParticipantOption({
        query,
        existingOptions: [...participants, ...eventParticipants, ...contacts],
      }),
    [contacts, eventParticipants, participants, query],
  );
  const hasPeopleGroup = groups.some((group) => group.title === "People");

  const handleSelect = useCallback((option: SpeakerParticipantOption) => {
    setSelectedOption(option);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedOption) {
      return;
    }

    setAssigning(true);
    void resolveHumanId(selectedOption)
      .then(async (humanId) => {
        if (!humanId) return;
        await onSelect(
          humanId,
          showAssignmentScope && applyToAllMatching ? "all" : "segment",
        );
      })
      .catch((error) => {
        console.error("[transcript] failed to prepare speaker", error);
      })
      .finally(() => setAssigning(false));
  }, [
    applyToAllMatching,
    onSelect,
    resolveHumanId,
    selectedOption,
    showAssignmentScope,
  ]);

  return (
    <div className="flex max-h-[min(var(--radix-popover-content-available-height,calc(100vh-1rem)),28rem)] min-h-0 flex-col gap-1 overflow-hidden">
      <AppFloatingPanel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-border border-b py-1">
          <div className="flex h-8 items-center gap-2 px-3">
            <MagnifyingGlass
              size={16}
              className="text-muted-foreground shrink-0"
            />
            <input
              ref={searchInputRef}
              autoFocus
              type="search"
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-hidden"
              placeholder={t`Select or type to add speaker`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedOption(null);
              }}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="py-1 pb-3">
            {groups.map((group) => (
              <div key={group.title}>
                <div className="text-muted-foreground px-3 pt-2 pb-1 text-[11px] font-medium uppercase">
                  {group.title === "Participants" ? (
                    <Trans>Participants</Trans>
                  ) : (
                    <Trans>People</Trans>
                  )}
                </div>
                {group.options.map((option) => (
                  <ParticipantOptionButton
                    key={option.id}
                    option={option}
                    selected={selectedOption === option}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            ))}

            {createOption && (
              <div>
                {!hasPeopleGroup && (
                  <div className="text-muted-foreground px-3 pt-2 pb-1 text-[11px] font-medium uppercase">
                    <Trans>People</Trans>
                  </div>
                )}
                <ParticipantOptionButton
                  option={createOption}
                  selected={selectedOption === createOption}
                  onSelect={handleSelect}
                />
              </div>
            )}

            {!createOption && groups.length === 0 && (
              <p className="text-muted-foreground px-3 py-2 text-xs">
                {query.trim() ? (
                  <Trans>No matching people</Trans>
                ) : (
                  <Trans>No people</Trans>
                )}
              </p>
            )}

            {!query.trim() && (
              <button
                type="button"
                className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                onClick={() => searchInputRef.current?.focus()}
              >
                <Plus className="size-4" />
                <Trans>Create new speaker</Trans>
              </button>
            )}
          </div>
        </div>
      </AppFloatingPanel>
      <div className="flex shrink-0 items-center justify-end gap-3 py-1 pl-2">
        {showAssignmentScope && (
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
            <Checkbox
              checked={applyToAllMatching}
              onCheckedChange={(value) => setApplyToAllMatching(value === true)}
            />
            <span className="text-muted-foreground text-sm whitespace-nowrap">
              <Trans>Apply to all</Trans>
            </span>
          </label>
        )}
        <button
          type="button"
          className={cn([
            "bg-primary text-primary-foreground h-8 rounded-full px-3 text-xs font-medium",
            "hover:bg-primary/90",
            "disabled:pointer-events-none disabled:opacity-50",
          ])}
          disabled={!selectedOption || assigning}
          onClick={handleConfirm}
        >
          <Trans>Confirm</Trans>
        </button>
      </div>
    </div>
  );
}

function ParticipantOptionButton({
  option,
  selected,
  onSelect,
}: {
  option: SpeakerParticipantOption;
  selected: boolean;
  onSelect: (option: SpeakerParticipantOption) => void;
}) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn([
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent",
      ])}
      onClick={() => onSelect(option)}
    >
      {option.isCreateOption ? (
        <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full border">
          <Plus className="size-3.5" aria-hidden="true" />
        </span>
      ) : option.avatarDataUrl ? (
        <ContactImage src={option.avatarDataUrl} size={28} />
      ) : (
        <ContactFacehash
          name={option.name || option.email || option.id}
          size={28}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {option.isCreateOption ? t`Add "${option.name}"` : option.name}
        </span>
        {option.email && (
          <span className="text-muted-foreground block truncate text-xs">
            {option.email}
          </span>
        )}
      </span>
    </button>
  );
}
