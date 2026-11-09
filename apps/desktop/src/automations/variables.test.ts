import { describe, expect, it, vi } from "vitest";

import { AUTOMATION_TEMPLATES, availableTemplates } from "./templates";
import {
  availableVariables,
  BASE_VARIABLES,
  createWorkflowVariables,
  parseVariableTokens,
} from "./variables";
import { createEmptyWorkflow } from "./workflows";

describe("reusable outputs", () => {
  const workflow = createEmptyWorkflow({
    steps: [
      { id: "export-a", type: "markdown_export", directory: "/a" },
      { id: "export-b", type: "markdown_export", directory: "/b" },
    ],
  });

  it("offers the base variables from step 1", () => {
    expect(availableVariables(workflow, 0)).toEqual(
      BASE_VARIABLES.map((name) => ({
        kind: "base",
        name,
        token: `{{${name}}}`,
      })),
    );
    expect(BASE_VARIABLES).toEqual([
      "summary",
      "notes",
      "transcript",
      "title",
      "date",
    ]);
  });

  it("adds the outputs of earlier actions only, numbered in run order", () => {
    const outputs = availableVariables(workflow, 1).filter(
      (variable) => variable.kind === "output",
    );
    expect(outputs).toEqual([
      {
        kind: "output",
        stepId: "export-a",
        stepType: "markdown_export",
        stepNumber: 2,
        outputKind: "file",
        outputName: undefined,
        token: "{{step:export-a}}",
      },
    ]);
    expect(
      availableVariables(workflow, 2).filter((v) => v.kind === "output"),
    ).toHaveLength(2);
  });

  it("loads each base variable once and renders published outputs", async () => {
    const load = vi.fn(async (_sessionId: string, name: string) =>
      name === "title" ? "Planning" : `<${name}>`,
    );
    const variables = createWorkflowVariables("session-1", load);
    variables.publish("export-a", "/a/Planning.md");

    await expect(
      variables.render(
        "{{title}} {{ title }} {{summary}} → {{step:export-a}} {{step:later}} {{unknown}}",
      ),
    ).resolves.toBe(
      "Planning Planning <summary> → /a/Planning.md {{step:later}} {{unknown}}",
    );
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledWith("session-1", "title");
  });

  it("parses tokens back into references", () => {
    expect(parseVariableTokens("{{notes}} {{step:abc-1}} {{nope}}")).toEqual([
      { kind: "base", name: "notes" },
      { kind: "output", stepId: "abc-1" },
    ]);
  });
});

describe("templates", () => {
  it("offers the Markdown export and the task extraction now that its actions exist", () => {
    expect(AUTOMATION_TEMPLATES.map((template) => template.id)).toEqual([
      "markdown-export",
      "extract-tasks",
    ]);
    expect(availableTemplates().map((template) => template.id)).toEqual([
      "markdown-export",
      "extract-tasks",
    ]);
  });

  it("never offers an e-mail template", () => {
    expect(
      AUTOMATION_TEMPLATES.some((template) => /mail/i.test(template.id)),
    ).toBe(false);
  });
});
