import { beforeEach, describe, expect, it, vi } from "vitest";

const { warning, dismiss } = vi.hoisted(() => ({
  warning: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { warning, dismiss },
}));

import {
  mutedChannelsNoticeId,
  syncMutedChannelsNotice,
} from "./muted-channels";

function store(live: {
  muted: boolean;
  speakerMuted: boolean;
  status?: "active" | "inactive" | "finalizing";
}) {
  return {
    live: {
      sessionId: "session-1",
      status: live.status ?? "active",
      muted: live.muted,
      speakerMuted: live.speakerMuted,
    } as Parameters<typeof syncMutedChannelsNotice>[0]["live"],
    pause: vi.fn(),
    setMuted: vi.fn(),
  };
}

// Issue 447 : les deux canaux coupés, plus rien n'est transcrit.
describe("syncMutedChannelsNotice", () => {
  beforeEach(() => {
    warning.mockClear();
    dismiss.mockClear();
  });

  it("says nothing is transcribed and offers the pause or the microphone", () => {
    const both = store({ muted: true, speakerMuted: true });
    syncMutedChannelsNotice(both);

    expect(warning).toHaveBeenCalledTimes(1);
    const [message, options] = warning.mock.calls[0];
    expect(message).toBe(
      "The microphone and system audio are muted: nothing is being transcribed.",
    );
    expect(options).toMatchObject({ id: mutedChannelsNoticeId("session-1") });
    expect(options.action.label).toBe("Put on pause");
    expect(options.secondaryAction.label).toBe("Unmute the microphone");

    options.action.onClick();
    expect(both.pause).toHaveBeenCalledOnce();
    options.secondaryAction.onClick();
    expect(both.setMuted).toHaveBeenCalledWith(false);
  });

  it.each([
    { muted: true, speakerMuted: false },
    { muted: false, speakerMuted: true },
    { muted: false, speakerMuted: false },
    { muted: true, speakerMuted: true, status: "finalizing" as const },
  ])("dismisses the notice otherwise (%o)", (live) => {
    syncMutedChannelsNotice(store(live));

    expect(warning).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledWith("muted-channels-session-1");
  });
});
