import { describe, expect, it } from "vitest";

import {
  folderMeetingStats,
  type FolderMeetingSqlRow,
  mapFolderMeetingRows,
  summaryFirstLine,
} from "./meetings";

function summaryBody(title: string, ...paragraphs: string[]) {
  return JSON.stringify({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Résumé" }],
      },
      ...paragraphs.map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    ],
  });
}

function row(
  overrides: Partial<FolderMeetingSqlRow> & { id: string },
): FolderMeetingSqlRow {
  return {
    title: "Point hebdo Atlas",
    created_at: "2026-11-02T09:00:00.000Z",
    folder_path: "Atlas",
    document_id: null,
    body: null,
    body_format: null,
    kind: null,
    template_id: null,
    sort_order: null,
    ...overrides,
  };
}

describe("folder meetings", () => {
  it("aggregates notes from nested folders, most recent first, and leaves out look-alike folders", () => {
    const meetings = mapFolderMeetingRows(
      [
        row({
          id: "s3",
          created_at: "2026-11-02T09:00:00.000Z",
          document_id: "summary:s3",
          body: summaryBody(
            "Point hebdo Atlas",
            "Recette v2 en cours ; date du 27 maintenue sous réserve.",
            "Deuxième paragraphe.",
          ),
          body_format: "prosemirror_json",
          kind: "summary",
          sort_order: 0,
        }),
        row({
          id: "s2",
          title: "Atelier onboarding",
          created_at: "2026-10-19T09:00:00.000Z",
          folder_path: "Atlas/Ateliers",
          document_id: "summary:s2",
          body: "# Atelier onboarding\n\n- Onboarding ramené à 3 écrans",
          body_format: "markdown",
          kind: "summary",
          sort_order: 0,
        }),
        row({
          id: "other",
          created_at: "2026-10-20T09:00:00.000Z",
          folder_path: "Atlas 2",
        }),
        row({ id: "s1", created_at: "2026-07-07T09:00:00.000Z" }),
      ],
      "Atlas",
    );

    expect(meetings.map((meeting) => meeting.id)).toEqual(["s3", "s2", "s1"]);
    expect(meetings[0]).toMatchObject({
      oneLine: "Recette v2 en cours ; date du 27 maintenue sous réserve.",
      folderPath: "Atlas",
    });
    expect(meetings[0]!.summaryMarkdown).toContain("Deuxième paragraphe.");
    expect(meetings[0]!.summaryMarkdown).not.toContain("# Point hebdo Atlas");
    expect(meetings[1]).toMatchObject({
      folderPath: "Atlas/Ateliers",
      oneLine: "Onboarding ramené à 3 écrans",
    });
    // Sans synthèse : pas de résumé d'une ligne, rien n'est généré.
    expect(meetings[2]).toMatchObject({ summaryMarkdown: null, oneLine: null });

    expect(folderMeetingStats(meetings)).toEqual({
      count: 3,
      firstAt: "2026-07-07T09:00:00.000Z",
      lastAt: "2026-11-02T09:00:00.000Z",
    });
  });

  it("keeps one entry per note when it has several summaries and picks the filled one", () => {
    const meetings = mapFolderMeetingRows(
      [
        row({
          id: "s1",
          document_id: "summary:s1",
          body: "",
          body_format: "prosemirror_json",
          kind: "summary",
          sort_order: 0,
        }),
        row({
          id: "s1",
          document_id: "template:s1",
          body: summaryBody("Point hebdo Atlas", "Le modèle a tranché."),
          body_format: "prosemirror_json",
          kind: "template_output",
          template_id: "tpl",
          sort_order: 1,
        }),
      ],
      "Atlas",
    );

    expect(meetings).toHaveLength(1);
    expect(meetings[0]!.oneLine).toBe("Le modèle a tranché.");
  });

  it("shortens a long first paragraph at a word", () => {
    const line = summaryFirstLine({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "mot ".repeat(100) }],
        },
      ],
    });

    expect(line!.length).toBeLessThanOrEqual(221);
    expect(line!.endsWith("…")).toBe(true);
  });
});
