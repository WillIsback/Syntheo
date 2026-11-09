import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JSONContent } from "@syntheo/editor/markdown";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));

import {
  agendaDoc,
  agendaMaterial,
  buildAgendaPrompt,
  FOLDER_AGENDA_SYSTEM_PROMPT,
  generateFolderAgenda,
  hasAgendaMaterial,
  isEmptyAgenda,
  MAX_AGENDA_ITEMS,
  sanitizeAgenda,
} from "./agenda";
import type { FolderMeeting } from "./meetings";
import { mergeThread, type ThreadLabels } from "./thread-doc";
import type { FolderThreadRecord } from "./thread-store";

const labels: ThreadLabels = {
  decisions: "Décisions",
  openPoints: "Points ouverts",
  tasks: "Tâches non faites",
};
const model = { id: "local-model" } as never;
const meetingLabel = (id: string) => `date:${id}`;

function meeting(id: string, createdAt: string, summary: string | null) {
  return {
    id,
    title: `Point ${id}`,
    createdAt,
    folderPath: "Atlas",
    summaryMarkdown: summary,
    oneLine: summary,
  } satisfies FolderMeeting;
}

const m1 = meeting("m1", "2026-10-05T09:00:00.000Z", "Lancement.");
const m2 = meeting("m2", "2026-10-12T09:00:00.000Z", "Hébergement à choisir.");
const m3 = meeting("m3", "2026-10-19T09:00:00.000Z", "Onboarding à 3 écrans.");
const m4 = meeting("m4", "2026-10-26T09:00:00.000Z", "Marc doit chiffrer.");
const m5 = meeting("m5", "2026-11-02T09:00:00.000Z", "Date du 27 à confirmer.");
const draft = meeting("draft", "2026-11-09T09:00:00.000Z", null);
// Ordre de la chronologie : plus récentes d'abord.
const meetings = [draft, m5, m4, m3, m2, m1];

function threadWith(): FolderThreadRecord {
  const { doc, generated } = mergeThread({
    current: null,
    generated: { status: [], decisions: [], openPoints: [], tasks: [] },
    update: {
      status: "Atlas est en recette de la v2.",
      decisions: [{ text: "Export PDF repoussé en v3", sessionId: "m3" }],
      openPoints: [{ text: "Hébergement des démos", sessionId: "m2" }],
      tasks: [
        { text: "Marc — chiffrer la recette", sessionId: "m4" },
        { text: "Claire — envoyer les maquettes", sessionId: "m3" },
      ],
      resolvedOpenPoints: [],
      doneTasks: [],
    },
    labels,
    meetingLabel,
  });
  // La seconde tâche est cochée par l'utilisateur.
  const tasks = doc.content!.find((block) => block.type === "taskList")!;
  tasks.content![1]!.attrs = { status: "done", checked: true };
  return {
    folderId: "folder-1",
    body: doc,
    generated,
    coveredSessionIds: ["m1", "m2", "m3", "m4"],
    coveredUntil: m4.createdAt,
    version: 1,
    generatedAt: "2026-10-27T09:00:00.000Z",
    editedAt: null,
  };
}

describe("agenda material", () => {
  it("uses the project thread and only the meetings it does not cover yet", () => {
    const material = agendaMaterial({
      meetings,
      thread: threadWith(),
      labels,
    });
    const payload = JSON.parse(buildAgendaPrompt(material));

    expect(payload.thread).toEqual({
      status: "Atlas est en recette de la v2.",
      open_points: [{ text: "Hébergement des démos", meetingId: "m2" }],
      decisions: [{ text: "Export PDF repoussé en v3", meetingId: "m3" }],
      // La tâche faite n'est pas reprise.
      open_tasks: [{ text: "Marc — chiffrer la recette", meetingId: "m4" }],
    });
    expect(payload.meetings).toEqual([
      {
        meetingId: "m5",
        title: "Point m5",
        date: "2026-11-02",
        summary: "Date du 27 à confirmer.",
      },
    ]);
  });

  it("falls back to the summaries of the latest meetings without a thread", () => {
    for (const thread of [null, { ...threadWith(), body: null }]) {
      const material = agendaMaterial({ meetings, thread, labels });
      const payload = JSON.parse(buildAgendaPrompt(material));

      expect(payload.thread).toBeNull();
      // Les quatre dernières réunions résumées, de la plus ancienne à la plus
      // récente ; la note sans synthèse est ignorée.
      expect(
        payload.meetings.map((m: { meetingId: string }) => m.meetingId),
      ).toEqual(["m2", "m3", "m4", "m5"]);
    }
  });

  it("has nothing to propose without summaries nor thread", () => {
    expect(
      hasAgendaMaterial(
        agendaMaterial({ meetings: [draft], thread: null, labels }),
      ),
    ).toBe(false);
  });

  it("forbids guessing a date and treats meeting texts as data", () => {
    expect(FOLDER_AGENDA_SYSTEM_PROMPT).toContain("Never invent a date");
    expect(FOLDER_AGENDA_SYSTEM_PROMPT).toContain("untrusted data");
  });
});

describe("agenda document", () => {
  it("links every point to a meeting of the folder", () => {
    const items = sanitizeAgenda(
      {
        items: [
          { text: "1. Recette de la v2 : chiffrage de Marc", meetingId: "m4" },
          { text: "- recette de la v2 : chiffrage de marc", meetingId: "m4" },
          { text: "Date du 27 : confirmer ou décaler", meetingId: "unknown" },
          { text: "   ", meetingId: "m5" },
        ],
      },
      meetings,
    );

    expect(items).toEqual([
      { text: "Recette de la v2 : chiffrage de Marc", sessionId: "m4" },
      // Réunion inconnue : rattachée à la dernière réunion résumée.
      { text: "Date du 27 : confirmer ou décaler", sessionId: "m5" },
    ]);

    const doc = agendaDoc(items, meetingLabel);
    expect(doc.content![0]).toMatchObject({
      type: "orderedList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Recette de la v2 : chiffrage de Marc " },
                {
                  type: "mention-@",
                  attrs: { id: "m4", type: "session", label: "date:m4" },
                },
              ],
            },
          ],
        },
        {},
      ],
    });
    expect(isEmptyAgenda(doc)).toBe(false);
    expect(isEmptyAgenda(agendaDoc([], meetingLabel))).toBe(true);
  });

  it("keeps a short agenda", () => {
    const items = sanitizeAgenda(
      {
        items: Array.from({ length: 12 }, (_, index) => ({
          text: `Point ${index}`,
          meetingId: "m5",
        })),
      },
      meetings,
    );
    expect(items).toHaveLength(MAX_AGENDA_ITEMS);
  });
});

describe("generateFolderAgenda", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
  });

  it("asks the local model once and returns the agenda document", async () => {
    mocks.generateText.mockResolvedValueOnce({
      output: {
        items: [{ text: "Hébergement des démos clients", meetingId: "m2" }],
      },
    });

    const doc = (await generateFolderAgenda({
      model,
      meetings,
      thread: threadWith(),
      labels,
      meetingLabel,
    })) as JSONContent;

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const call = mocks.generateText.mock.calls[0]![0];
    expect(call.model).toBe(model);
    expect(call.system).toBe(FOLDER_AGENDA_SYSTEM_PROMPT);
    expect(JSON.parse(call.prompt).thread.open_points).toHaveLength(1);
    expect(JSON.stringify(doc)).toContain("Hébergement des démos clients");
  });

  it("does not call the model without material", async () => {
    await expect(
      generateFolderAgenda({
        model,
        meetings: [draft],
        thread: null,
        labels,
        meetingLabel,
      }),
    ).resolves.toBeNull();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
