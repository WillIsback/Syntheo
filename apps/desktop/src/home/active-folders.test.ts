import { describe, expect, it } from "vitest";

import type { JSONContent } from "@syntheo/editor/markdown";

import {
  folderThreadState,
  HOME_FOLDERS_LIMIT,
  mapFolderThreadBodyRows,
  selectActiveFolders,
} from "./active-folders";

import { ENGLISH_THREAD_LABELS } from "~/folders/project/thread-doc";
import type { SearchNote } from "~/search/unified/types";

const LABELS = { ...ENGLISH_THREAD_LABELS, openPoints: "Points ouverts" };

function note(id: string, folderPath: string, createdAt: string): SearchNote {
  return { id, title: id, folderPath, createdAt };
}

function heading(text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text }],
  };
}

function item(text: string, done = false): JSONContent {
  return {
    type: "taskItem",
    attrs: { checked: done },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const THREAD: JSONContent = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Où en est." }] },
    heading("Points ouverts"),
    { type: "taskList", content: [item("Budget"), item("Calendrier")] },
    heading("Open tasks"),
    {
      type: "taskList",
      content: [item("Envoyer le devis"), item("Relancer", true)],
    },
  ],
};

function select(
  overrides: Partial<Parameters<typeof selectActiveFolders>[0]> = {},
) {
  return selectActiveFolders({
    folderPaths: [],
    notes: [],
    threads: [],
    icons: {},
    labels: LABELS,
    ...overrides,
  });
}

describe("selectActiveFolders", () => {
  it("range les dossiers par dernière réunion, la plus récente d'abord", () => {
    const folders = select({
      folderPaths: ["Atlas", "Comité", "Recrutement", "Vide"],
      notes: [
        note("a2", "Atlas", "2026-11-02T09:00:00Z"),
        note("r1", "Recrutement", "2026-10-30T09:00:00Z"),
        note("c1", "Comité", "2026-10-29T09:00:00Z"),
        note("a1", "Atlas", "2026-10-26T09:00:00Z"),
        note("x", "", "2026-11-05T09:00:00Z"),
      ],
    });

    expect(folders.map((folder) => folder.path)).toEqual([
      "Atlas",
      "Recrutement",
      "Comité",
    ]);
    expect(folders[0]).toMatchObject({
      name: "Atlas",
      meetingCount: 2,
      lastMeetingAt: "2026-11-02T09:00:00Z",
      thread: null,
    });
  });

  it(`garde au plus ${HOME_FOLDERS_LIMIT} dossiers`, () => {
    const paths = Array.from({ length: 9 }, (_, i) => `D${i}`);
    const folders = select({
      folderPaths: paths,
      notes: paths.map((path, i) =>
        note(path, path, `2026-10-${String(10 + i)}T09:00:00Z`),
      ),
    });

    expect(folders).toHaveLength(HOME_FOLDERS_LIMIT);
    expect(folders[0]?.path).toBe("D8");
    expect(select({ folderPaths: paths, limit: 0 })).toEqual([]);
  });

  it("ne garde que les dossiers qui contiennent eux-mêmes une note", () => {
    const folders = select({
      folderPaths: ["Clients", "Clients/Acme", "Inconnu"],
      notes: [
        note("n1", "Clients/Acme", "2026-11-01T09:00:00Z"),
        note("n2", "Ailleurs", "2026-11-03T09:00:00Z"),
      ],
    });

    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({ path: "Clients/Acme", name: "Acme" });
  });

  it("compte les réunions des sous-dossiers, comme la page du dossier", () => {
    const [parent] = select({
      folderPaths: ["Atlas", "Atlas/Ateliers"],
      notes: [
        note("n2", "Atlas/Ateliers", "2026-11-04T09:00:00Z"),
        note("n1", "Atlas", "2026-11-01T09:00:00Z"),
      ],
    });

    expect(parent).toMatchObject({
      path: "Atlas",
      meetingCount: 2,
      lastMeetingAt: "2026-11-04T09:00:00Z",
    });
  });

  it("indique l'état du fil rouge quand il existe", () => {
    const folders = select({
      folderPaths: ["Atlas", "Comité"],
      notes: [
        note("a", "Atlas", "2026-11-02T09:00:00Z"),
        note("c", "Comité", "2026-11-01T09:00:00Z"),
      ],
      threads: [
        { folderPath: "Atlas", body: THREAD },
        { folderPath: "Comité", body: { type: "doc", content: [] } },
      ],
    });

    expect(folders[0]?.thread).toEqual({ openPoints: 2, tasks: 1 });
    expect(folders[1]?.thread).toBeNull();
  });
});

describe("folderThreadState", () => {
  it("compte les points ouverts et les tâches non cochées", () => {
    expect(folderThreadState(THREAD, LABELS)).toEqual({
      openPoints: 2,
      tasks: 1,
    });
  });

  it("ne compte que les sections dont l'intitulé est reconnu", () => {
    expect(folderThreadState(THREAD, ENGLISH_THREAD_LABELS)).toEqual({
      openPoints: 0,
      tasks: 1,
    });
  });

  it("renvoie null sans fil rouge ou s'il est vide", () => {
    expect(folderThreadState(null, LABELS)).toBeNull();
    expect(
      folderThreadState(
        { type: "doc", content: [{ type: "paragraph" }] },
        {
          ...LABELS,
        },
      ),
    ).toBeNull();
  });
});

describe("mapFolderThreadBodyRows", () => {
  it("lit le corps JSON et ignore un corps illisible", () => {
    expect(
      mapFolderThreadBodyRows([
        { folder_path: "Atlas", body: JSON.stringify(THREAD) },
        { folder_path: "Comité", body: "{" },
        { folder_path: "Vide", body: "" },
      ]),
    ).toEqual([
      { folderPath: "Atlas", body: THREAD },
      { folderPath: "Comité", body: null },
      { folderPath: "Vide", body: null },
    ]);
  });
});
