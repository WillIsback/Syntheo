import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoLocalModelError, setStepEffectsForTests } from "./step-effects";
import { runWorkflowStep, type StepRunContext } from "./step-runners";
import { createWorkflowStep, type WorkflowStep } from "./steps";
import { createWorkflowVariables } from "./variables";
import { WEBHOOK_TIMEOUT_MS } from "./webhook";

// Chaque action avec ses dépendances simulées : rien n'est écrit, copié,
// affiché, envoyé ni lancé pour de vrai.

const effects = {
  generateText: vi.fn(),
  writeVaultNote: vi.fn(),
  copyText: vi.fn(),
  notify: vi.fn(),
  postJson: vi.fn(),
  confirmCommand: vi.fn(),
  runCommand: vi.fn(),
};

function context(overrides: Partial<StepRunContext> = {}): StepRunContext {
  const variables = createWorkflowVariables("session-1", async (_id, name) =>
    name === "title" ? "Planning" : name === "summary" ? 'Say "go"\nnow' : "",
  );
  variables.publish("gen", "- Alice: send the deck");
  return {
    sessionId: "session-1",
    workflowId: "wf",
    workflowTitle: "Tasks to the vault",
    variables,
    ...overrides,
  };
}

function step<T extends WorkflowStep["type"]>(
  type: T,
  fields: Partial<Extract<WorkflowStep, { type: T }>>,
): WorkflowStep {
  return { ...createWorkflowStep(type), id: "step", ...fields } as WorkflowStep;
}

beforeEach(() => {
  Object.values(effects).forEach((effect) => effect.mockReset());
  setStepEffectsForTests(effects);
});

afterEach(() => {
  setStepEffectsForTests(null);
  vi.useRealTimers();
});

describe("Generate with the local model", () => {
  it("sends the instruction with its variables and publishes the answer", async () => {
    effects.generateText.mockResolvedValue("  - Alice: send the deck \n");
    const result = await runWorkflowStep(
      step("generate_text", { prompt: "Tasks for {{title}}:\n{{summary}}" }),
      context(),
    );
    expect(effects.generateText).toHaveBeenCalledWith(
      'Tasks for Planning:\nSay "go"\nnow',
      expect.any(AbortSignal),
    );
    expect(result.output).toBe("- Alice: send the deck");
  });

  it("explains that no local model is configured", async () => {
    effects.generateText.mockRejectedValue(new NoLocalModelError("none"));
    await expect(
      runWorkflowStep(step("generate_text", { prompt: "x" }), context()),
    ).rejects.toThrow("No local model is configured");
  });

  it("explains that the local model did not respond", async () => {
    effects.generateText.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      runWorkflowStep(step("generate_text", { prompt: "x" }), context()),
    ).rejects.toThrow("The local model did not respond: ECONNREFUSED");
  });

  it("rejects an empty answer", async () => {
    effects.generateText.mockResolvedValue("   ");
    await expect(
      runWorkflowStep(step("generate_text", { prompt: "x" }), context()),
    ).rejects.toThrow("empty answer");
  });
});

describe("Write to the vault", () => {
  it("creates a note with its folder, title and content filled in", async () => {
    effects.writeVaultNote.mockResolvedValue({ sessionId: "n", created: true });
    const result = await runWorkflowStep(
      step("vault_write", {
        folder: "Tasks",
        title: "Tasks – {{title}}",
        content: "{{step:gen}}",
      }),
      context(),
    );
    expect(effects.writeVaultNote).toHaveBeenCalledWith({
      folder: "Tasks",
      title: "Tasks – Planning",
      content: "- Alice: send the deck",
      mode: "create",
    });
    expect(result.detail).toBe("Note created: Tasks – Planning");
  });

  it("completes the note with the same title", async () => {
    effects.writeVaultNote.mockResolvedValue({
      sessionId: "n",
      created: false,
    });
    const result = await runWorkflowStep(
      step("vault_write", { title: "Log", content: "x", mode: "append" }),
      context(),
    );
    expect(effects.writeVaultNote.mock.calls[0]![0].mode).toBe("append");
    expect(result.detail).toBe("Note completed: Log");
  });

  it("writes nothing when run dry", async () => {
    await runWorkflowStep(
      step("vault_write", { title: "Log", content: "x" }),
      context({ dryRun: true }),
    );
    expect(effects.writeVaultNote).not.toHaveBeenCalled();
  });
});

describe("Clipboard and notification", () => {
  it("copies the rendered content", async () => {
    await runWorkflowStep(
      step("clipboard", { content: "{{title}}: {{step:gen}}" }),
      context(),
    );
    expect(effects.copyText).toHaveBeenCalledWith(
      "Planning: - Alice: send the deck",
    );
  });

  it("shows a system notification with its title and text", async () => {
    await runWorkflowStep(
      step("notification", { title: "{{title}}", message: "Tasks are ready" }),
      context(),
    );
    expect(effects.notify).toHaveBeenCalledWith("Planning", "Tasks are ready");
  });

  it("does nothing when run dry", async () => {
    const dry = context({ dryRun: true });
    await runWorkflowStep(step("clipboard", { content: "x" }), dry);
    await runWorkflowStep(step("notification", { title: "x" }), dry);
    expect(effects.copyText).not.toHaveBeenCalled();
    expect(effects.notify).not.toHaveBeenCalled();
  });
});

describe("Webhook", () => {
  const webhook = (fields: { url?: string; body?: string } = {}) =>
    step("webhook", {
      url: "http://localhost:5678/hook",
      body: '{"title": "{{title}}", "summary": "{{summary}}"}',
      ...fields,
    });

  it("posts valid JSON with the variables escaped", async () => {
    effects.postJson.mockResolvedValue({ status: 200, location: null });
    const result = await runWorkflowStep(webhook(), context());
    const [url, body] = effects.postJson.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:5678/hook");
    expect(JSON.parse(body)).toEqual({
      title: "Planning",
      summary: 'Say "go"\nnow',
    });
    expect(result.detail).toBe("Sent to localhost:5678 (status 200)");
  });

  it.each(["ftp://example.org/x", "file:///etc/passwd", "not a url", ""])(
    "refuses the address %j",
    async (url) => {
      await expect(
        runWorkflowStep(webhook({ url }), context()),
      ).rejects.toThrow("Invalid address");
      expect(effects.postJson).not.toHaveBeenCalled();
    },
  );

  it("refuses a body that is not JSON", async () => {
    await expect(
      runWorkflowStep(webhook({ body: "{{summary}}" }), context()),
    ).rejects.toThrow("not valid");
  });

  it("stops after the timeout", async () => {
    vi.useFakeTimers();
    effects.postJson.mockImplementation(() => new Promise(() => {}));
    const run = runWorkflowStep(webhook(), context());
    const outcome = expect(run).rejects.toThrow(
      "did not answer within 15 seconds",
    );
    await vi.advanceTimersByTimeAsync(WEBHOOK_TIMEOUT_MS);
    await outcome;
    expect(effects.postJson.mock.calls[0]![2].aborted).toBe(true);
  });

  it("says where a redirect leads instead of following it", async () => {
    effects.postJson.mockResolvedValue({
      status: 302,
      location: "https://elsewhere.example/hook",
    });
    await expect(runWorkflowStep(webhook(), context())).rejects.toThrow(
      "redirects to https://elsewhere.example/hook",
    );
  });

  it("reports an error status", async () => {
    effects.postJson.mockResolvedValue({ status: 500, location: null });
    await expect(runWorkflowStep(webhook(), context())).rejects.toThrow(
      "status 500",
    );
  });

  it("sends nothing when run dry", async () => {
    await runWorkflowStep(webhook(), context({ dryRun: true }));
    expect(effects.postJson).not.toHaveBeenCalled();
  });
});

describe("Run a command", () => {
  const command = step("command", {
    program: " /usr/bin/publish ",
    args: ["--file", "{{step:gen}}"],
  });

  it("asks for confirmation of the command as typed, then runs it", async () => {
    effects.confirmCommand.mockResolvedValue(true);
    effects.runCommand.mockResolvedValue({
      exit_code: 0,
      stdout: "published\n",
      stderr: "",
      timed_out: false,
    });
    const result = await runWorkflowStep(command, context());
    expect(effects.confirmCommand).toHaveBeenCalledWith(
      { program: "/usr/bin/publish", args: ["--file", "{{step:gen}}"] },
      "Tasks to the vault",
    );
    expect(effects.runCommand).toHaveBeenCalledWith(
      "/usr/bin/publish",
      ["--file", "- Alice: send the deck"],
      60,
    );
    expect(result.output).toBe("published");
  });

  it("does not run a refused command", async () => {
    effects.confirmCommand.mockResolvedValue(false);
    await expect(runWorkflowStep(command, context())).rejects.toThrow(
      "not confirmed",
    );
    expect(effects.runCommand).not.toHaveBeenCalled();
  });

  it("reports a failure with its code and first error line", async () => {
    effects.confirmCommand.mockResolvedValue(true);
    effects.runCommand.mockResolvedValue({
      exit_code: 2,
      stdout: "",
      stderr: "no such file\nmore",
      timed_out: false,
    });
    await expect(runWorkflowStep(command, context())).rejects.toThrow(
      "The command failed (code 2): no such file",
    );
  });

  it("reports a command stopped by the timeout", async () => {
    effects.confirmCommand.mockResolvedValue(true);
    effects.runCommand.mockResolvedValue({
      exit_code: null,
      stdout: "",
      stderr: "",
      timed_out: true,
    });
    await expect(runWorkflowStep(command, context())).rejects.toThrow(
      "did not finish within 60 seconds",
    );
  });

  it("neither asks nor runs when run dry", async () => {
    await runWorkflowStep(command, context({ dryRun: true }));
    expect(effects.confirmCommand).not.toHaveBeenCalled();
    expect(effects.runCommand).not.toHaveBeenCalled();
  });
});
