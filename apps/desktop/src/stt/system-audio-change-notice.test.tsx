import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  live: { status: "active", sessionId: "session-1" },
  devices: vi.fn(),
  captured: vi.fn(),
  info: vi.fn(),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: <T,>(selector: (state: { live: typeof mocks.live }) => T) =>
    selector({ live: mocks.live }),
}));
vi.mock("~/shared/config", () => ({ useConfigValue: () => "" }));
vi.mock("~/settings/general/speaker-device", () => ({
  listSpeakerDevices: mocks.devices,
  getCapturedSpeakerDevice: mocks.captured,
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { info: mocks.info },
}));

import { SystemAudioChangeNotice } from "./system-audio-change-notice";

const speakers = { name: "Haut-parleurs (Realtek)", headphone: false };
const headset = { name: "Casque (Jabra Evolve2)", headphone: true };

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });
}

describe("SystemAudioChangeNotice (issue 450)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.live.status = "active";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("tells the user when the headset is unplugged during a recording", async () => {
    mocks.devices
      .mockResolvedValueOnce([speakers.name, headset.name])
      .mockResolvedValue([speakers.name]);
    mocks.captured.mockResolvedValueOnce(headset).mockResolvedValue(speakers);

    render(<SystemAudioChangeNotice />);
    await act(async () => {});
    expect(mocks.info).not.toHaveBeenCalled();

    await tick();
    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.info.mock.calls[0]?.[0]).toBe(
      "System audio: the headset was unplugged, Syntheo now captures Haut-parleurs (Realtek).",
    );

    await tick();
    expect(mocks.info).toHaveBeenCalledOnce();
  });

  it("does nothing outside a recording", async () => {
    mocks.live.status = "inactive";
    render(<SystemAudioChangeNotice />);
    await tick();
    expect(mocks.devices).not.toHaveBeenCalled();
  });

  it("stops watching where the output cannot be chosen", async () => {
    mocks.devices.mockResolvedValue(null);
    mocks.captured.mockResolvedValue(null);
    render(<SystemAudioChangeNotice />);
    await act(async () => {});
    await tick();
    await tick();
    expect(mocks.devices).toHaveBeenCalledOnce();
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
