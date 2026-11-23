import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Issue 707 : intelligence_disabled, imposé par réglage géré, coupe aussi la
// sonde du serveur LLM et la liste de ses modèles ; la page Synthèse le dit au
// lieu d'offrir des choix dont l'écriture serait refusée.
const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  ready: true,
  probeServer: vi.fn(async () => ({
    ok: true as const,
    latencyMs: 5,
    protocol: null,
    models: ["m"],
  })),
  listCustomModels: vi.fn(async () => ({ models: ["m"], ignored: [] })),
  setSettingValues: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("~/settings/providers", () => ({
  useAiProviders: (kind: string) =>
    kind === "llm"
      ? { "llm:custom": { base_url: "http://gpu.local:8000/v1", api_key: "" } }
      : { "stt:openai": { base_url: "http://asr.local:9000/v1", api_key: "" } },
}));
vi.mock("~/settings/queries", () => ({
  useSettingsReady: () => mocks.ready,
  setSettingValues: mocks.setSettingValues,
  useSetSettingValue: () => vi.fn(),
}));
vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) => mocks.settings[key],
  useConfigValues: (keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, mocks.settings[key]])),
}));
vi.mock("~/settings/ai/shared/connection-test", () => ({
  probeServer: mocks.probeServer,
}));
vi.mock("~/settings/ai/shared/list-openai", () => ({
  listCustomModels: mocks.listCustomModels,
}));
vi.mock("./health", () => ({
  useConnectionHealth: () => ({ status: "idle" }),
}));
vi.mock("~/settings/ai/shared/server-address", () => ({
  ServerAddressForm: () => <div data-testid="server-address" />,
}));
vi.mock("~/settings/ai/shared/persist-selection", () => ({
  PersistAiSelection: () => null,
}));

import { LLM } from "./index";

import { useServerConnection } from "~/settings/ai/shared/server-connection";

function Probe({ kind }: { kind: "llm" | "stt" }) {
  const { state, disabled } = useServerConnection(kind);
  return (
    <span data-testid={kind}>
      {state.status}
      {disabled ? " disabled" : ""}
    </span>
  );
}

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe("intelligence_disabled", () => {
  beforeEach(() => {
    mocks.settings = {};
    mocks.ready = true;
    mocks.probeServer.mockClear();
    mocks.listCustomModels.mockClear();
    mocks.setSettingValues.mockClear();
  });
  afterEach(cleanup);

  it("ne sonde pas le serveur LLM, mais sonde toujours la transcription", async () => {
    mocks.settings = { intelligence_disabled: true };
    renderWithQuery(
      <>
        <Probe kind="llm" />
        <Probe kind="stt" />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("stt").textContent).toBe("connected"),
    );
    expect(mocks.probeServer).toHaveBeenCalledTimes(1);
    expect(mocks.probeServer).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stt" }),
      expect.anything(),
    );
    expect(screen.getByTestId("llm").textContent).toBe("untested disabled");
  });

  it("ne sonde pas le serveur LLM avant la lecture des réglages", async () => {
    mocks.ready = false;
    renderWithQuery(<Probe kind="llm" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.probeServer).not.toHaveBeenCalled();
  });

  it("la page Synthèse affiche le réglage géré, sans carte serveur ni requête", async () => {
    mocks.settings = { intelligence_disabled: true };
    renderWithQuery(<LLM />);
    expect(screen.getByRole("note").textContent).toBe(
      "Set by your administrator.",
    );
    expect(screen.queryByTestId("server-address")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.probeServer).not.toHaveBeenCalled();
    expect(mocks.listCustomModels).not.toHaveBeenCalled();
    expect(mocks.setSettingValues).not.toHaveBeenCalled();
  });

  it("sans réglage géré, la page sonde le serveur et liste ses modèles", async () => {
    renderWithQuery(<LLM />);
    expect(screen.getByTestId("server-address")).toBeTruthy();
    await waitFor(() => expect(mocks.listCustomModels).toHaveBeenCalled());
    expect(mocks.probeServer).toHaveBeenCalledWith(
      expect.objectContaining({ type: "llm" }),
      expect.anything(),
    );
    expect(screen.queryByRole("note")).toBeNull();
  });
});
