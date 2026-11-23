import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listenerState,
  startMonitorMock,
  stopMonitorMock,
  startSpeakerMonitorMock,
  stopSpeakerMonitorMock,
  channels,
} = vi.hoisted(() => ({
  listenerState: {
    live: {
      status: "inactive" as "inactive" | "active" | "finalizing",
      loading: false,
      amplitude: { mic: 0, speaker: 0 },
    },
  },
  startMonitorMock: vi.fn(),
  stopMonitorMock: vi.fn(),
  startSpeakerMonitorMock: vi.fn(),
  stopSpeakerMonitorMock: vi.fn(),
  channels: [] as { onmessage: (level: number | null) => void }[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: (level: number | null) => void = () => {};
    constructor() {
      channels.push(this);
    }
  },
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    startMicrophoneLevelMonitor: startMonitorMock,
    stopMicrophoneLevelMonitor: stopMonitorMock,
    startSpeakerLevelMonitor: startSpeakerMonitorMock,
    stopSpeakerLevelMonitor: stopSpeakerMonitorMock,
  },
}));

vi.mock("~/stt/contexts", () => ({
  useListener: <T,>(selector: (state: typeof listenerState) => T) =>
    selector(listenerState),
}));

import { AudioSettingsView } from "./audio-settings";

type AudioSettingsProps = Parameters<typeof AudioSettingsView>[0];
type MicrophoneDevice = AudioSettingsProps["microphoneDevice"];
type SpeakerDevice = NonNullable<AudioSettingsProps["speakerDevice"]>;

function renderAudioSettings(
  microphoneDevice: Partial<MicrophoneDevice> = {},
  speakerDevice?: Partial<SpeakerDevice>,
) {
  return render(
    <AudioSettingsView
      microphoneDevice={{
        value: "",
        devices: ["External Microphone"],
        onChange: vi.fn(),
        devicesLoaded: true,
        onSearchAgain: vi.fn(),
        ...microphoneDevice,
      }}
      speakerDevice={
        speakerDevice
          ? {
              value: "",
              devices: ["Haut-parleurs (Realtek)", "Casque (Jabra Evolve2)"],
              onChange: vi.fn(),
              devicesLoaded: true,
              onSearchAgain: vi.fn(),
              captured: "Haut-parleurs (Realtek)",
              ...speakerDevice,
            }
          : undefined
      }
    />,
  );
}

describe("AudioSettingsView", () => {
  beforeEach(() => {
    listenerState.live.status = "inactive";
    listenerState.live.loading = false;
    listenerState.live.amplitude = { mic: 0, speaker: 0 };
    channels.length = 0;
    startMonitorMock.mockResolvedValue({ status: "ok", data: null });
    stopMonitorMock.mockResolvedValue({ status: "ok", data: null });
    startSpeakerMonitorMock.mockResolvedValue({ status: "ok", data: null });
    stopSpeakerMonitorMock.mockResolvedValue({ status: "ok", data: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows when the selected microphone is unavailable and will fall back", () => {
    renderAudioSettings({
      value: "Disconnected Microphone",
      devices: ["External Microphone"],
    });

    expect(
      screen.getByRole("combobox", { name: "Microphone" }).textContent,
    ).toContain(
      "Disconnected Microphone (Unavailable — using current default)",
    );
  });

  // Règle audio de Syntheo : rien à conserver, donc ni réglage de rétention ni
  // empreintes vocales construites à partir de l'audio.
  it("audio_settings_offer_no_retention_or_voiceprint", () => {
    const { container } = renderAudioSettings();
    expect(container.textContent).not.toContain("Audio file retention");
    expect(container.textContent).not.toContain("Remember speakers");
  });

  describe("no microphone detected (issue 419)", () => {
    it("explains the situation and searches again on demand", () => {
      const onSearchAgain = vi.fn();
      renderAudioSettings({ devices: [], onSearchAgain });

      expect(screen.getByRole("status").textContent).toBe(
        "No microphone detected. Plug in a microphone or check permissions.",
      );
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(screen.queryByRole("meter")).toBeNull();
      expect(startMonitorMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: /Search again/ }));
      expect(onSearchAgain).toHaveBeenCalledOnce();
    });

    it("waits for the first detection before saying so", () => {
      renderAudioSettings({ devices: [], devicesLoaded: false });

      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.getByRole("combobox", { name: "Microphone" })).toBeTruthy();
    });

    it("disables the button while searching", () => {
      renderAudioSettings({ devices: [], searching: true });

      expect(
        (
          screen.getByRole("button", {
            name: /Search again/,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });
  });

  describe("input level meter (issue 419)", () => {
    it("follows the selected microphone and stops when the page goes away", async () => {
      const { unmount } = renderAudioSettings({ value: "External Microphone" });

      await waitFor(() => expect(startMonitorMock).toHaveBeenCalledOnce());
      const [owner, device] = startMonitorMock.mock.calls[0] as [
        string,
        string | null,
      ];
      expect(device).toBe("External Microphone");

      const meter = screen.getByRole("meter", { name: "Input level" });
      expect(meter.getAttribute("aria-valuenow")).toBe("0");
      act(() => channels[0]?.onmessage(0.42));
      expect(meter.getAttribute("aria-valuenow")).toBe("42");

      unmount();
      expect(stopMonitorMock).toHaveBeenCalledWith(owner);
    });

    it("uses the system default when no microphone is chosen", async () => {
      renderAudioSettings({ value: "" });

      await waitFor(() => expect(startMonitorMock).toHaveBeenCalledOnce());
      expect(startMonitorMock.mock.calls[0]?.[1]).toBeNull();
    });

    it("closes the microphone if the page left while it was opening", async () => {
      let finishStart!: (value: unknown) => void;
      startMonitorMock.mockReturnValueOnce(
        new Promise((resolve) => {
          finishStart = resolve;
        }),
      );
      const { unmount } = renderAudioSettings();
      await waitFor(() => expect(startMonitorMock).toHaveBeenCalledOnce());
      const owner = startMonitorMock.mock.calls[0]?.[0];

      unmount();
      stopMonitorMock.mockClear();
      finishStart({ status: "ok", data: null });

      await waitFor(() => expect(stopMonitorMock).toHaveBeenCalledWith(owner));
    });

    it("leaves the microphone to an ongoing recording", () => {
      listenerState.live.status = "active";
      listenerState.live.amplitude = { mic: 0.3, speaker: 0 };
      renderAudioSettings();

      expect(startMonitorMock).not.toHaveBeenCalled();
      expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe(
        "30",
      );
    });

    it("says when the level cannot be read", async () => {
      startMonitorMock.mockResolvedValueOnce({
        status: "error",
        error: "no input device found",
      });
      renderAudioSettings();

      expect(await screen.findByText("Input level unavailable")).toBeTruthy();
      expect(screen.queryByRole("meter")).toBeNull();
    });
  });

  describe("system audio output (issue 450)", () => {
    it("is hidden where the output cannot be chosen", () => {
      renderAudioSettings();
      expect(
        screen.queryByRole("combobox", { name: "System sound" }),
      ).toBeNull();
      expect(startSpeakerMonitorMock).not.toHaveBeenCalled();
    });

    it("follows the current default output and says what is captured", () => {
      renderAudioSettings({}, {});

      expect(
        screen.getByRole("combobox", { name: "System sound" }).textContent,
      ).toContain("Current default output");
      expect(screen.getByText(/Captured right now:/).textContent).toBe(
        "Captured right now: Haut-parleurs (Realtek)",
      );
    });

    it("shows when the chosen output is unavailable and will fall back", () => {
      renderAudioSettings(
        {},
        { value: "HDMI — GPU NVIDIA", captured: "Haut-parleurs (Realtek)" },
      );

      expect(
        screen.getByRole("combobox", { name: "System sound" }).textContent,
      ).toContain("HDMI — GPU NVIDIA (Unavailable — using the default output)");
    });

    it("meters the chosen output, apart from the microphone", async () => {
      const { unmount } = renderAudioSettings(
        {},
        { value: "Casque (Jabra Evolve2)" },
      );

      await waitFor(() =>
        expect(startSpeakerMonitorMock).toHaveBeenCalledOnce(),
      );
      const [owner, device] = startSpeakerMonitorMock.mock.calls[0] as [
        string,
        string | null,
      ];
      expect(device).toBe("Casque (Jabra Evolve2)");
      expect(screen.getByRole("meter", { name: "Output level" })).toBeTruthy();

      unmount();
      expect(stopSpeakerMonitorMock).toHaveBeenCalledWith(owner);
    });

    it("shows the captured output level during a recording", () => {
      listenerState.live.status = "active";
      listenerState.live.amplitude = { mic: 0.3, speaker: 0.6 };
      renderAudioSettings({}, {});

      expect(startSpeakerMonitorMock).not.toHaveBeenCalled();
      expect(
        screen
          .getByRole("meter", { name: "Output level" })
          .getAttribute("aria-valuenow"),
      ).toBe("60");
    });

    it("explains when no output is detected and searches again", () => {
      const onSearchAgain = vi.fn();
      renderAudioSettings({}, { devices: [], onSearchAgain, captured: null });

      expect(screen.getByRole("status").textContent).toBe(
        "No audio output detected. Plug in headphones or speakers, then search again.",
      );
      fireEvent.click(screen.getByRole("button", { name: /Search again/ }));
      expect(onSearchAgain).toHaveBeenCalledOnce();
    });
  });
});
