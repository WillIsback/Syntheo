import type { Block, Report, Segment, Session, Speaker } from "@/data/sessions";
import type {
  SessionExportsPayload,
  SessionTranscriptPayload,
} from "@/schemas/postgresql.server.schema";
import type { ParsedReportRow } from "@/services/postgresql.service";

const SPEAKER_COLORS = ["#1A73E8", "#0F9D58", "#E37400", "#A142F4"] as const;
const SPEAKER_BGS = ["#E8F0FE", "#E6F4EA", "#FEF3E2", "#F3E8FD"] as const;

const fmtMMSS = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

type SessionRow = {
  id: string;
  jobId: string;
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  transcriptPayload: SessionTranscriptPayload;
  exportsPayload: SessionExportsPayload;
  speakerNames: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export const mapAppSessionToViewModel = (
  row: SessionRow,
  reportRow?: ParsedReportRow | null,
): Session => {
  const job =
    row.transcriptPayload.job?.status === "completed"
      ? row.transcriptPayload.job
      : null;

  const segments = job?.segments ?? [];
  const durationS = row.transcriptPayload.input.durationS ?? 0;

  // Unique ordered speaker list
  const speakerIds: string[] = [];
  for (const seg of segments) {
    if (!speakerIds.includes(seg.speaker)) speakerIds.push(seg.speaker);
  }

  const speakerColorMap = new Map<string, number>(
    speakerIds.map((id, i) => [id, i % SPEAKER_COLORS.length]),
  );

  // Compute each speaker's total speaking time
  const speakerTimes = new Map<string, number>(
    speakerIds.map((speakerId) => {
      const t = segments
        .filter((s) => s.speaker === speakerId)
        .reduce((acc, s) => acc + (s.end - s.start), 0);
      return [speakerId, t];
    }),
  );
  const totalSpeakingTime = Array.from(speakerTimes.values()).reduce(
    (a, b) => a + b,
    0,
  );

  const speakers: Speaker[] = speakerIds.map((speakerId, i) => {
    const idx = i % SPEAKER_COLORS.length;
    const speakerS = speakerTimes.get(speakerId) ?? 0;
    const share =
      totalSpeakingTime > 0
        ? Math.round((speakerS / totalSpeakingTime) * 100)
        : 0;
    return {
      id: speakerId,
      name: speakerId,
      initials:
        speakerId
          .replace(/[^A-Z0-9]/gi, "")
          .slice(-2)
          .toUpperCase() || speakerId.slice(-2).toUpperCase(),
      color: SPEAKER_COLORS[idx],
      bg: SPEAKER_BGS[idx],
      share,
      timeLabel: fmtMMSS(speakerS),
    };
  });

  // Group consecutive same-speaker utterances into runs so the SegmentTimeline
  // shows alternating speaker blocks, not hundreds of identical-color slivers.
  type Run = { speaker: string; start: number; end: number; dur: number };
  const runs: Run[] = [];
  for (const seg of segments) {
    const last = runs.at(-1);
    if (last && last.speaker === seg.speaker) {
      last.end = seg.end;
      last.dur += seg.end - seg.start;
    } else {
      runs.push({
        speaker: seg.speaker,
        start: seg.start,
        end: seg.end,
        dur: seg.end - seg.start,
      });
    }
  }

  const segmentItems: Segment[] = runs.map((run, i) => {
    const idx = speakerColorMap.get(run.speaker) ?? i % SPEAKER_COLORS.length;
    const share =
      totalSpeakingTime > 0
        ? Math.max(1, (run.dur / totalSpeakingTime) * 100)
        : 1;
    return {
      id: `seg-${i}`,
      label: run.speaker,
      ts: fmtMMSS(run.start),
      color: SPEAKER_COLORS[idx],
      bg: SPEAKER_BGS[idx],
      share,
    };
  });

  const blocks: Block[] = segments.map((seg, i) => ({
    id: `block-${i}`,
    segId: `seg-${i}`,
    speakerId: seg.speaker,
    ts: fmtMMSS(seg.start),
    text: seg.text,
  }));

  const createdDate = new Date(row.createdAt);
  const dateLabel = createdDate.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const durationMin =
    durationS > 0 ? Math.max(1, Math.round(durationS / 60)) : 0;

  const statusLabels: Record<SessionRow["status"], string> = {
    pending: "En attente…",
    processing: "Transcription en cours…",
    completed: durationS > 0 ? `${Math.round(durationS / 60)} min` : "Terminé",
    failed: "Échec",
  };

  return {
    id: row.id,
    icon: "🎙",
    name: row.name,
    status: row.status,
    dateLabel,
    updatedLabel: `Dernière mise à jour : ${new Date(row.updatedAt).toLocaleString("fr-FR")}`,
    durationLabel: statusLabels[row.status],
    durationMin,
    runTag: row.jobId,
    speakers,
    segments: segmentItems,
    blocks,
    speakerNames: row.speakerNames,
    report: reportRow
      ? ({
          templateId: reportRow.templateId,
          templateName: reportRow.templateName,
          modelTag: reportRow.modelTag,
          sections: reportRow.sections,
        } satisfies Report)
      : null,
  };
};
