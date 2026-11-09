import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
}));

vi.mock("@syntheo/plugin-local-api", () => ({
  commands: { exportMeetingMarkdown: vi.fn() },
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: async () => ({
    values: { ...mocks.store },
    hasValues: new Set(Object.keys(mocks.store)),
  }),
  setSettingValue: async (key: string, value: unknown) => {
    mocks.store[key] = value;
  },
  setSettingValues: async (values: Record<string, unknown>) => {
    Object.assign(mocks.store, values);
  },
}));

import { runWorkflowOnNote, setBaseVariableLoaderForTests } from "./engine";
import { resetLegacyMigrationForTests } from "./migration";
import { setStepEffectsForTests } from "./step-effects";
import { AUTOMATION_TEMPLATES, createWorkflowFromTemplate } from "./templates";
import { createEmptyWorkflow, isWorkflowReady } from "./workflows";

// Une sortie passe à l'étape suivante, et une étape en échec arrête la suite.

const effects = {
  generateText: vi.fn(),
  writeVaultNote: vi.fn(),
  notify: vi.fn(),
};

function store(workflows: unknown[]) {
  mocks.store = { automation_workflows: JSON.stringify(workflows) };
}

const chain = createEmptyWorkflow({
  id: "wf",
  title: "Tasks",
  trigger: "manual",
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
  resetLegacyMigrationForTests();
  Object.values(effects).forEach((effect) => effect.mockReset());
  setStepEffectsForTests(effects);
  setBaseVariableLoaderForTests(async (_sessionId, name) =>
    name === "title" ? "Planning" : "the summary",
  );
});

afterEach(() => {
  setStepEffectsForTests(null);
});

describe("chaining actions", () => {
  it("passes the generated text to the vault note", async () => {
    store([chain]);
    effects.generateText.mockResolvedValue("- send the deck");
    effects.writeVaultNote.mockResolvedValue({ sessionId: "n", created: true });

    const record = await runWorkflowOnNote("wf", "session-1");

    expect(effects.generateText).toHaveBeenCalledWith(
      "Tasks from the summary",
      expect.any(AbortSignal),
    );
    expect(effects.writeVaultNote).toHaveBeenCalledWith({
      folder: "Tasks",
      title: "Planning",
      content: "- send the deck",
      mode: "create",
    });
    expect(effects.notify).toHaveBeenCalledWith("Done", "");
    expect(record.status).toBe("success");
  });

  it("stops at a failing step without running the next ones", async () => {
    store([chain]);
    effects.generateText.mockRejectedValue(new Error("timeout"));

    const record = await runWorkflowOnNote("wf", "session-1");

    expect(effects.writeVaultNote).not.toHaveBeenCalled();
    expect(effects.notify).not.toHaveBeenCalled();
    expect(record).toMatchObject({
      status: "error",
      detail: "The local model did not respond: timeout",
    });
  });

  it("is not ready when an action uses the output of a later step", () => {
    const [generate, vault] = chain.steps;
    expect(isWorkflowReady(chain)).toBe(true);
    expect(isWorkflowReady({ ...chain, steps: [vault!, generate!] })).toBe(
      false,
    );
    expect(isWorkflowReady({ ...chain, steps: [vault!] })).toBe(false);
  });
});

describe("Extract tasks template", () => {
  it("creates a ready automation: summary → generate → vault note", async () => {
    const template = AUTOMATION_TEMPLATES.find(
      (item) => item.id === "extract-tasks",
    )!;
    const workflow = createWorkflowFromTemplate(template, "Extract tasks", {
      prompt: "List the tasks:",
      noteTitle: "Tasks –",
      folder: "Tasks",
    })!;

    expect(workflow.trigger).toBe("note_enhanced");
    expect(workflow.enabled).toBe(false);
    expect(isWorkflowReady(workflow)).toBe(true);
    const [generate, vault] = workflow.steps;
    expect(generate).toMatchObject({
      type: "generate_text",
      prompt: "List the tasks:\n\n{{summary}}",
    });
    expect(vault).toMatchObject({
      type: "vault_write",
      folder: "Tasks",
      title: "Tasks – {{title}}",
      content: `{{step:${generate!.id}}}`,
      mode: "create",
    });

    store([workflow]);
    effects.generateText.mockResolvedValue("- Alice: deck");
    effects.writeVaultNote.mockResolvedValue({ sessionId: "n", created: true });
    await runWorkflowOnNote(workflow.id, "session-1");
    expect(effects.writeVaultNote).toHaveBeenCalledWith({
      folder: "Tasks",
      title: "Tasks – Planning",
      content: "- Alice: deck",
      mode: "create",
    });
  });
});
