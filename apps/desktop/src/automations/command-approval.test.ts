import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: {} as Record<string, string>,
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: async () => ({
    values: { ...mocks.store },
    hasValues: new Set(Object.keys(mocks.store)),
  }),
  updateSettingValue: async (
    key: string,
    update: (current: string | undefined) => string,
  ) => {
    mocks.store[key] = update(mocks.store[key]);
    return mocks.store[key];
  },
}));

import {
  COMMAND_CONFIRMATION_TIMEOUT_MS,
  commandKey,
  confirmCommand,
  useCommandConfirmation,
} from "./command-approval";

// Confirmation au premier lancement, mémorisée par commande exacte.

const publish = { program: "/usr/bin/publish", args: ["{{step:export}}"] };

async function pendingPrompt() {
  await vi.waitFor(() => {
    expect(useCommandConfirmation.getState().pending).not.toBeNull();
  });
  return useCommandConfirmation.getState().pending!;
}

beforeEach(() => {
  mocks.store = {};
  useCommandConfirmation.setState({ pending: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("command confirmation", () => {
  it("asks the first time, then remembers the exact command", async () => {
    const first = confirmCommand(publish, "Publish");
    const prompt = await pendingPrompt();
    expect(prompt).toMatchObject({
      program: "/usr/bin/publish",
      args: ["{{step:export}}"],
      workflowTitle: "Publish",
    });
    useCommandConfirmation.getState().answer(true);
    await expect(first).resolves.toBe(true);
    expect(JSON.parse(mocks.store.automation_approved_commands!)).toEqual([
      commandKey(publish),
    ]);

    await expect(confirmCommand(publish, "Publish")).resolves.toBe(true);
    expect(useCommandConfirmation.getState().pending).toBeNull();
  });

  it("asks again when a single argument changes", async () => {
    mocks.store.automation_approved_commands = JSON.stringify([
      commandKey(publish),
    ]);
    const changed = confirmCommand(
      { ...publish, args: ["{{step:export}}", "--force"] },
      "Publish",
    );
    await pendingPrompt();
    useCommandConfirmation.getState().answer(false);
    await expect(changed).resolves.toBe(false);
    expect(JSON.parse(mocks.store.automation_approved_commands!)).toEqual([
      commandKey(publish),
    ]);
  });

  it("refuses when nobody answers", async () => {
    vi.useFakeTimers();
    const unanswered = confirmCommand(publish, "Publish");
    await vi.advanceTimersByTimeAsync(0);
    expect(useCommandConfirmation.getState().pending).not.toBeNull();
    await vi.advanceTimersByTimeAsync(COMMAND_CONFIRMATION_TIMEOUT_MS);
    await expect(unanswered).resolves.toBe(false);
    expect(useCommandConfirmation.getState().pending).toBeNull();
    expect(mocks.store.automation_approved_commands).toBeUndefined();
  });

  it("keys a command on its program and each argument", () => {
    expect(commandKey({ program: " a ", args: ["b c"] })).not.toBe(
      commandKey({ program: "a", args: ["b", "c"] }),
    );
  });
});
