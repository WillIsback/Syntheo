import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@iconify-icon/react", () => ({
  Icon: (props: Record<string, unknown>) =>
    createElement("iconify-icon", props),
}));

import { Dialog } from "@syntheo/ui/components/ui/dialog";
import { Select, SelectContent } from "@syntheo/ui/components/ui/select";

import { StepTypeItems } from "./add-step-menu";
import {
  renderVariableText,
  serializeVariableText,
  VariableField,
} from "./variable-field";
import { WorkflowBuilder } from "./workflow-builder";

import { CommandConfirmationContent } from "~/automations/command-confirmation-dialog";
import { useAutomationLabels } from "~/automations/labels";
import { availableVariables } from "~/automations/variables";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
} from "~/automations/workflows";

afterEach(cleanup);

const chain = createEmptyWorkflow({
  id: "wf",
  trigger: "note_enhanced",
  steps: [
    { id: "gen", type: "generate_text", prompt: "Tasks from {{summary}}" },
    {
      id: "vault",
      type: "vault_write",
      folder: "Tasks",
      title: "{{title}}",
      content: "",
      mode: "create",
    },
  ],
});

function Builder({ onChange }: { onChange: (w: AutomationWorkflow) => void }) {
  const [workflow, setWorkflow] = useState(chain);
  return (
    <WorkflowBuilder
      workflow={workflow}
      onChange={(next) => {
        setWorkflow(next);
        onChange(next);
      }}
    />
  );
}

describe("variable field", () => {
  it("shows tokens as chips and serializes them back", () => {
    const element = document.createElement("div");
    renderVariableText(
      element,
      "From {{summary}}:\n{{step:gen}}!",
      (token) => ({
        label: token === "{{summary}}" ? "Summary" : "Generated text",
        known: true,
      }),
    );
    expect(element.textContent).toBe("From Summary:\nGenerated text!");
    expect(serializeVariableText(element)).toBe(
      "From {{summary}}:\n{{step:gen}}!",
    );
  });

  it("inserts a chip for the clicked variable", () => {
    const onChange = vi.fn();
    function Field() {
      const labels = useAutomationLabels();
      return (
        <VariableField
          ariaLabel="Content"
          value="Tasks: "
          onChange={onChange}
          variables={availableVariables(chain, 1)}
          labels={labels}
        />
      );
    }
    render(<Field />);
    fireEvent.click(screen.getByRole("button", { name: "+ Generated text" }));
    expect(onChange).toHaveBeenCalledWith("Tasks: {{step:gen}} ");
  });
});

describe("workflow editor", () => {
  it("chains Generate then Write to the vault, offering only earlier outputs", () => {
    const onChange = vi.fn();
    render(<Builder onChange={onChange} />);

    expect(
      screen.getAllByText("Generate with the local model"),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("Write to the vault")).not.toHaveLength(0);
    const instruction = screen.getByRole("textbox", { name: "Instruction" });
    expect(instruction.textContent).toBe("Tasks from Summary");
    // L'étape 2 ne voit pas sa propre sortie, l'étape 3 la voit.
    const insertGenerated = screen.getAllByRole("button", {
      name: "+ Generated text",
    });
    expect(insertGenerated).toHaveLength(3);

    fireEvent.click(insertGenerated[2]!);
    const saved = onChange.mock.lastCall![0] as AutomationWorkflow;
    expect(saved.steps[1]).toMatchObject({ content: "{{step:gen}} " });
  });

  it("flags the webhook as the step that leaves the computer", () => {
    const workflow = createEmptyWorkflow({
      steps: [{ id: "w", type: "webhook", url: "ftp://x", body: "{}" }],
    });
    render(<WorkflowBuilder workflow={workflow} onChange={vi.fn()} />);
    expect(document.querySelector("[data-leaves-computer]")).toBeTruthy();
    expect(
      screen.getByText("Use an http:// or https:// address."),
    ).toBeTruthy();
  });

  it("groups the advanced actions under Advanced in the add menu", () => {
    function Menu() {
      const labels = useAutomationLabels();
      return (
        <Select open value="">
          <SelectContent>
            <StepTypeItems labels={labels} withDescriptions />
          </SelectContent>
        </Select>
      );
    }
    render(<Menu />);
    const types = Array.from(document.querySelectorAll("[data-step-type]")).map(
      (item) => item.getAttribute("data-step-type"),
    );
    expect(types).toEqual([
      "markdown_export",
      "generate_text",
      "vault_write",
      "clipboard",
      "notification",
      "webhook",
      "command",
    ]);
    expect(screen.getByText("Advanced")).toBeTruthy();
    expect(screen.queryByText(/e-mail|email/i)).toBeNull();
  });
});

describe("command confirmation", () => {
  it("shows the program and each argument, then answers", () => {
    const onAnswer = vi.fn();
    render(
      <Dialog open>
        <CommandConfirmationContent
          pending={{
            program: "/usr/bin/publish",
            args: ["--file", "/exports/Planning.md"],
            workflowTitle: "Publish",
          }}
          onAnswer={onAnswer}
        />
      </Dialog>,
    );
    expect(screen.getByText("/usr/bin/publish")).toBeTruthy();
    expect(screen.getByText("/exports/Planning.md")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Do not run" }));
    fireEvent.click(screen.getByRole("button", { name: "Allow and run" }));
    expect(onAnswer.mock.calls).toEqual([[false], [true]]);
  });
});
