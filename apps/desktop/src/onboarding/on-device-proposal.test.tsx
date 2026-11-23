import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OnDeviceProposal } from "./on-device-proposal";

const mocks = vi.hoisted(() => ({
  serverConn: null as object | null,
  verdict: "propose" as "propose" | "refuse",
}));

vi.mock("~/stt/useSTTConnection", () => ({
  useSTTConnection: () => ({ serverConn: mocks.serverConn, isLoading: false }),
}));

vi.mock("~/stt/on-device", () => ({
  isOnDeviceInstallable: () => true,
  useOnDeviceStatus: () => ({ data: { allowed: true, companion: true } }),
  runOnDeviceProbe: async () => ({ verdict: { kind: mocks.verdict } }),
  isEligible: (probe: { verdict: { kind: string } }) =>
    probe.verdict.kind === "propose",
}));

async function probe() {
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(OnDeviceProposal),
    ),
  );
  fireEvent.click(
    screen.getByText(/Check whether this computer can transcribe on its own/),
  );
}

afterEach(() => {
  cleanup();
  mocks.serverConn = null;
  mocks.verdict = "propose";
});

// QA 0.8.0-3 : sans serveur de transcription, l'accueil ne parle pas d'un
// serveur qui n'existe pas.
describe("OnDeviceProposal", () => {
  it("poste capable, sans serveur : pas de « aussi » ni de serveur", async () => {
    await probe();
    expect(
      await screen.findByText(
        "This computer can transcribe your meetings on its own. You can set it up in Settings › Transcription.",
      ),
    ).toBeTruthy();
  });

  it("poste capable, avec serveur : « aussi, sans serveur »", async () => {
    mocks.serverConn = { provider: "nvidia" };
    await probe();
    expect(
      await screen.findByText(/can also transcribe your meetings on its own/),
    ).toBeTruthy();
  });

  it("poste incapable, sans serveur : invite à régler un serveur", async () => {
    mocks.verdict = "refuse";
    await probe();
    expect(
      await screen.findByText(/set up a transcription server in Settings/),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Syntheo uses your transcription server/),
    ).toBeNull();
  });

  it("poste incapable, avec serveur : Syntheo utilise ce serveur", async () => {
    mocks.verdict = "refuse";
    mocks.serverConn = { provider: "nvidia" };
    await probe();
    expect(
      await screen.findByText(/Syntheo uses your transcription server/),
    ).toBeTruthy();
  });
});
