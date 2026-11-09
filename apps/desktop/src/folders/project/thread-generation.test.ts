import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JSONContent } from "@syntheo/editor/markdown";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));

import type { FolderMeeting } from "./meetings";
import {
  ENGLISH_THREAD_LABELS,
  mergeThread,
  parseThread,
  type ThreadLabels,
} from "./thread-doc";
import {
  generateFolderThread,
  pendingThreadMeetings,
  planThreadBatches,
  threadFreshness,
} from "./thread-generation";
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

const m1 = meeting("m1", "2026-10-19T09:00:00.000Z", "Onboarding à 3 écrans.");
const m2 = meeting("m2", "2026-10-26T09:00:00.000Z", "Export PDF repoussé.");
const m3 = meeting("m3", "2026-11-02T09:00:00.000Z", "Recette v2 en cours.");
const draft = meeting("draft", "2026-11-09T09:00:00.000Z", null);

function output(overrides: Record<string, unknown> = {}) {
  return {
    output: {
      status: "",
      decisions: [],
      openPoints: [],
      tasks: [],
      resolvedOpenPoints: [],
      doneTasks: [],
      ...overrides,
    },
  };
}

function record(
  body: JSONContent,
  generated: FolderThreadRecord["generated"],
  covered: string[],
  coveredUntil: string,
): FolderThreadRecord {
  return {
    folderId: "folder-1",
    body,
    generated,
    coveredSessionIds: covered,
    coveredUntil,
    version: 1,
    generatedAt: "2026-10-27T10:00:00.000Z",
    editedAt: null,
  };
}

function lastPrompt() {
  const call = mocks.generateText.mock.calls[
    mocks.generateText.mock.calls.length - 1
  ]![0] as {
    prompt: string;
    instructions: string;
  };
  return { ...call, payload: JSON.parse(call.prompt) as Record<string, any> };
}

async function firstThread() {
  mocks.generateText.mockResolvedValueOnce(
    output({
      status: "Atlas est en recette de la v2.",
      decisions: [{ text: "L'onboarding passe à 3 écrans", meetingId: "m1" }],
      openPoints: [
        { text: "Hébergement des démos", meetingId: "m1" },
        { text: "Date de livraison à confirmer", meetingId: "m2" },
      ],
      tasks: [{ text: "Marc — chiffrer la recette", meetingId: "m2" }],
    }),
  );
  const next = await generateFolderThread({
    model,
    meetings: [m2, m1],
    thread: null,
    labels,
    meetingLabel,
  });
  return record(
    next!.body,
    next!.generated,
    next!.coveredSessionIds,
    next!.coveredUntil!,
  );
}

beforeEach(() => {
  mocks.generateText.mockReset();
});

describe("folder thread generation", () => {
  it("writes the first thread from the summaries, oldest first, each item linked to its meeting", async () => {
    const thread = await firstThread();

    const { payload, instructions } = lastPrompt();
    expect(payload.existing_thread).toBeNull();
    expect(
      payload.meetings.map((item: { meetingId: string }) => item.meetingId),
    ).toEqual(["m1", "m2"]);
    expect(instructions).toContain("untrusted data");

    expect(thread.coveredSessionIds.sort()).toEqual(["m1", "m2"]);
    expect(thread.coveredUntil).toBe(m2.createdAt);
    const parsed = parseThread(thread.body, labels);
    expect(parsed.status).toEqual(["Atlas est en recette de la v2."]);
    expect(parsed.decisions).toEqual([
      { text: "L'onboarding passe à 3 écrans", sessionId: "m1", done: false },
    ]);
    expect(parsed.tasks[0]).toMatchObject({ sessionId: "m2", done: false });
    const heading = thread.body!.content!.find(
      (block) => block.type === "heading",
    );
    expect(heading?.content?.[0]?.text).toBe("Décisions");
  });

  it("sends the current thread with only the meetings it does not cover yet", async () => {
    const thread = await firstThread();
    mocks.generateText.mockResolvedValueOnce(output({ status: "Suite." }));

    await generateFolderThread({
      model,
      meetings: [draft, m3, m2, m1],
      thread,
      labels,
      meetingLabel,
    });

    const { payload } = lastPrompt();
    expect(
      payload.meetings.map((item: { meetingId: string }) => item.meetingId),
    ).toEqual(["m3"]);
    expect(payload.existing_thread).toMatchObject({
      status: "Atlas est en recette de la v2.",
      decisions: ["L'onboarding passe à 3 écrans"],
      open_points: [
        { index: 0, text: "Hébergement des démos" },
        { index: 1, text: "Date de livraison à confirmer" },
      ],
      tasks: [{ index: 0, text: "Marc — chiffrer la recette", done: false }],
    });
  });

  it("keeps manual corrections when an update adds the new meetings", async () => {
    const thread = await firstThread();
    const edited = structuredClone(thread.body!);
    // L'utilisateur corrige une décision, coche la tâche, ajoute un point et
    // précise l'état du projet.
    const [statusBlock, , decisions, , openPoints, , tasks] = edited.content!;
    statusBlock!.content = [
      { type: "text", text: "Recette v2, livraison visée le 27." },
    ];
    decisions!.content![0]!.content![0]!.content![0]!.text =
      "L'onboarding passe à 3 écrans (validé par Claire) ";
    tasks!.content![0]!.attrs = {
      ...tasks!.content![0]!.attrs,
      status: "done",
      checked: true,
    };
    openPoints!.content!.push({
      type: "listItem",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Budget démo" }] },
      ],
    });
    mocks.generateText.mockResolvedValueOnce(
      output({
        status: "La date du 27 est maintenue sous réserve.",
        decisions: [{ text: "Abandon de l'export PDF en v2", meetingId: "m3" }],
        openPoints: [
          { text: "Maquettes de l'onboarding en retard", meetingId: "m3" },
        ],
        tasks: [
          { text: "Claire — envoyer les maquettes v2", meetingId: "unknown" },
        ],
        // Le point 0 vient du modèle et n'a pas été retouché : il est retiré.
        // Le point 2 (ajouté à la main) est signalé tranché : il reste.
        resolvedOpenPoints: [0, 2, 99],
      }),
    );

    const next = await generateFolderThread({
      model,
      meetings: [m3, m2, m1],
      thread: { ...thread, body: edited },
      labels,
      meetingLabel,
    });

    const parsed = parseThread(next!.body, labels);
    expect(parsed.status).toEqual([
      "Recette v2, livraison visée le 27.",
      "La date du 27 est maintenue sous réserve.",
    ]);
    expect(parsed.decisions.map((item) => item.text)).toEqual([
      "L'onboarding passe à 3 écrans (validé par Claire)",
      "Abandon de l'export PDF en v2",
    ]);
    expect(parsed.openPoints.map((item) => item.text)).toEqual([
      "Date de livraison à confirmer",
      "Budget démo",
      "Maquettes de l'onboarding en retard",
    ]);
    expect(parsed.tasks).toEqual([
      { text: "Marc — chiffrer la recette", sessionId: "m2", done: true },
      // Réunion inconnue : rattachée à la dernière réunion du lot.
      {
        text: "Claire — envoyer les maquettes v2",
        sessionId: "m3",
        done: false,
      },
    ]);
    // Les corrections ne font pas partie des textes du modèle : la mise à jour
    // suivante les gardera encore.
    expect(next!.generated.decisions).toEqual([
      "Abandon de l'export PDF en v2",
    ]);
    expect(next!.generated.status).toEqual([
      "La date du 27 est maintenue sous réserve.",
    ]);
    expect(next!.coveredSessionIds.sort()).toEqual(["m1", "m2", "m3"]);
    expect(next!.coveredUntil).toBe(m3.createdAt);
  });

  it("replaces only the model's own status and keeps sections the user renamed", () => {
    const { doc } = mergeThread({
      current: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Ancien état." }],
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "Mes remarques" }],
          },
          { type: "paragraph", content: [{ type: "text", text: "À garder." }] },
        ],
      },
      generated: {
        status: ["Ancien état."],
        decisions: [],
        openPoints: [],
        tasks: [],
      },
      update: {
        status: "Nouvel état.",
        decisions: [{ text: "Décision", sessionId: "m3" }],
        openPoints: [],
        tasks: [],
        resolvedOpenPoints: [],
        doneTasks: [],
      },
      labels: ENGLISH_THREAD_LABELS,
      meetingLabel,
    });

    const texts = doc.content!.map((block) =>
      (block.content ?? []).map((child) => child.text ?? child.type).join(""),
    );
    expect(texts[0]).toBe("Nouvel état.");
    expect(texts).toContain("Mes remarques");
    expect(texts).toContain("À garder.");
    expect(texts).not.toContain("Ancien état.");
    expect(texts[texts.length - 2]).toBe("Decisions");
  });

  it("reports how far the thread is up to date and how many meetings came since", async () => {
    const thread = await firstThread();

    expect(threadFreshness([draft, m3, m2, m1], thread)).toEqual({
      coveredUntil: m2.createdAt,
      pendingCount: 1,
    });
    expect(threadFreshness([m2, m1], thread)).toEqual({
      coveredUntil: m2.createdAt,
      pendingCount: 0,
    });
    // Une note sans synthèse n'est pas en attente ; aucun fil rouge : tout
    // ce qui a une synthèse l'est.
    expect(
      pendingThreadMeetings([draft, m3, m1], null).map((m) => m.id),
    ).toEqual(["m1", "m3"]);
  });

  it("builds a long history in batches and returns nothing when everything is covered", async () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      meeting(
        `h${index}`,
        `2026-0${(index % 9) + 1}-01T09:00:00.000Z`,
        "x".repeat(5_000),
      ),
    );
    const batches = planThreadBatches(pendingThreadMeetings(many, null));
    expect(batches.map((batch) => batch.length)).toEqual([4, 4]);

    mocks.generateText.mockResolvedValue(output({ status: "État." }));
    const next = await generateFolderThread({
      model,
      meetings: many,
      thread: null,
      labels,
      meetingLabel,
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(next!.coveredSessionIds).toHaveLength(8);

    mocks.generateText.mockClear();
    expect(
      await generateFolderThread({
        model,
        meetings: many,
        thread: record(
          next!.body,
          next!.generated,
          next!.coveredSessionIds,
          "",
        ),
        labels,
        meetingLabel,
      }),
    ).toBeNull();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
