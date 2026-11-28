import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnDeviceStatus, Probe } from "@syntheo/plugin-transcription";

const mocks = vi.hoisted(() => ({
  status: null as unknown as OnDeviceStatus,
  probe: null as unknown as Probe,
  config: { stt_on_device: false } as Record<string, unknown>,
  setSettings: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  remove: vi.fn(),
  cancel: vi.fn(),
  installProgress: null as unknown,
  commission: vi.fn(),
  commissioning: null as unknown,
  progress: null as unknown,
  // Lecture de l'état retenue tant que la promesse n'est pas résolue.
  statusGate: null as Promise<void> | null,
}));

vi.mock("@syntheo/plugin-transcription", () => ({
  commands: {
    onDeviceStatus: async () => {
      if (mocks.statusGate) await mocks.statusGate;
      return { status: "ok", data: mocks.status };
    },
    probeLocalTranscription: async () => ({ status: "ok", data: mocks.probe }),
    onDeviceDownloadModels: mocks.download,
    onDeviceInstallModels: mocks.install,
    onDeviceRemoveModels: mocks.remove,
    onDeviceCancelInstall: mocks.cancel,
    onDeviceInstallProgress: async () => ({
      status: "ok",
      data: mocks.installProgress,
    }),
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

const installed = { kind: "installed", totalBytes: 1_066_000_000 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = { stt_on_device: false };
  mocks.status = {
    allowed: true,
    companion: true,
    models: { kind: "missing", totalBytes: 1_066_000_000 },
    downloadable: true,
  };
  mocks.probe = probe({ kind: "propose", profile: "two_streams_diarized" });
  mocks.download.mockResolvedValue({ status: "ok", data: installed });
  mocks.install.mockResolvedValue({ status: "ok", data: installed });
  mocks.remove.mockResolvedValue({ status: "ok", data: null });
  mocks.cancel.mockResolvedValue({ status: "ok", data: null });
  mocks.installProgress = null;
  mocks.progress = null;
  mocks.statusGate = null;
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

  // Issue 683 : sans programme compagnon dans cette version, rien à
  // installer.
  it("offers nothing to install without the companion program", async () => {
    mocks.status = { ...mocks.status, companion: false };
    setup();
    await screen.findByText(/does not include transcription on this computer/);
    expect(screen.queryByText(/Download the models/)).toBeNull();
    expect(screen.queryByText("Install from a folder…")).toBeNull();
  });

  // Revue de 7d72caf6, constat 23 : source choisie sans compagnon.
  it("says the program is missing when the chosen source has no companion", async () => {
    mocks.status = { ...mocks.status, companion: false };
    mocks.config = { stt_on_device: true };
    setup();
    const alert = await screen.findByTestId("on-device-missing");
    expect(alert.textContent).toMatch(
      /does not include transcription on this computer/,
    );
    expect(alert.textContent).not.toMatch(/models are not installed/);
  });

  // Revue de 7d72caf6, constat 21 : carte remontée pendant une installation.
  it("picks up an installation started before the card was mounted", async () => {
    mocks.installProgress = {
      doneBytes: 100_000_000,
      totalBytes: 1_066_000_000,
    };
    setup();
    await screen.findByTestId("on-device-install-progress");
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.queryByText(/Download the models/)).toBeNull();
  });

  it("downloads the models, then measures the computer", async () => {
    setup();
    await screen.findByText(/models \(1\.1 GB\) are not installed yet/);
    expect(screen.getByRole<HTMLInputElement>("checkbox").disabled).toBe(true);
    fireEvent.click(screen.getByText("Download the models (1.1 GB)"));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith());
    // Issue 686 : la mise en service suit l'installation.
    await waitFor(() => expect(mocks.commission).toHaveBeenCalled());
    const done = await screen.findByText(
      /Measurement done: microphone and system audio, without speakers/,
    );
    expect(done.closest("[aria-live='polite']")).not.toBeNull();
  });

  // Le dossier est choisi côté Rust : aucun chemin ne part de l'interface.
  it("installs from a folder without sending a path when no source is configured", async () => {
    mocks.status = { ...mocks.status, downloadable: false };
    setup();
    await screen.findByText(/Choose the folder that contains the model files/);
    expect(screen.queryByText(/Download the models/)).toBeNull();
    fireEvent.click(screen.getByText("Install from a folder…"));
    await waitFor(() => expect(mocks.install).toHaveBeenCalledWith());
    await waitFor(() => expect(mocks.commission).toHaveBeenCalled());
  });

  // QA de 0.8.0-2 : pendant que le sélecteur de dossier est ouvert, rien
  // n'est encore installé ; l'avancement n'apparaît qu'après le choix.
  it("shows no installation while the folder picker is open", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.install.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mocks.status = { ...mocks.status, downloadable: false };
    setup();
    fireEvent.click(await screen.findByText("Install from a folder…"));
    await waitFor(() => expect(mocks.install).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("on-device-install-progress")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
    // Dossier choisi : l'hôte rend un avancement.
    mocks.installProgress = { doneBytes: 0, totalBytes: 1_066_000_000 };
    await screen.findByTestId("on-device-install-progress", undefined, {
      timeout: 3000,
    });
    mocks.installProgress = null;
    finish({ status: "ok", data: null });
  });

  it("does nothing when the folder choice is cancelled", async () => {
    mocks.install.mockResolvedValue({ status: "ok", data: null });
    setup();
    fireEvent.click(await screen.findByText("Install from a folder…"));
    await waitFor(() => expect(mocks.install).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.commission).not.toHaveBeenCalled();
  });

  // Codes traduits, jamais le texte brut de Rust.
  it("explains an installation error in plain words", async () => {
    mocks.download.mockResolvedValue({
      status: "error",
      error: "models_mismatch",
    });
    setup();
    fireEvent.click(await screen.findByText("Download the models (1.1 GB)"));
    const alert = await screen.findByText(/models were not installed:/);
    expect(alert.textContent).toMatch(/does not match the expected file/);
    expect(alert.textContent).not.toMatch(/models_mismatch/);
  });

  // Issue 764 : mise à jour lancée hors ligne, rien de téléchargé : pas de
  // promesse de reprise, les modèles actuels restent en place.
  it("does not promise a resume when an offline update downloaded nothing", async () => {
    mocks.status = {
      ...mocks.status,
      models: {
        kind: "partial",
        presentBytes: 409_549,
        totalBytes: 1_066_110_000,
        resumable: false,
      },
    };
    mocks.download.mockResolvedValue({ status: "error", error: "network" });
    setup();
    fireEvent.click(await screen.findByText("Update the models"));
    const alert = await screen.findByText(/models were not installed:/);
    expect(alert.textContent).toMatch(/no connection to the download server/);
    expect(alert.textContent).toMatch(/current models are kept/);
    expect(alert.textContent).not.toMatch(/resumes where it stopped/);
    // Une seule phrase, un seul deux-points (issue 783).
    expect(alert.textContent?.split(":")).toHaveLength(2);
  });

  it("promises a resume when the failed download left a partial file", async () => {
    mocks.download.mockImplementation(async () => {
      mocks.status = {
        ...mocks.status,
        models: {
          kind: "partial",
          presentBytes: 340_000_000,
          totalBytes: 1_066_000_000,
          resumable: true,
        },
      };
      return { status: "error", error: "network" };
    });
    setup();
    fireEvent.click(await screen.findByText("Download the models (1.1 GB)"));
    const alert = await screen.findByText(/models were not installed:/);
    expect(alert.textContent).toMatch(/resumes where it stopped/);
  });

  // Issue 764 : le message neutre s'affiche dès l'échec, puis il est précisé
  // quand l'état relu arrive.
  it("shows the neutral message at once, then refines it with the fresh status", async () => {
    let release: () => void = () => {};
    mocks.download.mockImplementation(async () => {
      mocks.statusGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      mocks.status = {
        ...mocks.status,
        models: {
          kind: "partial",
          presentBytes: 340_000_000,
          totalBytes: 1_066_000_000,
          resumable: true,
        },
      };
      return { status: "error", error: "network" };
    });
    setup();
    fireEvent.click(await screen.findByText("Download the models (1.1 GB)"));
    const neutral = await screen.findByText(/models were not installed:/);
    expect(neutral.textContent).toMatch(/network or server/);
    expect(neutral.textContent).not.toMatch(
      /resumes where it stopped|no connection/,
    );

    release();
    await waitFor(() =>
      expect(
        screen.getByText(/models were not installed:/).textContent,
      ).toMatch(/resumes where it stopped/),
    );
  });

  it("shows the progress of the download and cancels it", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.download.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    setup();
    fireEvent.click(await screen.findByText("Download the models (1.1 GB)"));
    mocks.installProgress = {
      doneBytes: 340_000_000,
      totalBytes: 1_066_000_000,
    };
    await waitFor(() =>
      expect(
        screen.getByTestId("on-device-install-progress").textContent,
      ).toMatch(/340 MB of 1\.1 GB/),
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(mocks.cancel).toHaveBeenCalled();
    mocks.installProgress = null;
    finish({ status: "error", error: "cancelled" });
    await screen.findByText(
      /The models were not installed: installation cancelled/,
    );
    // Revue, R10 : l'avancement est oublié dès la fin, sans attendre la
    // lecture suivante.
    expect(screen.queryByTestId("on-device-install-progress")).toBeNull();
  });

  // QA 0.8.0-4 : fichiers d'une autre version gardés (montée des modèles),
  // rien d'interrompu : une mise à jour, pas une reprise ; la taille à
  // télécharger ne tombe pas à 0 MB.
  it("offers a model update when files of another version are present", async () => {
    mocks.status = {
      ...mocks.status,
      models: {
        kind: "partial",
        presentBytes: 409_549,
        totalBytes: 1_066_110_000,
        resumable: false,
      },
    };
    setup();
    await screen.findByText(
      "A model update is available (1.1 GB to download).",
    );
    expect(screen.queryByText("Resume the download")).toBeNull();
    expect(screen.queryByText(/partly installed/)).toBeNull();
    fireEvent.click(screen.getByText("Update the models"));
    await waitFor(() => expect(mocks.download).toHaveBeenCalled());
  });

  // Issue 698 : source choisie, modèles d'une version précédente. L'encart
  // dit « mise à jour », comme la carte, pas « modèles non installés ».
  it("says the models need an update in the paused-transcription alert", async () => {
    mocks.status = {
      ...mocks.status,
      models: {
        kind: "partial",
        presentBytes: 409_549,
        totalBytes: 1_066_110_000,
        resumable: false,
      },
    };
    mocks.config = { stt_on_device: true };
    setup();
    const alert = await screen.findByTestId("on-device-missing");
    expect(alert.textContent).toMatch(/its models need an update/);
    expect(alert.textContent).not.toMatch(/not installed/);
    expect(within(alert).getByText("Update the models")).toBeTruthy();
    expect(within(alert).queryByText("Download the models")).toBeNull();
  });

  it("never shows a non-empty remaining size as 0 MB", async () => {
    mocks.status = {
      ...mocks.status,
      models: {
        kind: "partial",
        presentBytes: 1_000_000,
        totalBytes: 1_400_000,
        resumable: false,
      },
    };
    setup();
    await screen.findByText("A model update is available (1 MB to download).");
  });

  it("offers to download missing models", async () => {
    setup();
    await screen.findByText(/are not installed yet/);
    expect(screen.queryByText("Update the models")).toBeNull();
    expect(screen.queryByText("Resume the download")).toBeNull();
    expect(screen.getByText(/^Download the models \(/)).toBeTruthy();
  });

  // QA 0.8.0-3 : les octets déjà téléchargés (fichiers .part) comptent, et la
  // carte dit que le téléchargement peut reprendre.
  it("counts an interrupted download and says it can be resumed", async () => {
    mocks.status = {
      ...mocks.status,
      models: {
        kind: "partial",
        presentBytes: 800_000_000,
        totalBytes: 1_066_000_000,
        resumable: true,
      },
    };
    setup();
    await screen.findByText(
      "Download interrupted: 800 MB of 1.1 GB downloaded. You can resume it.",
    );
    fireEvent.click(screen.getByText("Resume the download"));
    await waitFor(() => expect(mocks.download).toHaveBeenCalled());
  });

  it("shows the installed models and lets the user choose the source", async () => {
    mocks.status = { ...mocks.status, models: installed };
    setup();
    await screen.findByText("Models installed (1.1 GB).");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: true });
    fireEvent.click(screen.getByText("Remove the models"));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
    expect(mocks.setSettings).toHaveBeenCalledWith({ stt_on_device: false });
  });

  // La case reflète le réglage ; des modèles absents le disent et proposent
  // de les installer ou de revenir au serveur.
  it("offers to install or go back to the server when the chosen source has no models", async () => {
    mocks.config = { stt_on_device: true };
    setup();
    const alert = await screen.findByTestId("on-device-missing");
    expect(alert.textContent).toMatch(
      /models are not installed: live transcription is paused/,
    );
    expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(true);
    fireEvent.click(screen.getByText("Go back to the server"));
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
    mocks.status = { ...mocks.status, models: installed };
    setup();
    await waitFor(() =>
      expect(screen.getByTestId("on-device-commissioning").textContent).toMatch(
        /Measured: microphone and system audio, with speakers/,
      ),
    );
    fireEvent.click(screen.getByText("Measure again"));
    await waitFor(() => expect(mocks.commission).toHaveBeenCalled());
  });

  // QA de 0.8.0-2 : exécution refusée par le système pendant la mise en
  // service. Ni « trop lent » ni « Prêt » : la raison.
  it("shows a blocked execution instead of a too slow computer", async () => {
    mocks.status = { ...mocks.status, models: installed };
    mocks.config = { stt_on_device: true };
    mocks.commissioning = {
      profile: null,
      measures: [
        {
          profile: "two_streams_diarized",
          finals: 0,
          p95Ms: 0,
          driftMs: 0,
          rawP95Ms: 0,
          rawDriftMs: 0,
          passed: false,
          error: "execution_blocked",
        },
      ],
      measuredAt: 1,
    };
    setup();
    await waitFor(() =>
      expect(screen.getByTestId("on-device-commissioning").textContent).toMatch(
        /does not allow the transcription program to run/,
      ),
    );
    expect(screen.queryByText(/too slow/)).toBeNull();
    expect(screen.queryByText("Ready")).toBeNull();
    expect(screen.getByTestId("on-device-missing").textContent).toMatch(
      /does not allow the transcription program to run/,
    );
  });

  it("explains a blocked execution right after a measurement", async () => {
    mocks.status = { ...mocks.status, models: installed };
    mocks.commission.mockResolvedValue({
      status: "ok",
      data: {
        profile: null,
        measures: [
          {
            profile: "two_streams_diarized",
            finals: 0,
            p95Ms: 0,
            driftMs: 0,
            rawP95Ms: 0,
            rawDriftMs: 0,
            passed: false,
            error: "execution_blocked",
          },
        ],
        measuredAt: 2,
      },
    });
    setup();
    fireEvent.click(await screen.findByText("Measure again"));
    // QA 0.8.0-4 : pas de majuscule après les deux-points.
    await screen.findByText(
      /The measurement did not complete: this computer does not allow/,
    );
    expect(screen.queryByText(/Measurement done/)).toBeNull();
  });

  it("keeps the source off until the computer is measured", async () => {
    mocks.status = { ...mocks.status, models: installed };
    mocks.commissioning = null;
    setup();
    await screen.findByText(/has not been measured yet/);
    expect(screen.getByRole<HTMLInputElement>("checkbox").disabled).toBe(true);
  });

  it("unticks the source when the computer is too slow", async () => {
    mocks.status = { ...mocks.status, models: installed };
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
    mocks.status = { ...mocks.status, models: installed };
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
    mocks.status = { ...mocks.status, models: installed };
    mocks.progress = { current: 2, total: 4 };
    setup();
    expect(await screen.findByText("Measuring profile 2 of 4…")).toBeTruthy();
    const button = (await screen.findByText("Measure again")).closest(
      "button",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
