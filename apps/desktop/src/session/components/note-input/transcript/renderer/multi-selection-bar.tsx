import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { ArrowsMerge, Trash, X } from "@syntheo/ui/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@syntheo/ui/components/ui/popover";
import { toast } from "@syntheo/ui/components/ui/toast";
import { cn } from "@syntheo/utils";

import type { TranscriptWordSelection } from "./selection";
import { SpeakerParticipantPicker } from "./speaker-assign";

import {
  getSessionFabSelectionHost,
  subscribeSessionFabSelectionHost,
} from "~/session/components/floating/selection-slot";

export function MultiSelectionBar({
  selection,
  entryCount,
  canMerge = false,
  onClear,
  onAssignSpeaker,
  onMerge,
  onDelete,
}: {
  selection: TranscriptWordSelection;
  entryCount: number;
  canMerge?: boolean;
  onClear: () => void;
  onAssignSpeaker: (
    selection: TranscriptWordSelection,
    humanId: string,
  ) => void | Promise<void>;
  onMerge?: () => void | Promise<void>;
  onDelete?: (selection: TranscriptWordSelection) => Promise<void>;
}) {
  const fabSelectionHost = useSyncExternalStore(
    subscribeSessionFabSelectionHost,
    getSessionFabSelectionHost,
    getSessionFabSelectionHost,
  );
  const [speakerPickerOpen, setSpeakerPickerOpen] = useState(false);
  const handleAssign = useCallback(
    async (humanId: string) => {
      await onAssignSpeaker(selection, humanId);
      setSpeakerPickerOpen(false);
      onClear();
    },
    [onAssignSpeaker, onClear, selection],
  );
  const handleMerge = useCallback(async () => {
    await onMerge?.();
    onClear();
  }, [onClear, onMerge]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await onDelete?.(selection);
    },
    onSuccess: onClear,
    onError: () => toast.error(t`Something went wrong`),
  });

  const bar = (
    <div
      className={cn([
        "border-border bg-card flex items-center gap-2 rounded-full border p-1 pl-3 shadow-lg",
        "text-xs",
        fabSelectionHost
          ? null
          : "absolute bottom-4 left-1/2 z-40 -translate-x-1/2",
      ])}
    >
      <span className="text-muted-foreground whitespace-nowrap">
        <Trans>{entryCount} selected</Trans>
      </span>
      <Popover
        open={speakerPickerOpen && !deleteMutation.isPending}
        onOpenChange={setSpeakerPickerOpen}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={deleteMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-7 shrink-0 items-center rounded-full px-3 font-medium whitespace-nowrap"
          >
            <Trans>Change speaker</Trans>
          </button>
        </PopoverTrigger>
        <PopoverContent
          variant="app"
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          className="flex max-h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-32px)] flex-col overflow-hidden"
        >
          <SpeakerParticipantPicker
            sessionId={selection.sessionId}
            showAssignmentScope={false}
            onSelect={handleAssign}
          />
        </PopoverContent>
      </Popover>
      {onMerge ? (
        <button
          type="button"
          disabled={!canMerge || deleteMutation.isPending}
          className={cn([
            "hover:bg-accent flex h-7 items-center gap-1.5 rounded-full px-2 font-medium",
            "disabled:pointer-events-none disabled:opacity-50",
          ])}
          onClick={() => void handleMerge()}
        >
          <ArrowsMerge className="size-3.5" />
          <Trans>Merge</Trans>
        </button>
      ) : null}
      {onDelete && (
        <button
          type="button"
          disabled={deleteMutation.isPending}
          className={cn([
            "text-destructive hover:bg-destructive/10 flex h-7 items-center gap-1.5 rounded-full px-2 font-medium",
            "disabled:pointer-events-none disabled:opacity-50",
          ])}
          onClick={() => deleteMutation.mutate()}
        >
          <Trash className="size-3.5" />
          <Trans>Delete</Trans>
        </button>
      )}
      <button
        type="button"
        aria-label={t`Clear selection`}
        disabled={deleteMutation.isPending}
        className="hover:bg-accent flex size-7 items-center justify-center rounded-full"
        onClick={onClear}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );

  return fabSelectionHost ? createPortal(bar, fabSelectionHost) : bar;
}
