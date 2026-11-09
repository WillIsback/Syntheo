import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const settings = vi.hoisted(() => ({
  values: {} as Record<string, string>,
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: () =>
    Promise.resolve({
      values: { ...settings.values },
      hasValues: new Set(Object.keys(settings.values)),
    }),
  setSettingValue: (key: string, value: string) => {
    settings.values[key] = value;
    return Promise.resolve();
  },
  updateSettingValue: () => Promise.resolve(),
  useStoredSettingValue: () => ({ value: undefined, hasValue: false }),
}));

import { buildAutomationChatTools } from "./automations";

import {
  confirmAdvancedStep,
  rejectAdvancedStep,
  useAdvancedStepProposals,
} from "~/automations/chat-proposals";
import { useAutomationSelection } from "~/automations/selection";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
  parseAutomationWorkflows,
  serializeAutomationWorkflows,
} from "~/automations/workflows";
import { useChatContext } from "~/chat/state/chat-context";

const tools = buildAutomationChatTools();
type ToolName = keyof typeof tools;

async function call(name: ToolName, input: unknown): Promise<any> {
  const definition = tools[name] as unknown as {
    inputSchema: z.ZodType;
    execute: (input: unknown, options: unknown) => Promise<unknown>;
  };
  const parsed = definition.inputSchema.parse(input);
  return definition.execute(parsed, { toolCallId: "call", messages: [] });
}

function stored(): AutomationWorkflow[] {
  return parseAutomationWorkflows(settings.values.automation_workflows);
}

function seed(workflows: AutomationWorkflow[]) {
  settings.values.automation_workflows =
    serializeAutomationWorkflows(workflows);
}

const EXTRACT_TASKS = {
  name: "Extraire les tâches",
  trigger: "note_enhanced",
  steps: [
    {
      type: "generate_text",
      id: "tasks",
      outputName: "Tâches",
      prompt: "Liste les tâches de cette synthèse : {{summary}}",
    },
    {
      type: "vault_write",
      folder: "Tâches",
      title: "Tâches – {{title}}",
      content: "{{step:tasks}}",
    },
  ],
};

describe("automation chat tools", () => {
  beforeEach(() => {
    settings.values = {};
    useAdvancedStepProposals.setState({ proposals: [] });
    useAutomationSelection.setState({
      selection: null,
      draftIds: [],
      chatBySelection: {},
    });
    useChatContext.setState({
      chatByScope: {
        general: { groupId: undefined, sessionId: "general" },
        automations: { groupId: "group-1", sessionId: "session-1" },
      },
    });
  });

  it("creates the requested automation as a disabled draft and opens it", async () => {
    const result = await call("create_automation", EXTRACT_TASKS);

    expect(result.status).toBe("ok");
    const [workflow] = stored();
    expect(workflow).toMatchObject({
      title: "Extraire les tâches",
      trigger: "note_enhanced",
      enabled: false,
      chatGroupId: "group-1",
      steps: [
        { id: "tasks", type: "generate_text", outputName: "Tâches" },
        { type: "vault_write", content: "{{step:tasks}}", mode: "create" },
      ],
    });
    // L'éditeur s'ouvre sur l'automatisation, sans changer de fil de chat.
    expect(useAutomationSelection.getState().selection).toEqual({
      kind: "workflow",
      workflowId: workflow!.id,
    });
    expect(useChatContext.getState().chatByScope.automations.sessionId).toBe(
      "session-1",
    );
    expect(result.automation.ready).toBe(true);
    expect(result.message).toMatch(/only the user saves and enables it/);
  });

  it("fills the empty automation open in the editor", async () => {
    seed([createEmptyWorkflow({ id: "draft-1" })]);
    useAutomationSelection.setState({
      selection: { kind: "draft", draftId: "draft-1" },
    });

    await call("create_automation", EXTRACT_TASKS);

    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ id: "draft-1", steps: [{}, {}] });
  });

  it("never enables, and turns an enabled automation back into a draft", async () => {
    seed([
      createEmptyWorkflow({
        id: "wf-1",
        enabled: true,
        trigger: "meeting_completed",
        steps: [{ id: "export", type: "markdown_export", directory: "/out" }],
      }),
    ]);
    useAutomationSelection.setState({
      selection: { kind: "workflow", workflowId: "wf-1" },
    });

    const result = await call("add_automation_step", {
      step: { type: "notification", title: "Exporté" },
    });

    expect(result.status).toBe("ok");
    expect(result.message).toMatch(/now disabled/);
    expect(stored()[0]).toMatchObject({
      enabled: false,
      steps: [{ id: "export" }, { type: "notification", title: "Exporté" }],
    });

    await call("update_automation", { name: "Export" });
    expect(stored()[0]!.enabled).toBe(false);
  });

  it("only proposes an advanced step; the user's confirmation adds it", async () => {
    await call("create_automation", EXTRACT_TASKS);
    const result = await call("add_automation_step", {
      step: {
        type: "webhook",
        url: "https://n8n.local/webhook/syntheo",
        body: '{"tasks": "{{step:tasks}}"}',
      },
    });

    expect(result.status).toBe("ok");
    expect(result.message).toMatch(/were NOT added/);
    expect(stored()[0]!.steps.map((step) => step.type)).toEqual([
      "generate_text",
      "vault_write",
    ]);
    const [proposal] = useAdvancedStepProposals.getState().proposals;
    expect(proposal).toMatchObject({
      workflowId: stored()[0]!.id,
      index: 2,
      step: { type: "webhook", url: "https://n8n.local/webhook/syntheo" },
    });
    expect(result.automation.waiting_for_user_confirmation).toEqual([
      { type: "webhook", number: 4 },
    ]);

    await confirmAdvancedStep(proposal!.id);

    expect(stored()[0]!.steps.map((step) => step.type)).toEqual([
      "generate_text",
      "vault_write",
      "webhook",
    ]);
    expect(stored()[0]!.enabled).toBe(false);
    expect(useAdvancedStepProposals.getState().proposals).toEqual([]);
  });

  it("keeps advanced steps out of a created automation until confirmed", async () => {
    await call("create_automation", {
      trigger: "meeting_completed",
      steps: [
        { type: "markdown_export" },
        { type: "command", program: "/usr/local/bin/archive", args: ["x"] },
      ],
    });

    expect(stored()[0]!.steps.map((step) => step.type)).toEqual([
      "markdown_export",
    ]);
    const [proposal] = useAdvancedStepProposals.getState().proposals;
    rejectAdvancedStep(proposal!.id);
    expect(useAdvancedStepProposals.getState().proposals).toEqual([]);
    expect(stored()[0]!.steps).toHaveLength(1);
  });

  it("asks for confirmation again when a step becomes advanced", async () => {
    await call("create_automation", EXTRACT_TASKS);
    const writeId = stored()[0]!.steps[1]!.id;

    await call("update_automation_step", {
      step_id: writeId,
      step: { type: "command", program: "/bin/notify-send" },
    });

    expect(stored()[0]!.steps[1]!.type).toBe("vault_write");
    expect(useAdvancedStepProposals.getState().proposals[0]).toMatchObject({
      replacesStepId: writeId,
      step: { id: writeId, type: "command" },
    });
  });

  it("edits, moves and removes steps, with clear errors", async () => {
    await call("create_automation", EXTRACT_TASKS);
    const writeId = stored()[0]!.steps[1]!.id;

    const moved = await call("move_automation_step", {
      step_id: writeId,
      position: 2,
    });
    expect(moved).toEqual({
      status: "error",
      message: expect.stringContaining("breaks a reused result"),
    });

    const updated = await call("update_automation_step", {
      step_id: "tasks",
      step: { type: "generate_text", prompt: "Résume : {{transcript}}" },
    });
    expect(updated.status).toBe("ok");
    expect(stored()[0]!.steps[0]).toMatchObject({
      id: "tasks",
      prompt: "Résume : {{transcript}}",
    });

    expect(await call("remove_automation_step", { step_id: "nope" })).toEqual({
      status: "error",
      message: expect.stringContaining("No step with id"),
    });
    await call("remove_automation_step", { step_id: writeId });
    expect(stored()[0]!.steps.map((step) => step.id)).toEqual(["tasks"]);

    expect(
      await call("add_automation_step", {
        step: { type: "clipboard", content: "{{email}}" },
      }),
    ).toEqual({
      status: "error",
      message: expect.stringContaining("Unknown variable {{email}}"),
    });
    expect(
      await call("add_automation_step", {
        step: { type: "clipboard", id: "tasks", content: "{{summary}}" },
      }),
    ).toEqual({
      status: "error",
      message: expect.stringContaining("already used"),
    });
  });

  it("refuses to overwrite an automation that already has steps", async () => {
    await call("create_automation", EXTRACT_TASKS);
    const result = await call("create_automation", EXTRACT_TASKS);
    expect(result.status).toBe("error");
    expect(stored()).toHaveLength(1);
  });

  it("reads the open automation, or says none is open", async () => {
    expect(await call("get_automation", {})).toMatchObject({ status: "none" });
    await call("create_automation", EXTRACT_TASKS);
    const result = await call("get_automation", {});
    expect(result.automation.steps[0]).toMatchObject({
      number: 2,
      id: "tasks",
      type: "generate_text",
      result: "{{step:tasks}}",
    });
  });

  it("rejects unknown step types and self-confirmed advanced steps", () => {
    const schema = tools.add_automation_step
      .inputSchema as unknown as z.ZodType;
    expect(
      schema.safeParse({ step: { type: "send_email", to: "a@b.c" } }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        step: { type: "webhook", url: "https://x.local" },
        confirmed: true,
      }).success,
    ).toBe(false);
    const create = tools.create_automation.inputSchema as unknown as z.ZodType;
    expect(create.safeParse({ trigger: "every_hour", steps: [] }).success).toBe(
      false,
    );
    expect(
      create.safeParse({ trigger: "manual", steps: [], enabled: true }).success,
    ).toBe(false);
  });
});
