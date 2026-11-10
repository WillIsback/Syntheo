import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isWelcomeNote, WelcomeCard } from "./welcome-card";

import { WELCOME_NOTE_TRACKING_ID } from "~/onboarding/welcome-note.constants";

const mocks = vi.hoisted(() => ({
  welcomeNote: "" as string | undefined,
  openNew: vi.fn(),
}));

vi.mock("~/session/queries", () => ({
  useSession: () =>
    mocks.welcomeNote === undefined
      ? null
      : { welcome_note: mocks.welcomeNote },
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (select: (state: { openNew: typeof mocks.openNew }) => unknown) =>
    select({ openNew: mocks.openNew }),
}));

beforeEach(() => {
  mocks.welcomeNote = WELCOME_NOTE_TRACKING_ID;
  mocks.openNew.mockReset();
});

afterEach(cleanup);

describe("isWelcomeNote", () => {
  it("recognizes only the welcome note", () => {
    expect(isWelcomeNote(WELCOME_NOTE_TRACKING_ID)).toBe(true);
    expect(isWelcomeNote("meeting-42")).toBe(false);
    expect(isWelcomeNote("")).toBe(false);
    expect(isWelcomeNote(undefined)).toBe(false);
  });
});

describe("WelcomeCard", () => {
  it("opens each essential settings screen from its button", () => {
    render(<WelcomeCard sessionId="welcome" />);

    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Transcription/ }));
    fireEvent.click(screen.getByRole("button", { name: /Synthesis/ }));

    expect(mocks.openNew.mock.calls.map(([input]) => input)).toEqual([
      { type: "settings", state: { tab: "appearance" } },
      { type: "settings", state: { tab: "transcription" } },
      { type: "settings", state: { tab: "intelligence" } },
    ]);
  });

  it("is absent from any other note", () => {
    mocks.welcomeNote = "";
    const { container } = render(<WelcomeCard sessionId="meeting" />);
    expect(container.innerHTML).toBe("");
  });

  it("is absent while the note is still loading", () => {
    mocks.welcomeNote = undefined;
    const { container } = render(<WelcomeCard sessionId="loading" />);
    expect(container.innerHTML).toBe("");
  });
});
