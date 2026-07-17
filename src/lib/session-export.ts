import type { Block, Report } from "@/data/sessions";

export function buildTranscriptText(
  blocks: Block[],
  speakerNames: Record<string, string>,
): string {
  return blocks
    .map(
      (b) =>
        `[${b.ts}] ${speakerNames[b.speakerId] ?? b.speakerId} : ${b.text}`,
    )
    .join("\n");
}

export function buildTranscriptPlain(blocks: Block[]): string {
  return blocks.map((b) => b.text).join("\n\n");
}

export function buildReportFormatted(report: Report): string {
  return report.sections
    .map((s) => `${s.title.toUpperCase()}\n\n${s.body}`)
    .join("\n\n");
}

export function buildReportMarkdown(report: Report): string {
  return report.sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n");
}

export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType: string,
): void {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function buildDocxBlob(
  title: string,
  sections: Array<{ heading?: string; text: string }>,
): Promise<Blob> {
  const { Document, Paragraph, HeadingLevel, TextRun, Packer } = await import(
    "docx"
  );
  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph(""),
    ...sections.flatMap((s) => [
      ...(s.heading
        ? [new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 })]
        : []),
      new Paragraph({ children: [new TextRun(s.text)] }),
      new Paragraph(""),
    ]),
  ];
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}
