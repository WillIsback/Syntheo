import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SessionAutoStart } from "./session-auto-start";

import { useAppLock } from "~/lock/store";

type MockSession = {
  id: string;
  user_id: string;
  created_at: string;
  folder_id: string;
  title: string;
  raw_md: string;
  raw_template_id: string;
  locked: boolean;
};

const baseSession: MockSession = {
  id: "session-1",
  user_id: "user-1",
  created_at: "2026-05-15T12:00:00.000Z",
  folder_id: "",
  title: "Design Review",
  raw_md: "",
  raw_template_id: "",
  locked: false,
};

const mocks = vi.hoisted(() => ({
  canStart: true,
  liveStatus: "inactive",
  connectionReady: true,
  session: null as MockSession | null,
  startListening: vi.fn(),
  updateSessionTabState: vi.fn(),
}));

const tab = {
  type: "sessions" as const,
  id: "session-1",
  active: true,
  slotId: "slot-1",
  pinned: false,
  state: { view: null, autoStart: true },
};

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: {
    getState: () => ({
      tabs: [tab],
      updateSessionTabState: mocks.updateSessionTabState,
    }),
  },
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: any) => unknown) =>
    selector({
      canStartLiveSession: () => mocks.canStart,
      live: { status: mocks.liveStatus },
    }),
}));

vi.mock("~/session/queries", () => ({
  useSession: () => mocks.session,
}));

vi.mock("~/stt/useStartListening", () => ({
  useStartListeningState: () => ({
    connectionReady: mocks.connectionReady,
    startListening: mocks.startListening,
  }),
}));

const cleared = { view: null, autoStart: null };

beforeEach(() => {
  mocks.canStart = true;
  mocks.liveStatus = "inactive";
  mocks.connectionReady = true;
  mocks.session = { ...baseSession };
  mocks.startListening.mockReset().mockResolvedValue(undefined);
  mocks.updateSessionTabState.mockReset();
  useAppLock.setState({ revealedNoteIds: {} });
});

afterEach(() => {
  cleanup();
});

test("starts recording once and clears the auto-start flag", async () => {
  render(
    <StrictMode>
      <SessionAutoStart sessionId="session-1" />
    </StrictMode>,
  );

  await vi.waitFor(() => expect(mocks.startListening).toHaveBeenCalledTimes(1));
  expect(mocks.updateSessionTabState).toHaveBeenCalledWith(tab, cleared);
});

test("starts when capture readiness becomes available", async () => {
  mocks.canStart = false;
  const view = render(<SessionAutoStart sessionId="session-1" />);

  expect(mocks.startListening).not.toHaveBeenCalled();

  mocks.canStart = true;
  view.rerender(<SessionAutoStart sessionId="session-1" />);

  await vi.waitFor(() => expect(mocks.startListening).toHaveBeenCalledTimes(1));
});

test("abandons an armed auto-start immediately while another meeting is recording", () => {
  mocks.canStart = false;
  mocks.liveStatus = "active";

  render(<SessionAutoStart sessionId="session-1" />);

  expect(mocks.startListening).not.toHaveBeenCalled();
  expect(mocks.updateSessionTabState).toHaveBeenCalledWith(tab, cleared);
});

test("starts when the session record becomes available", async () => {
  mocks.session = null;
  const view = render(<SessionAutoStart sessionId="session-1" />);

  expect(mocks.startListening).not.toHaveBeenCalled();

  mocks.session = { ...baseSession };
  view.rerender(<SessionAutoStart sessionId="session-1" />);

  await vi.waitFor(() => expect(mocks.startListening).toHaveBeenCalledTimes(1));
});

test("waits for the recording hook's connection before auto-starting", async () => {
  mocks.connectionReady = false;
  const view = render(<SessionAutoStart sessionId="session-1" />);

  expect(mocks.startListening).not.toHaveBeenCalled();

  mocks.connectionReady = true;
  view.rerender(<SessionAutoStart sessionId="session-1" />);

  await vi.waitFor(() => expect(mocks.startListening).toHaveBeenCalledTimes(1));
});

test.each([
  {
    name: "the recording connection never becomes ready",
    block: () => {
      mocks.connectionReady = false;
    },
  },
  {
    name: "capture readiness never becomes available",
    block: () => {
      mocks.canStart = false;
    },
  },
])("abandons the start when $name", async ({ block }) => {
  vi.useFakeTimers();
  block();

  try {
    render(<SessionAutoStart sessionId="session-1" />);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.startListening).not.toHaveBeenCalled();
    expect(mocks.updateSessionTabState).toHaveBeenCalledWith(tab, cleared);
  } finally {
    vi.useRealTimers();
  }
});

test("abandons a locked session and starts it once revealed", async () => {
  mocks.session = { ...baseSession, locked: true };
  render(<SessionAutoStart sessionId="session-1" />);

  expect(mocks.startListening).not.toHaveBeenCalled();
  expect(mocks.updateSessionTabState).toHaveBeenCalledWith(tab, cleared);
  cleanup();

  useAppLock.setState({ revealedNoteIds: { "session-1": true } });
  render(<SessionAutoStart sessionId="session-1" />);

  await vi.waitFor(() => expect(mocks.startListening).toHaveBeenCalledTimes(1));
});
