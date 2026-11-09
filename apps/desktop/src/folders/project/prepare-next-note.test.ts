import { describe, expect, it, vi } from "vitest";

vi.mock("~/db", () => ({ liveQueryClient: { execute: vi.fn() } }));
vi.mock("~/session/queries", () => ({
  addSessionParticipant: vi.fn(),
  createSession: vi.fn(),
}));
vi.mock("~/store/zustand/tabs", () => ({ useTabs: { getState: vi.fn() } }));

import type { FolderMeeting } from "./meetings";
import {
  preparationDoc,
  usualMeetingTitle,
  usualParticipants,
} from "./prepare-next-note";

function meeting(id: string, title: string, day: number): FolderMeeting {
  return {
    id,
    title,
    createdAt: `2026-10-${String(day).padStart(2, "0")}T09:00:00.000Z`,
    folderPath: "Atlas",
    summaryMarkdown: null,
    oneLine: null,
  };
}

describe("usualMeetingTitle", () => {
  it("takes the most frequent title of the latest meetings", () => {
    expect(
      usualMeetingTitle([
        meeting("a", "Atelier onboarding", 26),
        meeting("b", "Point hebdo Atlas", 19),
        meeting("c", " Point  hebdo Atlas ", 12),
        meeting("d", "Atelier onboarding", 5),
        meeting("e", "", 4),
        meeting("f", "Point hebdo Atlas", 1),
      ]),
    ).toBe("Point hebdo Atlas");
  });

  it("prefers the most recent title on a tie, and is empty without titles", () => {
    expect(
      usualMeetingTitle([
        meeting("old", "Lancement", 5),
        meeting("new", "Recette", 26),
      ]),
    ).toBe("Recette");
    expect(usualMeetingTitle([meeting("a", "  ", 5)])).toBe("");
  });
});

describe("usualParticipants", () => {
  it("keeps people present in at least half of the latest meetings", () => {
    const meetings = [
      meeting("m4", "Point", 26),
      meeting("m3", "Point", 19),
      meeting("m2", "Point", 12),
      meeting("m1", "Point", 5),
      meeting("none", "Point", 1),
    ];
    const rows = [
      { session_id: "m4", human_id: "claire" },
      { session_id: "m4", human_id: "marc" },
      { session_id: "m4", human_id: "marc" },
      { session_id: "m3", human_id: "marc" },
      { session_id: "m3", human_id: "invite" },
      { session_id: "m2", human_id: "claire" },
      { session_id: "m1", human_id: "marc" },
    ];

    expect(usualParticipants(meetings, rows)).toEqual(["marc", "claire"]);
    expect(usualParticipants(meetings, [])).toEqual([]);
  });
});

describe("preparationDoc", () => {
  const agenda = {
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Recette v2 " },
                  {
                    type: "mention-@",
                    attrs: { id: "m4", type: "session", label: "26 oct." },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Ajout" }],
      },
    ],
  };

  it("puts the title first, then the agenda under its own heading", () => {
    const doc = preparationDoc({
      title: "Point hebdo Atlas",
      agenda,
      agendaHeading: "Ordre du jour",
    });

    expect(doc.content!.map((block) => block.type)).toEqual([
      "heading",
      "heading",
      "orderedList",
      "heading",
      "paragraph",
    ]);
    expect(doc.content![0]).toEqual({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Point hebdo Atlas" }],
    });
    expect(doc.content![1]!.attrs).toEqual({ level: 2 });
    expect(doc.content![2]).toEqual(agenda.content[0]);
    // Un titre de niveau 1 dans l'ordre du jour ne devient pas le titre de
    // la note.
    expect(doc.content![3]!.attrs).toEqual({ level: 3 });
  });

  it("prepares a note without agenda section when there is none", () => {
    expect(
      preparationDoc({ title: "", agenda: null, agendaHeading: "Agenda" }),
    ).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "paragraph" },
      ],
    });
  });
});
