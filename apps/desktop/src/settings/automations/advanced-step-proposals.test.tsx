import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ confirm: vi.fn(() => Promise.resolve()) }));

vi.mock("@iconify-icon/react", () => ({
  Icon: (props: Record<string, unknown>) =>
    createElement("iconify-icon", props),
}));

vi.mock("~/automations/chat-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/automations/chat-proposals")>()),
  confirmAdvancedStep: mocks.confirm,
}));

import { AdvancedStepProposals } from "./advanced-step-proposals";

import {
  proposeAdvancedStep,
  useAdvancedStepProposals,
} from "~/automations/chat-proposals";
import { useAutomationLabels } from "~/automations/labels";

afterEach(cleanup);

function Proposals() {
  return (
    <AdvancedStepProposals workflowId="wf" labels={useAutomationLabels()} />
  );
}

describe("AdvancedStepProposals", () => {
  beforeEach(() => {
    mocks.confirm.mockClear();
    useAdvancedStepProposals.setState({ proposals: [] });
  });

  it("shows the webhook address and adds it only on the user's click", () => {
    const proposal = proposeAdvancedStep({
      workflowId: "wf",
      index: 2,
      step: {
        id: "hook",
        type: "webhook",
        url: "https://n8n.local/webhook/syntheo",
        body: "{}",
      },
    });
    proposeAdvancedStep({
      workflowId: "other",
      index: 0,
      step: { id: "cmd", type: "command", program: "/bin/true", args: [] },
    });

    render(<Proposals />);

    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(
      screen.getByText(
        "The chat suggests adding step 4: Send to an address (webhook)",
      ),
    ).toBeTruthy();
    expect(screen.getByText("https://n8n.local/webhook/syntheo")).toBeTruthy();
    expect(mocks.confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add the step" }));
    expect(mocks.confirm).toHaveBeenCalledWith(proposal.id);
  });

  it("drops the proposal when the user declines", () => {
    proposeAdvancedStep({
      workflowId: "wf",
      index: 0,
      step: { id: "cmd", type: "command", program: "/bin/true", args: [] },
    });

    render(<Proposals />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(useAdvancedStepProposals.getState().proposals).toEqual([]);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
