import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnDeviceStatus, Probe } from "@syntheo/plugin-transcription";

const mocks = vi.hoisted(() => ({
  status: null as unknown as OnDeviceStatus,
  probe: null as unknown as Probe,
  config: { stt_on_device: false } as Record<string, unknown>,
  setSettings: vi.fn(),
  install: vi.fn(),
  uninstall: vi.fn(),
  selectFile: vi.fn(),
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    onDeviceStatus: async () => ({ status: "ok", data: mocks.status }),
    probeLocalTranscription: async () => ({ status: "ok", data: mocks.probe }),
    onDeviceInstall: mocks.install,
    onDeviceUninstall: mocks.uninstall,
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.selectFile }));
vi.mock("~/settings/queries", () => ({
  useSetSettingValues: () => mocks.setSettings,
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => mocks.config,
}));

import { OnDeviceCard } from "./on-device-card";

function probe(verdict: Probe["verdict"], powerAdvice = false): Probe {
  return { verdict, powerAdvice } as Probe;
}

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OnDeviceCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = { stt_on_device: false };
  mocks.status = { allowed: true, module: { kind: "not_installed" } };
  mocks.probe = probe({ kind: "propose", profile: "two_streams_diarized" });
  mocks.install.mockResolvedValue({ status: "ok", data: null });
  mocks.uninstall.mockResolvedValue({ status: "ok", data: null });
});

afterEach(cleanup);

describe("OnDeviceCard", () => {
  it("is hidden when the organization forbids the module", async () => {
    mocks.status = { allowed: false, module: { kind: "not_installed" } };
    const { container } = setup();
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("offers installation from a file and keeps the source off while the module is missing", async () => {
    setup();
    await screen.findByText(/Module not installed/);
    const checkbox = screen.getByRole<HTMLInputElement>("checkbox");
    expect(checkbox.disabled).toBe(true);
    mocks.selectFile.mockResolvedValue("/modules/syntheo-speech/manifest.json");
    fireEvent.click(screen.getByText("Install from a file…"));
    await waitFor(() =>
      expect(mocks.install).toHaveBeenCalledWith(
        "/modules/syntheo-speech/manifest.json",
      ),
    );
  });

  it("shows the installed module and lets the user choose it", async () => {
    mocks.status = {
      allowed: true,
      module: { kind: "installed", version: "0.1.0", sizeBytes: 1_130_000_000 },
    };
    setup();
    await screen.findByText(/version 0\.1\.0, 1\.1 GB/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: true });
    fireEvent.click(screen.getByText("Uninstall"));
    await waitFor(() => expect(mocks.uninstall).toHaveBeenCalled());
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: false });
  });

  it("explains a refusal and the power advice after the test", async () => {
    mocks.probe = probe(
      { kind: "refuse", reasons: ["no_avx2", "not_enough_memory"] },
      true,
    );
    setup();
    fireEvent.click(await screen.findByText("Test this computer"));
    const verdict = await screen.findByTestId("on-device-verdict");
    expect(verdict.textContent).toMatch(
      /not eligible: the processor lacks AVX2 instructions, not enough free memory/,
    );
    expect(verdict.textContent).toMatch(/plug it in/);
  });

  it("names the reduced profile", async () => {
    mocks.probe = probe({ kind: "propose_degraded", profile: "one_stream" });
    setup();
    fireEvent.click(await screen.findByText("Test this computer"));
    expect(
      (await screen.findByTestId("on-device-verdict")).textContent,
    ).toMatch(/reduced profile: one audio stream, without speakers/);
  });
});
