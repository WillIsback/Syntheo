import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Bloc « Prochaine réunion » (issue 491) sur une vraie base SQLite construite
// à partir des migrations : vraie requête des réunions, vrai stockage de
// l'ordre du jour, vrai éditeur de note. Seuls le modèle, les onglets, la
// création de note et l'ajout de participants sont simulés.

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type SqlParams = import("node:sqlite").SQLInputValue[];

const mocks = vi.hoisted(() => ({
  database: null as null | import("node:sqlite").DatabaseSync,
  listeners: new Set<() => void>(),
  generateText: vi.fn(),
  createSession: vi.fn(),
  addSessionParticipant: vi.fn(),
  openNew: vi.fn(),
  transitionChatMode: vi.fn(),
}));

function query(sql: string, params: unknown[] = []) {
  return mocks.database!.prepare(sql).all(...(params as SqlParams));
}

function run(sql: string, params: unknown[] = []) {
  mocks.database!.prepare(sql).run(...(params as SqlParams));
}

vi.mock("~/db", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    liveQueryClient: {
      execute: async (sql: string, params?: unknown[]) => query(sql, params),
    },
    executeTransaction: async (
      statements: Array<{ sql: string; params: unknown[] }>,
    ) => {
      try {
        return statements.map(
          ({ sql, params }) =>
            mocks.database!.prepare(sql).run(...(params as SqlParams)).changes,
        );
      } finally {
        mocks.listeners.forEach((listener) => listener());
      }
    },
    useLiveQuery: (options: {
      sql: string;
      params?: unknown[];
      enabled?: boolean;
      mapRows?: (rows: Array<Record<string, unknown>>) => unknown;
    }) => {
      const [, refresh] = React.useReducer((count: number) => count + 1, 0);
      React.useEffect(() => {
        mocks.listeners.add(refresh);
        return () => {
          mocks.listeners.delete(refresh);
        };
      }, []);
      const enabled = options.enabled !== false;
      const rows = enabled
        ? (query(options.sql, options.params) as Array<Record<string, unknown>>)
        : [];
      const mapped = options.mapRows ? options.mapRows(rows) : rows;
      const cache = React.useRef<{ key: string; data: unknown } | null>(null);
      const key = JSON.stringify(mapped);
      if (cache.current?.key !== key) {
        cache.current = { key, data: mapped };
      }
      return { data: enabled ? cache.current.data : undefined };
    },
  };
});

vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));

vi.mock("~/ai/hooks", () => ({
  useLanguageModel: () => ({ id: "local-model" }),
}));

vi.mock("~/editor-bridge/mention-config", () => ({
  useMentionConfig: () => undefined,
}));

vi.mock("~/editor-bridge/open-editor-link", () => ({
  openEditorLink: vi.fn(),
}));

vi.mock("~/session/folder-catalog", () => ({
  ensureFolderCatalog: async (path: string) => path,
}));

vi.mock("~/session/queries", () => ({
  addSessionParticipant: mocks.addSessionParticipant,
  createSession: mocks.createSession,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: Object.assign(() => undefined, {
    getState: () => ({
      openNew: mocks.openNew,
      transitionChatMode: mocks.transitionChatMode,
    }),
  }),
}));

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

import { useFolderSelection } from "../selection";
import { useFolderMeetings } from "./meetings";
import {
  openNextMeetingBlock,
  useNextMeetingRequest,
} from "./next-meeting-request";
import { NextMeetingSlot } from "./next-meeting-slot";
import { saveGeneratedFolderThread, useFolderThread } from "./thread-store";

import { messages as englishMessages } from "~/i18n/locales/en/messages";

const MIGRATIONS = resolve(process.cwd(), "../../crates/db-app/migrations");
let schema = "";

function summary(title: string, text: string) {
  return JSON.stringify({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title }],
      },
      { type: "paragraph", content: [{ type: "text", text }] },
    ],
  });
}

function addMeeting(
  id: string,
  title: string,
  createdAt: string,
  summaryText: string | null,
  participants: string[] = [],
) {
  run(
    `INSERT INTO sessions (id, owner_user_id, title, folder_path, created_at)
     VALUES (?, 'user-1', ?, 'Atlas', ?)`,
    [id, title, createdAt],
  );
  if (summaryText) {
    run(
      `INSERT INTO session_documents (id, session_id, kind, title, body_format, body)
       VALUES (?, ?, 'summary', 'Summary', 'prosemirror_json', ?)`,
      [`summary:${id}`, id, summary(title, summaryText)],
    );
  }
  for (const humanId of participants) {
    run(
      `INSERT INTO session_participants (id, session_id, human_id, source)
       VALUES (?, ?, ?, 'manual')`,
      [`${id}:${humanId}`, id, humanId],
    );
  }
}

function storedAgenda() {
  return query(
    `SELECT body, generated_at, agenda_body, agenda_generated_at, agenda_edited_at
     FROM folder_threads WHERE folder_id = 'folder-1'`,
  )[0] as
    | {
        body: string;
        generated_at: string;
        agenda_body: string;
        agenda_generated_at: string;
        agenda_edited_at: string;
      }
    | undefined;
}

function lastPayload() {
  const calls = mocks.generateText.mock.calls;
  return JSON.parse((calls[calls.length - 1]![0] as { prompt: string }).prompt);
}

function agendaOutput(items: Array<{ text: string; meetingId: string }>) {
  return { output: { items } };
}

function Page() {
  const meetings = useFolderMeetings("Atlas");
  const thread = useFolderThread("Atlas");
  return (
    <NextMeetingSlot folderPath="Atlas" meetings={meetings} thread={thread} />
  );
}

function renderPage() {
  return render(
    <I18nProvider i18n={i18n}>
      <Page />
    </I18nProvider>,
  );
}

describe("Next meeting block", () => {
  beforeAll(() => {
    i18n.load("en", englishMessages);
    i18n.activate("en");
    Element.prototype.scrollIntoView ??= vi.fn();
    schema = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(resolve(MIGRATIONS, name), "utf8"))
      .join("\n");
  });

  beforeEach(() => {
    const database = new DatabaseSync(":memory:");
    database.exec(schema);
    mocks.database = database;
    for (const mock of [
      mocks.generateText,
      mocks.createSession,
      mocks.addSessionParticipant,
      mocks.openNew,
      mocks.transitionChatMode,
    ]) {
      mock.mockReset();
    }
    useFolderSelection.setState({ selectedPath: null });
    run("INSERT INTO folders (id, path) VALUES ('folder-1', 'Atlas')");
    for (const human of ["claire", "marc", "invite"]) {
      run("INSERT INTO humans (id, name) VALUES (?, ?)", [human, human]);
    }
    addMeeting(
      "s1",
      "Atelier onboarding",
      "2026-10-19T09:00:00.000Z",
      "Onboarding ramené à 3 écrans.",
      ["claire", "invite"],
    );
    addMeeting(
      "s2",
      "Point hebdo Atlas",
      "2026-10-26T09:00:00.000Z",
      "Marc doit chiffrer la recette.",
      ["claire", "marc"],
    );
    addMeeting(
      "s3",
      "Point hebdo Atlas",
      "2026-11-02T09:00:00.000Z",
      "Date du 27 à confirmer.",
      ["marc", "claire"],
    );
  });

  afterEach(() => {
    cleanup();
    mocks.database?.close();
    mocks.database = null;
  });

  it("proposes the agenda from the latest summaries when there is no thread", async () => {
    mocks.generateText.mockResolvedValueOnce(
      agendaOutput([
        { text: "Recette v2 : chiffrage de Marc", meetingId: "s2" },
        { text: "Date du 27 : confirmer ou décaler", meetingId: "s3" },
      ]),
    );
    renderPage();
    expect(screen.queryByText(/Agenda proposed/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Propose" }));

    await waitFor(() => {
      expect(screen.getByText(/Recette v2 : chiffrage de Marc/)).toBeTruthy();
    });
    const payload = lastPayload();
    expect(payload.thread).toBeNull();
    expect(
      payload.meetings.map((m: { meetingId: string }) => m.meetingId),
    ).toEqual(["s1", "s2", "s3"]);
    // L'ordre du jour seul n'invente pas de fil rouge.
    const stored = storedAgenda()!;
    expect(stored.body).toBe("");
    expect(stored.generated_at).toBe("");
    expect(stored.agenda_generated_at).not.toBe("");
    expect(JSON.parse(stored.agenda_body).content[0].type).toBe("orderedList");
    expect(stored.agenda_body).toContain('"id":"s3"');
    // L'affichage de la proposition ne compte pas comme une correction.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(storedAgenda()!.agenda_edited_at).toBe("");
    // Sans correction, « Proposer » régénère sans demander.
    mocks.generateText.mockResolvedValueOnce(
      agendaOutput([{ text: "Hébergement des démos", meetingId: "s1" }]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Propose" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => {
      expect(screen.getByText(/Hébergement des démos/)).toBeTruthy();
    });
    expect(screen.queryByText(/Recette v2 : chiffrage de Marc/)).toBeNull();
  });

  it("builds the request from the thread when there is one, and keeps both", async () => {
    await saveGeneratedFolderThread("Atlas", {
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Recette en cours." }],
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "Open points" }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Hébergement des démos " },
                      {
                        type: "mention-@",
                        attrs: { id: "s1", type: "session", label: "Oct 19" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      generated: {
        status: ["Recette en cours."],
        decisions: [],
        openPoints: ["Hébergement des démos"],
        tasks: [],
      },
      coveredSessionIds: ["s1", "s2"],
      coveredUntil: "2026-10-26T09:00:00.000Z",
    });
    mocks.generateText.mockResolvedValueOnce(
      agendaOutput([{ text: "Hébergement des démos", meetingId: "s1" }]),
    );
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Propose" }));

    await waitFor(() => {
      expect(storedAgenda()?.agenda_body).toContain("Hébergement des démos");
    });
    const payload = lastPayload();
    expect(payload.thread.open_points).toEqual([
      { text: "Hébergement des démos", meetingId: "s1" },
    ]);
    expect(
      payload.meetings.map((m: { meetingId: string }) => m.meetingId),
    ).toEqual(["s3"]);
    expect(storedAgenda()?.body).toContain("Recette en cours.");
  });

  it("keeps an edited agenda and asks before replacing it", async () => {
    mocks.generateText.mockResolvedValueOnce(
      agendaOutput([{ text: "Recette v2", meetingId: "s2" }]),
    );
    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Propose" }));
    await waitFor(() => {
      expect(storedAgenda()?.agenda_body).toContain("Recette v2");
    });

    // Correction à la main, enregistrée puis retrouvée à la réouverture.
    const edited = JSON.parse(storedAgenda()!.agenda_body);
    edited.content[0].content[0].content[0].content[0].text =
      "Recette v2 : chiffrage confirmé par Marc ";
    const { saveFolderAgendaEdit } = await import("./agenda-store");
    await saveFolderAgendaEdit("Atlas", edited);
    view.unmount();
    renderPage();
    expect(
      screen.getByText(/Recette v2 : chiffrage confirmé par Marc/),
    ).toBeTruthy();
    expect(storedAgenda()?.agenda_edited_at).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Propose" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "A new proposal replaces your changes to the agenda.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(storedAgenda()?.agenda_body).toContain("chiffrage confirmé");
  });

  it("prepares the next note filed in the folder, with title, participants and agenda", async () => {
    mocks.generateText.mockResolvedValueOnce(
      agendaOutput([{ text: "Date du 27 à confirmer", meetingId: "s3" }]),
    );
    mocks.createSession.mockResolvedValue("next-session");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Propose" }));
    await waitFor(() => {
      expect(storedAgenda()?.agenda_body).toContain("Date du 27");
    });

    fireEvent.click(screen.getByRole("button", { name: "Prepare the note" }));

    await waitFor(() => {
      expect(mocks.openNew).toHaveBeenCalledWith({
        type: "sessions",
        id: "next-session",
      });
    });
    const [title, , initial] = mocks.createSession.mock.calls[0]!;
    expect(title).toBe("Point hebdo Atlas");
    expect(initial.folder_id).toBe("Atlas");
    const doc = JSON.parse(initial.raw_md);
    expect(doc.content[0]).toEqual({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Point hebdo Atlas" }],
    });
    expect(doc.content[1].content[0].text).toBe("Agenda");
    expect(doc.content[2].type).toBe("orderedList");
    expect(JSON.stringify(doc.content[2])).toContain('"id":"s3"');
    // Claire et Marc sont venus à au moins deux des trois réunions.
    expect(
      mocks.addSessionParticipant.mock.calls.map(([sessionId, humanId]) => [
        sessionId,
        humanId,
      ]),
    ).toEqual([
      ["next-session", "claire"],
      ["next-session", "marc"],
    ]);
  });

  it("shows the block and proposes the agenda when asked from Ask the note", async () => {
    mocks.generateText.mockResolvedValueOnce(
      agendaOutput([{ text: "Date du 27 à confirmer", meetingId: "s3" }]),
    );

    act(() => {
      openNextMeetingBlock("Atlas");
    });
    expect(useFolderSelection.getState().selectedPath).toBe("Atlas");
    expect(mocks.openNew).toHaveBeenCalledWith({ type: "folders" });
    expect(mocks.transitionChatMode).toHaveBeenCalledWith({ type: "CLOSE" });

    renderPage();

    await waitFor(() => {
      expect(storedAgenda()?.agenda_body).toContain("Date du 27");
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(useNextMeetingRequest.getState().folderPath).toBeNull();
    });

    // Une nouvelle demande, l'ordre du jour existant : il est montré, pas
    // remplacé.
    cleanup();
    act(() => {
      openNextMeetingBlock("Atlas");
    });
    renderPage();
    await waitFor(() => {
      expect(useNextMeetingRequest.getState().folderPath).toBeNull();
    });
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });
});
