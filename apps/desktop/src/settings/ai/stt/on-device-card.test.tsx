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
  commission: vi.fn(),
  commissioning: null as unknown,
  progress: null as unknown,
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    onDeviceStatus: async () => ({ status: "ok", data: mocks.status }),
    probeLocalTranscription: async () => ({ status: "ok", data: mocks.probe }),
    onDeviceInstall: mocks.install,
    onDeviceUninstall: mocks.uninstall,
    onDeviceCommission: mocks.commission,
    onDeviceCommissionProgress: async () => ({
      status: "ok",
      data: mocks.progress,
    }),
    onDeviceCommissioning: async () => ({
      status: "ok",
      data: mocks.commissioning,
    }),
  },
}));
vi.mock("~/settings/queries", () => ({
  useSetSettingValues: () => mocks.setSettings,
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => mocks.config,
}));

import { OnDeviceCard, OnDevicePolicyNotice } from "./on-device-card";

function probe(verdict: Probe["verdict"], powerAdvice = false): Probe {
  return { verdict, powerAdvice } as Probe;
}

function setup(node = <OnDeviceCard />) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {node}
    </QueryClientProvider>,
  );
}

const installed = {
  kind: "installed",
  version: "0.1.0",
  sizeBytes: 1_130_000_000,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = { stt_on_device: false };
  mocks.status = {
    allowed: true,
    installable: true,
    module: { kind: "not_installed" },
  };
  mocks.probe = probe({ kind: "propose", profile: "two_streams_diarized" });
  mocks.install.mockResolvedValue({ status: "ok", data: installed });
  mocks.uninstall.mockResolvedValue({ status: "ok", data: null });
  mocks.progress = null;
  mocks.commissioning = {
    profile: "two_streams_diarized",
    measures: [],
    measuredAt: 1,
  };
  mocks.commission.mockResolvedValue({
    status: "ok",
    data: { profile: "two_streams", measures: [], measuredAt: 2 },
  });
});

afterEach(cleanup);

describe("OnDeviceCard", () => {
  it("is hidden when the organization forbids the module", async () => {
    mocks.status = { ...mocks.status, allowed: false };
    const { container } = setup();
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  // Revue 685, constat 10 : sans clé de signature, ni installation ni
  // proposition.
  it("says coming soon and offers no installation without a signing key", async () => {
    mocks.status = { ...mocks.status, installable: false };
    setup();
    await screen.findByText(/coming soon/);
    expect(screen.queryByText("Install from a file…")).toBeNull();
  });

  // Constat 4 : le fichier est choisi côté Rust, aucun chemin n'est envoyé.
  it("installs without sending a path, and announces the result", async () => {
    setup();
    await screen.findByText(/Module not installed/);
    expect(screen.getByRole<HTMLInputElement>("checkbox").disabled).toBe(true);
    fireEvent.click(screen.getByText("Install from a file…"));
    await waitFor(() => expect(mocks.install).toHaveBeenCalledWith());
    // Issue 686 : la mise en service suit l'installation.
    await waitFor(() => expect(mocks.commission).toHaveBeenCalled());
    const done = await screen.findByText(
      /Measurement done: microphone and system audio, without speakers/,
    );
    expect(done.closest("[aria-live='polite']")).not.toBeNull();
  });

  // Constat 11 : codes traduits, jamais le texte brut de Rust.
  it("explains an installation error in plain words", async () => {
    mocks.install.mockResolvedValue({
      status: "error",
      error: "bad_signature",
    });
    setup();
    fireEvent.click(await screen.findByText("Install from a file…"));
    const alert = await screen.findByText(/not installed:/);
    expect(alert.textContent).toMatch(/not signed by Syntheo/);
    expect(alert.textContent).not.toMatch(/bad_signature/);
  });

  it("shows the installed module and lets the user choose it", async () => {
    mocks.status = { ...mocks.status, module: installed };
    setup();
    await screen.findByText(/version 0\.1\.0, 1\.1 GB/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: true });
    fireEvent.click(screen.getByText("Uninstall"));
    await waitFor(() => expect(mocks.uninstall).toHaveBeenCalled());
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: false });
  });

  // Constat 9 et décision 2 : la case reflète le réglage ; un module absent
  // le dit et propose « Installer » ou « Revenir au serveur ».
  it("offers to install or go back to the server when the chosen module is missing", async () => {
    mocks.config = { stt_on_device: true };
    setup();
    const alert = await screen.findByTestId("on-device-missing");
    expect(alert.textContent).toMatch(
      /not installed: live transcription is paused/,
    );
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(true);
    fireEvent.click(screen.getByText("Go back to the server"));
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: false });
  });

  it("translates the reason of a refused module", async () => {
    mocks.status = {
      ...mocks.status,
      module: { kind: "invalid", reason: "module_altered" },
    };
    setup();
    expect((await screen.findByText(/module is refused/)).textContent).toMatch(
      /A file of the module has been modified/,
    );
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
    expect(verdict.closest("[aria-live='polite']")).not.toBeNull();
  });

  it("names the reduced profile", async () => {
    mocks.probe = probe({ kind: "propose_degraded", profile: "one_stream" });
    setup();
    fireEvent.click(await screen.findByText("Test this computer"));
    expect(
      (await screen.findByTestId("on-device-verdict")).textContent,
    ).toMatch(
      /reduced profile: microphone only, without speakers: the computer's sound \(remote participants\) is not transcribed/,
    );
  });
});

// Constat 5 : source choisie mais interdite : décochée, et la personne est
// prévenue.
describe("OnDevicePolicyNotice", () => {
  it("unticks the source visibly when the organization forbids it", async () => {
    mocks.status = { ...mocks.status, allowed: false };
    mocks.config = { stt_on_device: true };
    setup(<OnDevicePolicyNotice />);
    expect(
      (await screen.findByTestId("on-device-policy-notice")).textContent,
    ).toMatch(/disabled by your administrator/);
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: false });
  });

  it("stays silent otherwise", async () => {
    mocks.config = { stt_on_device: true };
    setup(<OnDevicePolicyNotice />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("on-device-policy-notice")).toBeNull();
  });
});

// Issue 686 : la source ne se choisit qu'avec un profil mesuré.
describe("mise en service", () => {
  it("shows the measured profile and measures again on demand", async () => {
    mocks.status = { ...mocks.status, module: installed };
    setup();
    await waitFor(() =>
      expect(screen.getByTestId("on-device-commissioning").textContent).toMatch(
        /Measured: microphone and system audio, with speakers/,
      ),
    );
    fireEvent.click(screen.getByText("Measure again"));
    await waitFor(() => expect(mocks.commission).toHaveBeenCalled());
  });

  it("keeps the source off until the computer is measured", async () => {
    mocks.status = { ...mocks.status, module: installed };
    mocks.commissioning = null;
    setup();
    await screen.findByText(/has not been measured yet/);
    expect(screen.getByRole<HTMLInputElement>("checkbox").disabled).toBe(true);
  });

  it("unticks the source when the computer is too slow", async () => {
    mocks.status = { ...mocks.status, module: installed };
    mocks.config = { stt_on_device: true };
    mocks.commission.mockResolvedValue({
      status: "ok",
      data: { profile: null, measures: [], measuredAt: 3 },
    });
    setup();
    fireEvent.click(await screen.findByText("Measure again"));
    await screen.findByText(/Measurement done: this computer is too slow/);
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: false });
  });
});

describe("avancement", () => {
  it("shows which profile is being measured", async () => {
    mocks.status = { ...mocks.status, module: installed };
    let finish: (value: unknown) => void = () => {};
    mocks.commission.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    setup();
    fireEvent.click(await screen.findByText("Measure again"));
    mocks.progress = { current: 2, total: 4 };
    expect(
      await screen.findByText("Measuring profile 2 of 4…", undefined, {
        timeout: 3000,
      }),
    ).toBeTruthy();
    mocks.progress = null;
    finish({
      status: "ok",
      data: { profile: "two_streams", measures: [], measuredAt: 4 },
    });
    await screen.findByText(/Measurement done/);
  });
});

// Revue de l'issue 686, constat 2 : une carte remontée pendant une mesure
// en reprend l'affichage et bloque le bouton.
describe("mesure en cours ailleurs", () => {
  it("shows the progress and disables measuring again", async () => {
    mocks.status = { ...mocks.status, module: installed };
    mocks.progress = { current: 2, total: 4 };
    setup();
    expect(await screen.findByText("Measuring profile 2 of 4…")).toBeTruthy();
    const button = (await screen.findByText("Measure again")).closest(
      "button",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
