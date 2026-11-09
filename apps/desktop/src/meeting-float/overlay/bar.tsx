import { Trans, useLingui } from "@lingui/react/macro";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { FloatingBarState } from "@syntheo/plugin-windows";
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretDown,
  Pause,
  Play,
  Square,
  WarningCircle,
} from "@syntheo/ui/components/icons";
import { DancingSticks } from "@syntheo/ui/components/ui/dancing-sticks";

import { DictationTranscript } from "./dictation";
import {
  dictationControlsWidth,
  durationSlotWidth,
  FLOATING_BAR_COMPACT_HEIGHT,
  FLOATING_BAR_COMPACT_HORIZONTAL_PADDING,
  FLOATING_BAR_COMPACT_ICON_SIZE,
  FLOATING_BAR_COMPACT_STOP_WIDTH,
  FLOATING_BAR_COMPACT_RADIUS,
  FLOATING_BAR_CONTROL_RADIUS,
  FLOATING_BAR_EXPANDED_RADIUS,
  FLOATING_BAR_INSET,
  FLOATING_PILL_SLOTS,
  formatListeningDuration,
} from "./layout";
import { tokensFor, withAlpha } from "./palette";

import { type PaletteId, useDocumentPalette } from "~/shared/theme/palette";

type OverlayCallbacks = {
  onStop: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onOpenNote?: () => void;
  onToggleExpanded: (expanded: boolean) => void;
};

export function FloatingBarOverlay({
  state,
  ...callbacks
}: OverlayCallbacks & { state: FloatingBarState }) {
  // Re-rend la barre (et ses enfants, qui lisent la palette du document) quand
  // la palette change dans les paramètres.
  const palette = useDocumentPalette();
  const colors = barColors(state, palette);
  // Un calque Wayland (layer-shell) reste ancré : pas de zone de déplacement.
  const dragRegion = state.layout?.movable === false ? undefined : "deep";

  return state.dictation ? (
    <DictationOverlay
      state={state}
      colors={colors}
      dragRegion={dragRegion}
      onStop={callbacks.onStop}
      onToggleExpanded={callbacks.onToggleExpanded}
    />
  ) : (
    <MeetingPill
      state={state}
      colors={colors}
      dragRegion={dragRegion}
      {...callbacks}
    />
  );
}

// Pastille de réunion (issue 448) : un seul bloc de 38 px, de la taille exacte
// de la fenêtre. Toute la pastille sert à la déplacer, sauf ses boutons.
function MeetingPill({
  state,
  colors,
  dragRegion,
  onStop,
  onPause,
  onResume,
  onOpenNote,
}: OverlayCallbacks & {
  state: FloatingBarState;
  colors: BarColors;
  dragRegion: "deep" | undefined;
}) {
  return (
    <div
      data-testid="meeting-pill"
      data-tauri-drag-region={dragRegion}
      className="flex h-full w-full items-center overflow-hidden whitespace-nowrap select-none"
      style={{
        paddingInline: FLOATING_BAR_COMPACT_HORIZONTAL_PADDING,
        borderRadius: FLOATING_BAR_COMPACT_RADIUS,
        background: colors.surface,
        boxShadow: `inset 0 0 0 0.5px ${colors.outerStroke}`,
        color: colors.content,
      }}
    >
      {state.status === "paused" ? (
        <div className="flex flex-1 justify-center">
          <PausedControls colors={colors} onResume={onResume} onStop={onStop} />
        </div>
      ) : (
        <RecordingControls
          state={state}
          colors={colors}
          onStop={onStop}
          onPause={onPause}
          onOpenNote={onOpenNote}
        />
      )}
    </div>
  );
}

function RecordingControls({
  state,
  colors,
  onStop,
  onPause,
  onOpenNote,
}: {
  state: FloatingBarState;
  colors: BarColors;
  onStop: () => void;
  onPause?: () => void;
  onOpenNote?: () => void;
}) {
  const { t } = useLingui();
  const elapsedSeconds = state.elapsedSeconds ?? 0;
  const duration = formatListeningDuration(elapsedSeconds);
  const notice = state.transcriptNotice ?? t`Recording needs attention`;
  const hover = { "--pill-hover": colors.controlFill } as CSSProperties;
  const buttonClass =
    "flex shrink-0 items-center justify-center gap-[5px] text-xs font-semibold";

  return (
    <>
      <span
        aria-hidden="true"
        className="flex shrink-0 justify-center"
        style={{ width: FLOATING_PILL_SLOTS.dot }}
      >
        <span
          className="block rounded-full motion-safe:animate-pulse"
          style={{ width: 8, height: 8, background: colors.accent }}
        />
      </span>
      <button
        type="button"
        data-tauri-drag-region="false"
        aria-label={t`${duration}, back to the note`}
        title={t`Back to the note`}
        onClick={onOpenNote}
        className="flex shrink-0 items-center justify-center text-xs font-semibold tabular-nums hover:bg-[var(--pill-hover)]"
        style={{
          ...hover,
          width: durationSlotWidth(elapsedSeconds),
          height: FLOATING_BAR_COMPACT_ICON_SIZE,
          borderRadius: FLOATING_BAR_CONTROL_RADIUS,
        }}
      >
        {duration}
      </button>
      <span
        className="flex shrink-0 justify-center"
        style={{ width: FLOATING_PILL_SLOTS.level, color: colors.accent }}
      >
        {state.status === "error" ? (
          <WarningCircle size={16} aria-label={notice} />
        ) : (
          <DancingSticks
            color={colors.accent}
            amplitude={state.amplitude}
            width={20}
            height={16}
            stickWidth={2}
            gap={2}
          />
        )}
      </span>
      <span
        aria-hidden="true"
        className="flex shrink-0 justify-center"
        style={{ width: FLOATING_PILL_SLOTS.separator }}
      >
        <span
          className="block"
          style={{ width: 1, height: 18, background: colors.separator }}
        />
      </span>
      <button
        type="button"
        data-tauri-drag-region="false"
        aria-label={t`Pause listening`}
        onClick={onPause}
        className={`${buttonClass} hover:bg-[var(--pill-hover)]`}
        style={{
          ...hover,
          width: FLOATING_PILL_SLOTS.pause,
          height: FLOATING_BAR_COMPACT_ICON_SIZE,
          borderRadius: FLOATING_BAR_CONTROL_RADIUS,
        }}
      >
        <Pause size={12} aria-hidden="true" />
        <Trans>Pause</Trans>
      </button>
      <button
        type="button"
        data-tauri-drag-region="false"
        aria-label={t`Finish the meeting`}
        title={
          state.status === "error"
            ? t`${notice}. Open Syntheo to retry or change devices.`
            : undefined
        }
        onClick={onStop}
        className={`${buttonClass} hover:bg-[var(--pill-hover)]`}
        style={
          {
            "--pill-hover": colors.accentHover,
            width: FLOATING_PILL_SLOTS.finish,
            height: FLOATING_BAR_COMPACT_ICON_SIZE,
            marginLeft: FLOATING_PILL_SLOTS.buttonGap,
            borderRadius: FLOATING_BAR_CONTROL_RADIUS,
            background: colors.controlFill,
            color: colors.accent,
          } as CSSProperties
        }
      >
        <span
          aria-hidden="true"
          className="block rounded-[2px]"
          style={{ width: 9, height: 9, background: "currentColor" }}
        />
        <Trans>Finish</Trans>
      </button>
    </>
  );
}

function PausedControls({
  colors,
  onResume,
  onStop,
}: {
  colors: BarColors;
  onResume?: () => void;
  onStop: () => void;
}) {
  const { t } = useLingui();
  const buttonStyle = {
    height: FLOATING_BAR_COMPACT_ICON_SIZE,
    borderRadius: FLOATING_BAR_CONTROL_RADIUS,
  };

  return (
    <div className="flex items-center gap-1 text-xs whitespace-nowrap">
      <span
        className="flex items-center gap-1 px-1 font-semibold"
        style={{ color: colors.content }}
      >
        <Pause size={12} aria-hidden="true" className="shrink-0" />
        <span role="status">
          <Trans>Paused</Trans>
        </span>
      </span>
      <button
        type="button"
        data-tauri-drag-region="false"
        aria-label={t`Resume listening`}
        onClick={onResume}
        className="flex items-center gap-1 px-2 font-semibold"
        style={{
          ...buttonStyle,
          background: colors.accentHover,
          color: colors.accent,
        }}
      >
        <Play size={10} aria-hidden="true" />
        <Trans>Resume</Trans>
      </button>
      <button
        type="button"
        data-tauri-drag-region="false"
        aria-label={t`Finish the meeting`}
        onClick={onStop}
        className="flex items-center gap-1 px-2"
        style={{
          ...buttonStyle,
          background: colors.controlFill,
          color: colors.content,
        }}
      >
        <Square size={9} aria-hidden="true" />
        <Trans>Finish</Trans>
      </button>
    </div>
  );
}

// Dictée : commandes compactes et panneau de transcription, inchangés (issue
// 448). Seule la poignée de survol et sa zone réservée disparaissent : la rangée
// des commandes sert à déplacer le panneau.
function DictationOverlay({
  state,
  colors,
  dragRegion,
  onStop,
  onToggleExpanded,
}: {
  state: FloatingBarState;
  colors: BarColors;
  dragRegion: "deep" | undefined;
  onStop: () => void;
  onToggleExpanded: (expanded: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isExpanded =
    state.liveCaptionToggleVisible && !state.liveCaptionMinimized;
  const controlsWidth = dictationControlsWidth();
  const expandsUpward = state.layout?.expandsUpward ?? false;

  return (
    <div
      className="absolute overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        inset: FLOATING_BAR_INSET,
        borderRadius: isExpanded
          ? FLOATING_BAR_EXPANDED_RADIUS
          : FLOATING_BAR_COMPACT_RADIUS,
        background:
          hovered && !isExpanded ? colors.envelopeSurface : colors.surface,
        boxShadow: `inset 0 0 0 0.5px ${colors.outerStroke}`,
      }}
    >
      {isExpanded && (
        <div
          className="absolute inset-x-0"
          style={{
            top: expandsUpward ? 0 : FLOATING_BAR_COMPACT_HEIGHT,
            bottom: expandsUpward ? FLOATING_BAR_COMPACT_HEIGHT : 0,
          }}
        >
          <TranscriptList
            key={state.dictation?.sessionId}
            dictation={state.dictation}
            colorScheme={state.colorScheme}
          />
        </div>
      )}
      <div
        data-tauri-drag-region={dragRegion}
        className="absolute inset-x-0"
        style={{
          top: expandsUpward ? undefined : 0,
          bottom: expandsUpward ? 0 : undefined,
          height: FLOATING_BAR_COMPACT_HEIGHT,
        }}
      >
        <div
          className="absolute flex -translate-x-1/2 items-center justify-center"
          style={{
            left: state.layout
              ? state.layout.controlsCenterX - FLOATING_BAR_INSET
              : `calc(100% - ${FLOATING_BAR_COMPACT_HORIZONTAL_PADDING + controlsWidth / 2}px)`,
            top: 0,
            width: controlsWidth,
            height: FLOATING_BAR_COMPACT_HEIGHT,
          }}
        >
          <StopControl state={state} colors={colors} onStop={onStop} />
          {state.liveCaptionToggleVisible ? (
            <button
              type="button"
              data-tauri-drag-region="false"
              aria-label={
                isExpanded
                  ? "Collapse live transcript"
                  : "Expand live transcript"
              }
              onClick={() => onToggleExpanded(!isExpanded)}
              className="flex items-center justify-center"
              style={{
                width: FLOATING_BAR_COMPACT_ICON_SIZE,
                height: FLOATING_BAR_COMPACT_ICON_SIZE,
                borderRadius: FLOATING_BAR_CONTROL_RADIUS,
                color: colors.content,
              }}
            >
              {isExpanded ? (
                <ArrowsInSimple size={14} weight="bold" />
              ) : (
                <ArrowsOutSimple size={14} weight="bold" />
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StopControl({
  state,
  colors,
  onStop,
}: {
  state: FloatingBarState;
  colors: BarColors;
  onStop: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      data-tauri-drag-region="false"
      aria-label="Finish dictation"
      disabled={state.dictation?.phase === "transcribing"}
      onClick={onStop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center justify-center"
      style={{
        width: FLOATING_BAR_COMPACT_STOP_WIDTH,
        height: FLOATING_BAR_COMPACT_ICON_SIZE,
        borderRadius: FLOATING_BAR_CONTROL_RADIUS,
        background: hovered ? colors.accentHover : colors.controlFill,
        color: colors.accent,
      }}
    >
      {state.dictation?.phase === "transcribing" ? (
        <span role="status" className="text-xs">
          Finishing…
        </span>
      ) : hovered ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <Square size={9} />
          Done
        </span>
      ) : (
        <DancingSticks
          color={colors.accent}
          amplitude={state.amplitude}
          width={26}
          height={20}
          stickWidth={3}
          gap={2}
        />
      )}
    </button>
  );
}

function TranscriptList({
  colorScheme,
  dictation,
}: {
  dictation: FloatingBarState["dictation"];
  colorScheme: FloatingBarState["colorScheme"];
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (pinned) {
      bottomRef.current?.scrollIntoView?.({ block: "end" });
    }
  }, [pinned, dictation?.text, dictation?.partial]);

  return (
    <div className="relative h-full p-3">
      <div
        className="h-full overflow-y-auto"
        onScroll={(event) => {
          const target = event.currentTarget;
          const distance =
            target.scrollHeight - target.scrollTop - target.clientHeight;
          setPinned(distance < 20);
        }}
      >
        <div className="flex min-h-full flex-col justify-start gap-2">
          {dictation ? (
            <DictationTranscript
              dictation={dictation}
              colorScheme={colorScheme}
            />
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>
      {!pinned && !!(dictation?.text || dictation?.partial) ? (
        <button
          type="button"
          data-tauri-drag-region="false"
          onClick={() => {
            setPinned(true);
            bottomRef.current?.scrollIntoView?.({
              block: "end",
              behavior: "smooth",
            });
          }}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[11px] font-medium"
          style={{
            background: tokensFor(colorScheme).card,
            color: tokensFor(colorScheme).foreground,
          }}
        >
          <CaretDown size={10} weight="bold" />
          Go to bottom
        </button>
      ) : null}
    </div>
  );
}

type BarColors = {
  surface: string;
  envelopeSurface: string;
  content: string;
  separator: string;
  outerStroke: string;
  controlFill: string;
  accent: string;
  accentHover: string;
};

function barColors(state: FloatingBarState, palette: PaletteId): BarColors {
  const opacity = Math.min(Math.max(state.opacity, 0.35), 0.95);
  const tokens = tokensFor(state.colorScheme, palette);

  return {
    surface: withAlpha(tokens.floatingChrome, opacity * 82),
    envelopeSurface: withAlpha(
      tokens.floatingChrome,
      Math.min(opacity * 108, 95),
    ),
    content: tokens.foreground,
    separator: withAlpha(tokens.foreground, 14),
    outerStroke: withAlpha(tokens.foreground, 14),
    controlFill: withAlpha(tokens.foreground, 8),
    accent: tokens.recording,
    accentHover: withAlpha(tokens.recording, 18),
  };
}
