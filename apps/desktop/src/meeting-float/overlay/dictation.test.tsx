import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FloatingBarOverlay } from "./bar";

import { getDictationPanelState } from "~/dictation/panel";
import { useDictationStatus } from "~/dictation/state";

vi.mock("@syntheo/ui/components/ui/dancing-sticks", () => ({
  DancingSticks: () => <span>Microphone activity</span>,
}));

function state() {
  return {
    ...getDictationPanelState()!,
    dictation: getDictationPanelState()!.dictation!,
  };
}

describe("dictation floating panel", () => {
  afterEach(cleanup);

  it("offers only finish and preview controls in the compact pill", () => {
    useDictationStatus.setState({
      ...useDictationStatus.getInitialState(),
      owner: "test",
      phase: "recording",
    });
    const onAction = vi.fn();
    render(
      <FloatingBarOverlay
        state={state()}
        onStop={() => onAction("finish")}
        onToggleExpanded={() => onAction("togglePreview")}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Expand live transcript" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish dictation" }));
    expect(onAction.mock.calls.map(([action]) => action)).toEqual([
      "togglePreview",
      "finish",
    ]);
  });

  it("displays plain live speech and disables finishing while transcription completes", () => {
    useDictationStatus.setState({
      ...useDictationStatus.getInitialState(),
      owner: "test",
      phase: "recording",
      expanded: true,
      previewEnabled: true,
      text: "Hello",
      partial: "world",
    });
    const onAction = vi.fn();
    const view = render(
      <FloatingBarOverlay
        state={state()}
        onStop={() => onAction("finish")}
        onToggleExpanded={() => onAction("togglePreview")}
      />,
    );
    expect(screen.getByText("world")).toBeTruthy();
    expect(screen.getByText("world").closest("[aria-live]")?.textContent).toBe(
      "Hello world",
    );
    useDictationStatus.setState({
      text: "Hello world.",
      partial: "",
      phase: "transcribing",
    });
    view.rerender(
      <FloatingBarOverlay
        state={state()}
        onStop={() => onAction("finish")}
        onToggleExpanded={() => onAction("togglePreview")}
      />,
    );
    expect(screen.getByText("Hello world.")).toBeTruthy();
    expect(screen.getAllByText("Finishing…").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Finish dictation" }));
    expect(onAction).not.toHaveBeenCalled();
  });
  // Issue 448 : la pastille de réunion n'affiche plus de transcription ; la dictée garde
  // son panneau dans la même fenêtre.
  it("shows the dictation text in its panel and no meeting transcript in the pill", () => {
    useDictationStatus.setState({
      ...useDictationStatus.getInitialState(),
      owner: "test",
      phase: "recording",
      expanded: true,
      previewEnabled: true,
      text: "My dictated sentence.",
    });
    const sharedState = {
      ...state(),
      transcriptBubbles: [
        {
          id: "meeting-word",
          speakerLabel: "Ada",
          text: "Meeting discussion.",
          isSelf: false,
          isFinal: true,
          startMs: 0,
          endMs: 100,
          overlapsPrevious: false,
          overlapsNext: false,
        },
      ],
    };
    const callbacks = {
      onStop: vi.fn(),
      onOpenNote: vi.fn(),
      onToggleExpanded: vi.fn(),
    };
    const view = render(
      <FloatingBarOverlay
        state={{ ...sharedState, dictation: null, title: "Weekly sync" }}
        {...callbacks}
      />,
    );
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.queryByText("Meeting discussion.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cancel dictation" }),
    ).toBeNull();
    view.rerender(<FloatingBarOverlay state={sharedState} {...callbacks} />);
    expect(screen.queryByText("Meeting discussion.")).toBeNull();
    expect(screen.getByText("My dictated sentence.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Collapse live transcript" }),
    ).toBeTruthy();
    view.rerender(
      <FloatingBarOverlay
        state={{ ...sharedState, dictation: null, title: "Weekly sync" }}
        {...callbacks}
      />,
    );
    expect(screen.queryByText("My dictated sentence.")).toBeNull();
  });
});
