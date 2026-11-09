import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  setSettingValue: vi.fn(),
  exportMeetingMarkdown: vi.fn(),
}));

vi.mock("@syntheo/plugin-local-api", () => ({
  commands: { exportMeetingMarkdown: mocks.exportMeetingMarkdown },
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: async () => ({
    values: { ...mocks.store },
    hasValues: new Set(Object.keys(mocks.store)),
  }),
  setSettingValue: mocks.setSettingValue,
  setSettingValues: async (values: Record<string, unknown>) => {
    Object.assign(mocks.store, values);
  },
}));

vi.mock("~/db", () => ({ useLiveQuery: vi.fn() }));
vi.mock("~/stt/contexts", () => ({ useListener: vi.fn() }));

import { setBaseVariableLoaderForTests, testWorkflowOnNote } from "./engine";
import { setStepEffectsForTests } from "./step-effects";
import { stepsWithRealEffects } from "./steps";
import {
  defaultTestNoteId,
  filterTestNotes,
  mapTestNoteRows,
} from "./test-notes";
import { createEmptyWorkflow } from "./workflows";

// Tester une automatisation sur une note : elle s'exécute telle qu'elle est
// éditée, sans rien enregistrer sur l'automatisation.

const effects = {
  generateText: vi.fn(),
  writeVaultNote: vi.fn(),
  notify: vi.fn(),
  postJson: vi.fn(),
};

const draft = createEmptyWorkflow({
  id: "wf",
  title: "Tasks",
  trigger: "note_enhanced",
  steps: [
    { id: "gen", type: "generate_text", prompt: "Tasks from {{summary}}" },
    {
      id: "vault",
      type: "vault_write",
      folder: "Tasks",
      title: "{{title}}",
      content: "{{step:gen}}",
      mode: "create",
    },
    { id: "notify", type: "notification", title: "Done", message: "" },
  ],
});

beforeEach(() => {
  mocks.store = {};
  mocks.setSettingValue.mockReset();
  mocks.setSettingValue.mockImplementation(async (key: string, value) => {
    mocks.store[key] = value;
  });
  mocks.exportMeetingMarkdown.mockReset();
  Object.values(effects).forEach((effect) => effect.mockReset());
  setStepEffectsForTests(effects);
  setBaseVariableLoaderForTests(async (_sessionId, name) =>
    name === "title" ? "Planning" : "the summary",
  );
});

afterEach(() => {
  setStepEffectsForTests(null);
});

describe("testing an automation on a note", () => {
  it("runs a workflow that was never saved, step by step", async () => {
    effects.generateText.mockResolvedValue("- send the deck");
    effects.writeVaultNote.mockResolvedValue({
      sessionId: "note-2",
      created: true,
    });

    const result = await testWorkflowOnNote(draft, "session-1");

    expect(result.status).toBe("success");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.steps).toEqual([
      expect.objectContaining({
        stepId: "gen",
        status: "success",
        output: "- send the deck",
        simulated: false,
      }),
      expect.objectContaining({
        stepId: "vault",
        status: "success",
        artifact: { kind: "note", sessionId: "note-2", title: "Planning" },
      }),
      expect.objectContaining({ stepId: "notify", status: "success" }),
    ]);
    expect(effects.writeVaultNote).toHaveBeenCalledWith({
      folder: "Tasks",
      title: "Planning",
      content: "- send the deck",
      mode: "create",
    });
    expect(effects.notify).toHaveBeenCalledWith("Done", "");
    // Rien n'est enregistré : l'automatisation n'existe pas dans les réglages.
    expect(mocks.store.automation_workflows).toBeUndefined();
  });

  it("stops at the first failing step and marks the next ones as not run", async () => {
    effects.generateText.mockRejectedValue(new Error("connection refused"));

    const result = await testWorkflowOnNote(draft, "session-1");

    expect(result.status).toBe("error");
    expect(result.steps.map((step) => step.status)).toEqual([
      "error",
      "skipped",
      "skipped",
    ]);
    expect(result.steps[0]?.detail).toContain("connection refused");
    expect(effects.writeVaultNote).not.toHaveBeenCalled();
    expect(effects.notify).not.toHaveBeenCalled();
  });

  it("leaves the saved workflow's last run and processed notes untouched", async () => {
    const lastRun = {
      at: "2026-11-01T09:00:00.000Z",
      status: "success" as const,
      detail: "ok",
    };
    const saved = { ...draft, lastRun, processedSessionIds: ["session-0"] };
    const stored = JSON.stringify([saved]);
    mocks.store = { automation_workflows: stored };
    effects.generateText.mockResolvedValue("- edited");
    effects.writeVaultNote.mockResolvedValue({ sessionId: "n", created: true });

    // L'éditeur teste une version modifiée, pas encore enregistrée.
    const edited = {
      ...saved,
      steps: saved.steps.filter((step) => step.id !== "notify"),
    };
    const result = await testWorkflowOnNote(edited, "session-1");

    expect(result.steps).toHaveLength(2);
    expect(effects.notify).not.toHaveBeenCalled();
    expect(mocks.store.automation_workflows).toBe(stored);
    expect(mocks.setSettingValue).not.toHaveBeenCalledWith(
      "automation_workflows",
      expect.anything(),
    );
  });

  it("returns the exported file so the test can open it", async () => {
    mocks.exportMeetingMarkdown.mockResolvedValue({
      status: "ok",
      data: { path: "/exports/Planning.md", sha256: "hash" },
    });
    const exporter = createEmptyWorkflow({
      id: "export",
      steps: [{ id: "md", type: "markdown_export", directory: "/exports" }],
    });

    const result = await testWorkflowOnNote(exporter, "session-1");

    expect(result.steps[0]).toMatchObject({
      status: "success",
      artifact: { kind: "file", path: "/exports/Planning.md" },
    });
  });

  it("simulates the steps with real effects when asked", async () => {
    effects.generateText.mockResolvedValue("- send the deck");

    const result = await testWorkflowOnNote(draft, "session-1", {
      simulate: true,
    });

    expect(result.status).toBe("success");
    // La génération, sans effet hors de l'application, s'exécute vraiment.
    expect(effects.generateText).toHaveBeenCalledTimes(1);
    expect(effects.writeVaultNote).not.toHaveBeenCalled();
    expect(effects.notify).not.toHaveBeenCalled();
    expect(result.steps.map((step) => step.simulated)).toEqual([
      false,
      true,
      true,
    ]);
    expect(result.steps[1]?.artifact).toBeUndefined();
  });
});

describe("real effects warning", () => {
  it("lists the actions that act outside Syntheo, with their step number", () => {
    const steps = [
      ...draft.steps,
      { id: "hook", type: "webhook" as const, url: "http://x", body: "{}" },
      { id: "cmd", type: "command" as const, program: "notify", args: [] },
      { id: "copy", type: "clipboard" as const, content: "x" },
      { id: "md", type: "markdown_export" as const, directory: "/exports" },
    ];

    expect(
      stepsWithRealEffects(steps).map(({ number, effect }) => [number, effect]),
    ).toEqual([
      [3, "vault"],
      [4, "notification"],
      [5, "webhook"],
      [6, "command"],
      [7, "clipboard"],
      [8, "file"],
    ]);
  });
});

describe("notes to test on", () => {
  const notes = mapTestNoteRows([
    { id: "a", title: "Brouillon", created_at: "3", has_transcript: 0 },
    { id: "b", title: " Réunion équipe ", created_at: "2", has_transcript: 1 },
    { id: "c", title: null, created_at: null, has_transcript: 1 },
  ]);

  it("defaults to the most recent note with a transcript", () => {
    expect(defaultTestNoteId(notes)).toBe("b");
    expect(defaultTestNoteId(notes.slice(0, 1))).toBe("a");
    expect(defaultTestNoteId([])).toBeNull();
  });

  it("searches by title, ignoring case and accents", () => {
    expect(filterTestNotes(notes, "reunion EQUIPE").map((n) => n.id)).toEqual([
      "b",
    ]);
    expect(filterTestNotes(notes, "  ")).toHaveLength(3);
  });
});
