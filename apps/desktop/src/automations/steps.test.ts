import { describe, expect, it } from "vitest";

import {
  createWorkflowStep,
  isWorkflowStepReady,
  parseWorkflowStep,
  STEP_DEFINITIONS,
  WORKFLOW_STEP_TYPES,
  type WorkflowStep,
} from "./steps";
import { parseWebhookUrl } from "./webhook";

// Validation de chaque action : une étape neuve n'est jamais prête, une
// étape remplie l'est, et la lecture d'une étape enregistrée la retrouve.

const filled: WorkflowStep[] = [
  { id: "a", type: "generate_text", prompt: "Tasks from {{summary}}" },
  {
    id: "b",
    type: "vault_write",
    folder: "",
    title: "{{title}}",
    content: "{{step:a}}",
    mode: "append",
  },
  { id: "c", type: "clipboard", content: "{{step:a}}" },
  { id: "d", type: "notification", title: "", message: "Done" },
  {
    id: "e",
    type: "webhook",
    url: "https://n8n.local/hook",
    body: '{"text": "{{step:a}}", "n": 1}',
  },
  { id: "f", type: "command", program: "notify-send", args: ["{{title}}"] },
];

describe("action validation", () => {
  it("offers seven actions, two of them advanced", () => {
    expect(WORKFLOW_STEP_TYPES).toEqual([
      "markdown_export",
      "generate_text",
      "vault_write",
      "clipboard",
      "notification",
      "webhook",
      "command",
    ]);
    expect(
      WORKFLOW_STEP_TYPES.filter((type) => STEP_DEFINITIONS[type].advanced),
    ).toEqual(["webhook", "command"]);
  });

  it.each(WORKFLOW_STEP_TYPES)("a new %s step needs setup", (type) => {
    expect(isWorkflowStepReady(createWorkflowStep(type))).toBe(false);
  });

  it.each(filled.map((step) => [step.type, step] as const))(
    "a filled %s step is ready and survives a round trip",
    (_type, step) => {
      expect(isWorkflowStepReady(step)).toBe(true);
      expect(parseWorkflowStep(JSON.parse(JSON.stringify(step)))).toEqual(step);
    },
  );

  it("publishes text for the generation and the command only", () => {
    expect(
      WORKFLOW_STEP_TYPES.filter(
        (type) => STEP_DEFINITIONS[type].output === "text",
      ),
    ).toEqual(["generate_text", "command"]);
  });

  it("requires an http(s) address and a JSON body for the webhook", () => {
    const webhook = filled[4] as Extract<WorkflowStep, { type: "webhook" }>;
    for (const url of [
      "ftp://host/x",
      "javascript:alert(1)",
      "http://user:secret@host/x",
      "localhost:5678",
    ]) {
      expect(parseWebhookUrl(url)).toBeNull();
      expect(isWorkflowStepReady({ ...webhook, url })).toBe(false);
    }
    expect(isWorkflowStepReady({ ...webhook, body: "{{summary}}" })).toBe(
      false,
    );
    expect(isWorkflowStepReady({ ...webhook, body: "{oops" })).toBe(false);
  });

  it("reads malformed saved fields as empty values", () => {
    expect(
      parseWorkflowStep({
        id: "x",
        type: "command",
        program: 3,
        args: [1, "a"],
      }),
    ).toEqual({ id: "x", type: "command", program: "", args: ["a"] });
    expect(
      parseWorkflowStep({ id: "x", type: "vault_write", mode: "replace" }),
    ).toMatchObject({ mode: "create", title: "", content: "" });
  });
});
