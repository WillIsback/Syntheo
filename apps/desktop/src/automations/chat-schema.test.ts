import { i18n } from "@lingui/core";
import { describe, expect, it } from "vitest";

import { buildAutomationSystemPrompt } from "./chat-prompt";
import {
  STEP_INPUT_SCHEMAS,
  stepFromInput,
  stepInputSchema,
  variableErrors,
} from "./chat-schema";
import { WORKFLOW_STEP_TYPES } from "./steps";
import { WORKFLOW_TRIGGERS } from "./workflows";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

describe("automation chat step schemas", () => {
  it("describes every step type of the registry", () => {
    expect(Object.keys(STEP_INPUT_SCHEMAS).sort()).toEqual(
      [...WORKFLOW_STEP_TYPES].sort(),
    );
    for (const type of WORKFLOW_STEP_TYPES) {
      expect(
        stepInputSchema.safeParse({ ...minimalInput(type), type }).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown step type", () => {
    const result = stepInputSchema.safeParse({
      type: "send_email",
      to: "boss@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields, such as a self-granted confirmation", () => {
    expect(
      stepInputSchema.safeParse({
        type: "webhook",
        url: "https://n8n.local/hook",
        confirmed: true,
      }).success,
    ).toBe(false);
    expect(
      stepInputSchema.safeParse({ type: "generate_text", prompt: "  " })
        .success,
    ).toBe(false);
    expect(stepInputSchema.safeParse({ type: "notification" }).success).toBe(
      false,
    );
  });

  it("builds registry steps with their defaults", () => {
    expect(
      stepFromInput(
        { type: "vault_write", title: "Tasks", content: "{{summary}}" },
        "write",
      ),
    ).toEqual({
      id: "write",
      type: "vault_write",
      folder: "",
      title: "Tasks",
      content: "{{summary}}",
      mode: "create",
    });
    const exported = stepFromInput(
      { type: "markdown_export", include_transcript: false },
      "export",
    );
    expect(exported).toMatchObject({
      type: "markdown_export",
      directory: "",
      options: { include_transcript: false, include_summary: true },
    });
    expect(exported).not.toHaveProperty("include_transcript");
    expect(
      stepFromInput(
        { type: "generate_text", prompt: "Tasks", outputName: "Tasks" },
        "tasks",
      ),
    ).toEqual({
      id: "tasks",
      type: "generate_text",
      prompt: "Tasks",
      outputName: "Tasks",
    });
  });

  it("reports unknown variables and results used before they exist", () => {
    const write = stepFromInput(
      { type: "clipboard", content: "{{step:tasks}} {{email}}" },
      "copy",
    );
    const tasks = stepFromInput(
      { type: "generate_text", prompt: "{{summary}}" },
      "tasks",
    );
    expect(variableErrors([tasks, write])).toEqual([
      expect.stringContaining("Unknown variable {{email}}"),
    ]);
    expect(variableErrors([write, tasks])).toEqual([
      expect.stringContaining("Unknown variable {{email}}"),
      expect.stringContaining("uses {{step:tasks}}"),
    ]);
  });
});

describe("automation chat system prompt", () => {
  it("lists the triggers and actions of the registry, and asks to clarify", () => {
    const prompt = buildAutomationSystemPrompt("fr");
    for (const type of WORKFLOW_STEP_TYPES) {
      expect(prompt).toContain(`- ${type}:`);
    }
    for (const trigger of WORKFLOW_TRIGGERS) {
      expect(prompt).toContain(`- ${trigger}:`);
    }
    expect(prompt).toMatch(/ambiguous[^\n]*clarification question/);
    expect(prompt).toMatch(/Never invent an action/);
    expect(prompt).toMatch(/cannot send e-mails/);
    expect(prompt).toMatch(/- webhook:[^\n]*ADVANCED/);
    expect(prompt).toMatch(/- command:[^\n]*ADVANCED/);
    expect(prompt).not.toMatch(/- generate_text:[^\n]*ADVANCED/);
  });

  // Issue 529 : le chat citait « Confirmer » et « Save & enable ». La
  // consigne reprend les libellés traduits des vrais boutons de l'éditeur.
  it("quotes the translated labels of the editor buttons", () => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
    try {
      const prompt = buildAutomationSystemPrompt("fr");
      expect(prompt).toContain("« Ajouter l'étape »");
      expect(prompt).toContain("« Enregistrer et activer »");
      expect(prompt).not.toContain("Save & enable");
      expect(prompt).not.toMatch(/Confirm/);
    } finally {
      i18n.activate("en");
    }
  });
});

function minimalInput(type: (typeof WORKFLOW_STEP_TYPES)[number]) {
  switch (type) {
    case "markdown_export":
      return {};
    case "generate_text":
      return { prompt: "List the tasks" };
    case "vault_write":
      return { title: "Tasks", content: "{{summary}}" };
    case "clipboard":
      return { content: "{{summary}}" };
    case "notification":
      return { title: "Done" };
    case "webhook":
      return { url: "https://n8n.local/hook" };
    case "command":
      return { program: "/usr/local/bin/archive" };
  }
}
