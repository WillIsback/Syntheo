import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeLiveNoteCard, useHomeLiveSessionId } from "./live-note-card";

type LivePause = {
  sessionId: string;
  elapsedSeconds: number;
  phase: "pausing" | "paused";
};

const mocks = vi.hoisted(() => ({
  live: {
    status: "inactive" as "inactive" | "active" | "finalizing",
    sessionId: null as string | null,
    loading: false,
    seconds: 0,
    elapsedOffsetSeconds: 0,
    pause: null as LivePause | null,
  },
  title: "Point hebdo équipe produit",
  startListening: vi.fn(),
  pauseListening: vi.fn(),
  requestMainListenerControl: vi.fn(),
  isMainWebviewWindow: true,
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ live: mocks.live, pause: mocks.pauseListening }),
}));

vi.mock("~/stt/useStartListening", () => ({
  useStartListening: () => mocks.startListening,
}));

vi.mock("~/stt/window-control", () => ({
  isMainWebviewWindow: () => mocks.isMainWebviewWindow,
  requestMainListenerControl: mocks.requestMainListenerControl,
}));

vi.mock("~/session/queries", () => ({
  useSession: (sessionId: string) =>
    sessionId ? { id: sessionId, title: mocks.title } : null,
}));

function listen(sessionId: string, seconds: number) {
  mocks.live = {
    ...mocks.live,
    status: "active",
    sessionId,
    seconds,
    elapsedOffsetSeconds: 0,
    pause: null,
  };
}

function pauseAt(sessionId: string, elapsedSeconds: number) {
  mocks.live = {
    ...mocks.live,
    status: "inactive",
    sessionId: null,
    seconds: 0,
    pause: { sessionId, elapsedSeconds, phase: "paused" },
  };
}

describe("useHomeLiveSessionId", () => {
  beforeEach(() => {
    mocks.live = {
      status: "inactive",
      sessionId: null,
      loading: false,
      seconds: 0,
      elapsedOffsetSeconds: 0,
      pause: null,
    };
  });

  it("aucune note sans écoute", () => {
    const { result } = renderHook(() => useHomeLiveSessionId());
    expect(result.current).toBeNull();
  });

  it("la note écoutée, puis celle en pause", () => {
    listen("s9", 10);
    expect(renderHook(() => useHomeLiveSessionId()).result.current).toBe("s9");
    pauseAt("s8", 10);
    expect(renderHook(() => useHomeLiveSessionId()).result.current).toBe("s8");
  });

  it("aucune note pendant la finalisation après l'arrêt", () => {
    listen("s9", 10);
    mocks.live = { ...mocks.live, status: "finalizing" };
    expect(renderHook(() => useHomeLiveSessionId()).result.current).toBeNull();
  });
});

describe("HomeLiveNoteCard", () => {
  const onOpen = vi.fn();

  beforeEach(() => {
    mocks.title = "Point hebdo équipe produit";
    mocks.isMainWebviewWindow = true;
    listen("s9", 754);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("affiche l'état, la durée de la capsule et le titre", () => {
    render(<HomeLiveNoteCard sessionId="s9" onOpen={onOpen} />);

    const card = screen.getByRole("region", { name: /In progress/ });
    expect(card.textContent).toContain("In progress");
    expect(screen.getByRole("timer").textContent).toBe("12:34");
    expect(card.textContent).toContain("Point hebdo équipe produit");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("« Untitled » quand la note n'a pas de titre", () => {
    mocks.title = "  ";
    render(<HomeLiveNoteCard sessionId="s9" onOpen={onOpen} />);
    expect(screen.getByRole("region").textContent).toContain("Untitled");
  });

  it("Ouvrir ouvre la note", () => {
    render(<HomeLiveNoteCard sessionId="s9" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledWith("s9");
  });

  it("Pause met l'écoute en pause comme la capsule", () => {
    render(<HomeLiveNoteCard sessionId="s9" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(mocks.pauseListening).toHaveBeenCalledTimes(1);
    expect(mocks.startListening).not.toHaveBeenCalled();
  });

  it("en pause : « Paused », durée figée et Reprendre relance l'écoute", () => {
    pauseAt("s9", 754);
    render(<HomeLiveNoteCard sessionId="s9" onOpen={onOpen} />);

    expect(screen.getByRole("status").textContent).toContain("Paused");
    expect(screen.getByRole("timer").textContent).toBe("12:34");
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(mocks.startListening).toHaveBeenCalledTimes(1);
    expect(mocks.pauseListening).not.toHaveBeenCalled();
  });

  it("Reprendre est indisponible tant que la mise en pause n'est pas finie", () => {
    pauseAt("s9", 754);
    mocks.live.pause = {
      sessionId: "s9",
      elapsedSeconds: 754,
      phase: "pausing",
    };
    render(<HomeLiveNoteCard sessionId="s9" onOpen={onOpen} />);
    expect(
      (screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("hors fenêtre principale, délègue comme la capsule", () => {
    mocks.isMainWebviewWindow = false;
    render(<HomeLiveNoteCard sessionId="s9" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(mocks.requestMainListenerControl).toHaveBeenCalledWith(
      "pause",
      "s9",
    );
    expect(mocks.pauseListening).not.toHaveBeenCalled();
  });
});
