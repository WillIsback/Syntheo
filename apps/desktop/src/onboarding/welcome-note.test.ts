import { i18n } from "@lingui/core";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("~/db", () => ({
  liveQueryClient: { execute: mocks.execute },
}));

vi.mock("~/session/queries", () => ({
  createSession: mocks.createSession,
}));

import {
  getOrCreateWelcomeSession,
  setPendingWelcomeSession,
  takePendingWelcomeSession,
} from "./welcome-note";

beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

it("reuses an existing onboarding welcome note", async () => {
  mocks.execute.mockResolvedValueOnce([{ id: "welcome-session" }]);

  await expect(getOrCreateWelcomeSession()).resolves.toBe("welcome-session");
  expect(mocks.createSession).not.toHaveBeenCalled();
  expect(mocks.execute).toHaveBeenCalledWith(expect.any(String), [
    "syntheo-onboarding-demo-v1",
  ]);
});

it("creates the welcome note as a local note without a demo meeting", async () => {
  mocks.execute.mockResolvedValueOnce([]);
  mocks.createSession.mockResolvedValueOnce("welcome-session");

  await expect(getOrCreateWelcomeSession()).resolves.toBe("welcome-session");

  const [title, , initial] = mocks.createSession.mock.calls[0];
  expect(title).toBe("Welcome to Syntheo");
  // Le marqueur vit dans metadata_json depuis la suppression du calendrier.
  expect(JSON.parse(initial.metadata_json)).toEqual({
    welcome_note: "syntheo-onboarding-demo-v1",
  });
  expect(initial).not.toHaveProperty("event_json");
  expect(() => JSON.parse(initial.raw_md)).not.toThrow();
});

it("carries the welcome note across a one-time onboarding relaunch", () => {
  setPendingWelcomeSession("welcome-session");

  expect(takePendingWelcomeSession()).toBe("welcome-session");
  expect(takePendingWelcomeSession()).toBeNull();
});

// Issue 696 : la note suit la langue de l'interface à sa création ; en
// français, le document s'appelle « synthèse » (issue 746).
it.each([
  ["fr", "Bienvenue sur Syntheo", "Préparer", /compte.rendu|résumé/i],
  ["en", "Welcome to Syntheo", "Prepare", /Préparer|synthèse/],
])(
  "writes the welcome note in the interface language (%s)",
  async (locale, title, step, absent) => {
    i18n.load(locale, {});
    i18n.activate(locale);
    try {
      mocks.execute.mockResolvedValueOnce([]);
      mocks.createSession.mockResolvedValueOnce("welcome-session");

      await getOrCreateWelcomeSession();

      const [createdTitle, , initial] = mocks.createSession.mock.calls[0];
      expect(createdTitle).toBe(title);
      expect(initial.raw_md).toContain(step);
      expect(initial.raw_md).not.toMatch(absent);
    } finally {
      i18n.activate("en");
    }
  },
);
