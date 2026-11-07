import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@syntheo/ui/components/ui/tooltip";

import { LiveTranscriptionLanguage } from "./live-transcription-language";

import { useLiveTranscriptionLanguages } from "~/store/zustand/live-transcription-languages";

// Issue 351 : la langue de la transcription en direct s'affiche discrètement
// dans la marge, seulement quand des langues parlées sont laissées de côté.

const mocks = vi.hoisted(() => ({
  live: { status: "active", sessionId: "session-1" } as {
    status: string;
    sessionId: string | null;
  },
  openNew: vi.fn(),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ live: mocks.live }),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: unknown) => unknown) =>
    selector({ openNew: mocks.openNew }),
}));

function renderNotice(sessionId = "session-1") {
  return render(
    <TooltipProvider>
      <LiveTranscriptionLanguage sessionId={sessionId} />
    </TooltipProvider>,
  );
}

describe("LiveTranscriptionLanguage", () => {
  beforeEach(() => {
    mocks.live = { status: "active", sessionId: "session-1" };
    mocks.openNew.mockReset();
    useLiveTranscriptionLanguages.setState({ bySession: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it("names the live transcription language when other languages are omitted", () => {
    useLiveTranscriptionLanguages.getState().setLanguages("session-1", {
      languages: ["en"],
      omittedLanguages: ["fr", "de"],
    });

    renderNotice();

    expect(screen.getByText("Live transcription: English")).toBeTruthy();
    expect(
      screen
        .getByText("Live transcription: English")
        .getAttribute("aria-description"),
    ).toBe("Other languages (French, German) won't be transcribed live.");
  });

  it("stays hidden when every spoken language is transcribed live", () => {
    useLiveTranscriptionLanguages.getState().setLanguages("session-1", {
      languages: ["en", "fr"],
    });

    const { container } = renderNotice();

    expect(container.textContent).toBe("");
  });

  it("stays hidden when the note is not listening", () => {
    useLiveTranscriptionLanguages.getState().setLanguages("session-1", {
      languages: ["en"],
      omittedLanguages: ["fr"],
    });
    mocks.live = { status: "inactive", sessionId: null };

    const { container } = renderNotice();

    expect(container.textContent).toBe("");
  });

  it("stays hidden for another note than the one listening", () => {
    useLiveTranscriptionLanguages.getState().setLanguages("session-2", {
      languages: ["en"],
      omittedLanguages: ["fr"],
    });

    const { container } = renderNotice("session-2");

    expect(container.textContent).toBe("");
  });

  it("opens the transcription language settings from Change", () => {
    useLiveTranscriptionLanguages.getState().setLanguages("session-1", {
      languages: ["en"],
      omittedLanguages: ["fr"],
    });

    renderNotice();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "transcription" },
    });
  });
});
