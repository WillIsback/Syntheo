export interface SegmentTimelineSegment {
  id: string;
  color: string;
  /** Percentage width, 0-100. Segments in the array should sum to ~100. */
  pct: number;
}

export interface SegmentTimelineProps {
  readonly segments: SegmentTimelineSegment[];
  readonly label?: string;
  readonly note?: string;
}

/**
 * Proportional topic/segment ruler for a session. Deliberately NOT an audio
 * waveform with playback — Syntheo does not retain or play back audio
 * (voice is biometric data under GDPR), so this only visualizes detected
 * topic segments by relative duration.
 */
export function SegmentTimeline({
  segments,
  label = "Chronologie de la session",
  note,
}: SegmentTimelineProps) {
  return (
    <div className="w-full rounded-(--syn-radius-sm) border border-(--syn-border) bg-(--syn-surface) px-4 py-3 font-(--syn-font-ui)">
      <div className="mb-2 text-[11px] text-(--syn-text-3)">{label}</div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-[5px]">
        {segments.map((s) => (
          <div
            key={s.id}
            className="h-full"
            style={{ flex: s.pct, background: s.color }}
          />
        ))}
      </div>
      {note && (
        <div className="mt-2 text-[10.5px] text-(--syn-text-3)">{note}</div>
      )}
    </div>
  );
}
