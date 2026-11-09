import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@iconify-icon/react", () => ({
  Icon: (props: Record<string, unknown>) =>
    createElement("iconify-icon", props),
}));
vi.mock("~/db", () => ({ useLiveQuery: vi.fn() }));
vi.mock("~/stt/contexts", () => ({ useListener: vi.fn() }));
vi.mock("~/store/zustand/tabs", () => ({ useTabs: vi.fn() }));
vi.mock("@syntheo/plugin-opener2", () => ({ commands: {} }));

import { type TestRun, WorkflowTestPanelView } from "./workflow-test-panel";

import type { TestNote } from "~/automations/test-notes";
import { createEmptyWorkflow } from "~/automations/workflows";

afterEach(cleanup);

const workflow = createEmptyWorkflow({
  id: "wf",
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
    { id: "md", type: "markdown_export", directory: "/exports" },
  ],
});

const notes: TestNote[] = [
  { id: "a", title: "Brouillon", createdAt: "", hasTranscript: false },
  { id: "b", title: "Point hebdo", createdAt: "", hasTranscript: true },
];

const actions = { openFile: vi.fn(), revealFile: vi.fn(), openNote: vi.fn() };

function renderPanel(
  overrides: Partial<Parameters<typeof WorkflowTestPanelView>[0]> = {},
) {
  const props = {
    workflow,
    notes,
    selectedId: "b",
    onSelect: vi.fn(),
    query: "",
    onQueryChange: vi.fn(),
    simulate: false,
    onSimulateChange: vi.fn(),
    running: false,
    testRun: null,
    onLaunch: vi.fn(),
    onClose: vi.fn(),
    artifactActions: actions,
    ...overrides,
  };
  render(<WorkflowTestPanelView {...props} />);
  return props;
}

describe("test panel before the run", () => {
  it("warns about the steps with real effects and launches on the chosen note", () => {
    const props = renderPanel();

    expect(screen.getByRole("note").textContent).toContain(
      "This is a real test",
    );
    expect(screen.getByText("3 · Write to the vault")).toBeTruthy();
    expect(screen.getByText("4 · Export as Markdown")).toBeTruthy();
    // La génération n'a pas d'effet hors de l'application.
    expect(screen.queryByText("2 · Generate with the local model")).toBeNull();
    expect(
      screen.getByRole("option", { name: /Point hebdo/ }).ariaSelected,
    ).toBe("true");

    fireEvent.click(screen.getByRole("option", { name: /Brouillon/ }));
    expect(props.onSelect).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Run the test" }));
    expect(props.onLaunch).toHaveBeenCalledTimes(1);
  });

  it("says the steps are simulated when the box is checked", () => {
    renderPanel({ simulate: true });

    expect(screen.getByRole("note").textContent).toContain(
      "These steps will be simulated",
    );
  });
});

describe("test result", () => {
  it("shows the generated text, the created file and the stop after an error", () => {
    const longText = "x".repeat(400);
    const testRun: TestRun = {
      workflow,
      note: notes[1] ?? null,
      result: {
        status: "error",
        durationMs: 4200,
        steps: [
          {
            stepId: "gen",
            status: "success",
            detail: "Generated text (400 characters)",
            output: longText,
            simulated: false,
          },
          {
            stepId: "vault",
            status: "error",
            detail: "Give the vault note a title first.",
            simulated: false,
          },
          { stepId: "md", status: "skipped", detail: "", simulated: false },
        ],
      },
    };
    renderPanel({ testRun });

    expect(screen.getByText("4.2 s")).toBeTruthy();
    expect(screen.getByText("Note “Point hebdo”")).toBeTruthy();
    expect(
      screen.getByText(/Give the vault note a title first\./),
    ).toBeTruthy();
    expect(screen.getByText(/The next steps were not run\./)).toBeTruthy();
    expect(screen.getByText("Not run")).toBeTruthy();
    // Sortie longue tronquée, dépliable.
    expect(screen.queryByText(longText)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText(longText)).toBeTruthy();
  });

  it("opens the created file or its folder", () => {
    const testRun: TestRun = {
      workflow: createEmptyWorkflow({
        id: "export",
        steps: [{ id: "md", type: "markdown_export", directory: "/exports" }],
      }),
      note: null,
      result: {
        status: "success",
        durationMs: 300,
        steps: [
          {
            stepId: "md",
            status: "success",
            detail: "/exports/Point hebdo.md",
            output: "/exports/Point hebdo.md",
            artifact: { kind: "file", path: "/exports/Point hebdo.md" },
            simulated: false,
          },
        ],
      },
    };
    renderPanel({ testRun });

    fireEvent.click(screen.getByText("/exports/Point hebdo.md"));
    expect(actions.openFile).toHaveBeenCalledWith("/exports/Point hebdo.md");
    fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(actions.revealFile).toHaveBeenCalledWith("/exports/Point hebdo.md");
  });
});
