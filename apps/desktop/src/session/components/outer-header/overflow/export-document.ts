import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

import type {
  ExportInput,
  ExportLabels,
  TranscriptItem,
} from "@syntheo/plugin-export";

import { markdownToOrg, markdownToText } from "./export-utils";

import { displaySpeakerLabel } from "~/session/components/speaker-naming/speakers";

// Issue 454 : l'export suit la langue de l'interface (en-têtes, date,
// locuteurs). Les libellés passent par le catalogue Lingui actif, la date par
// `Intl` dans la même locale.

export type ExportDocument = {
  title: string;
  /** Date de création de la note, au format ISO. */
  createdAt: string | null;
  participants: string[];
  /** Durée déjà mise en forme (`formatExportDuration`). */
  duration: string | null;
  eventTitle?: string | null;
  memoMd: string | null;
  summaryMd: string | null;
  transcript: TranscriptItem[] | null;
};

/** Espace insécable (U+00A0), écrite en clair pour rester visible. */
export const NBSP = String.fromCharCode(0xa0);

function isFrench(): boolean {
  return i18n.locale.startsWith("fr");
}

/** « : » précédé d'une espace insécable en français, « : » collé en anglais. */
function colon(): string {
  return isFrench() ? `${NBSP}:` : ":";
}

function field(label: string, value: string): string {
  return `${label}${colon()} ${value}`;
}

function intlLocale(): string {
  return isFrench() ? "fr-FR" : "en-US";
}

/** « dimanche 8 novembre 2026 à 22:28 » / « Sunday, November 8, 2026 at 10:28 PM ». */
export function formatExportDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const locale = intlLocale();
  const day = date.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = date.toLocaleTimeString(locale, {
    hour: isFrench() ? "2-digit" : "numeric",
    minute: "2-digit",
  });
  return t`${day} at ${time}`;
}

/** « 11 min », « 1 h 05 ». */
export function formatExportDuration(startMs: number, endMs: number): string {
  const minutes = Math.max(0, Math.floor((endMs - startMs) / 60000));
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  }
  return `${minutes} min`;
}

function labels() {
  return {
    created: t({ message: "Created", context: "export field" }),
    duration: t`Duration`,
    participants: t`Participants`,
    metadata: t`Metadata`,
    memo: t`Memo`,
    summary: t({ message: "Summary", context: "export section" }),
    transcript: t({ message: "Transcript", context: "export section" }),
  };
}

export function formatExportTranscript(
  items: ReadonlyArray<{ speaker: string | null; text: string }>,
): string {
  return items
    .map((item) =>
      item.speaker
        ? field(displaySpeakerLabel(item.speaker), item.text)
        : item.text,
    )
    .join("\n\n");
}

function metadataFields(doc: ExportDocument): Array<[string, string]> {
  const l = labels();
  const fields: Array<[string, string]> = [];
  if (doc.createdAt) {
    fields.push([l.created, formatExportDate(doc.createdAt)]);
  }
  if (doc.participants.length > 0) {
    fields.push([l.participants, doc.participants.join(", ")]);
  }
  if (doc.duration) {
    fields.push([l.duration, doc.duration]);
  }
  return fields;
}

function contentSections(doc: ExportDocument): Array<{
  title: string;
  body: string;
  kind: "markdown" | "transcript";
}> {
  const l = labels();
  const sections: Array<{
    title: string;
    body: string;
    kind: "markdown" | "transcript";
  }> = [];
  if (doc.memoMd) {
    sections.push({ title: l.memo, body: doc.memoMd, kind: "markdown" });
  }
  if (doc.summaryMd) {
    sections.push({ title: l.summary, body: doc.summaryMd, kind: "markdown" });
  }
  const transcript = doc.transcript
    ? formatExportTranscript(doc.transcript)
    : "";
  if (transcript) {
    sections.push({
      title: l.transcript,
      body: transcript,
      kind: "transcript",
    });
  }
  return sections;
}

export function buildMarkdownExport(doc: ExportDocument): string {
  const lines = [`# ${doc.title}`];
  for (const [label, value] of metadataFields(doc)) {
    lines.push(`- ${field(label, value)}`);
  }
  for (const section of contentSections(doc)) {
    lines.push("", `## ${section.title}`, section.body);
  }
  return lines.join("\n");
}

export function buildTextExport(doc: ExportDocument): string {
  const lines = [doc.title, "=".repeat(doc.title.length)];
  for (const [label, value] of metadataFields(doc)) {
    lines.push(field(label, value));
  }
  for (const section of contentSections(doc)) {
    lines.push(
      "",
      section.title,
      "-".repeat(section.title.length),
      section.kind === "markdown" ? markdownToText(section.body) : section.body,
    );
  }
  return lines.join("\n");
}

export function buildOrgExport(doc: ExportDocument): string {
  const lines = [`#+TITLE: ${doc.title}`];
  if (doc.createdAt) {
    lines.push(`#+DATE: ${formatExportDate(doc.createdAt)}`);
  }
  lines.push("", `* ${labels().metadata}`);
  for (const [label, value] of metadataFields(doc)) {
    lines.push(`- ${label} :: ${value}`);
  }
  for (const section of contentSections(doc)) {
    lines.push(
      "",
      `* ${section.title}`,
      section.kind === "markdown" ? markdownToOrg(section.body) : section.body,
    );
  }
  return lines.join("\n");
}

export function pdfExportLabels(): ExportLabels {
  const l = labels();
  return {
    memo: l.memo,
    summary: l.summary,
    transcript: l.transcript,
    meeting: t({ message: "Meeting", context: "export field" }),
    participants: l.participants,
    unknownSpeaker: t({ message: "Unknown speaker", context: "export field" }),
  };
}

export function buildPdfExport(doc: ExportDocument): ExportInput {
  return {
    enhancedMd: doc.summaryMd ?? "",
    memoMd: doc.memoMd,
    transcript:
      doc.transcript && doc.transcript.length > 0
        ? {
            items: doc.transcript.map((item) => ({
              text: item.text,
              speaker: item.speaker ? displaySpeakerLabel(item.speaker) : null,
            })),
          }
        : null,
    metadata: {
      title: doc.title,
      createdAt: doc.createdAt ? formatExportDate(doc.createdAt) : "",
      participants: doc.participants,
      eventTitle: doc.eventTitle ?? null,
      duration: doc.duration,
    },
    labels: pdfExportLabels(),
  };
}
