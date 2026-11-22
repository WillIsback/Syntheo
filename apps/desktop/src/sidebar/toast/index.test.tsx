import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dismissToast: vi.fn(),
  openNew: vi.fn(),
  updateSettingsTabState: vi.fn(),
  clearDevtoolsPreview: vi.fn(),
  message: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
  dismissedToastIds: new Set<string>(),
  sessionMode: "inactive",
  live: {
    status: "inactive" as "inactive" | "active" | "finalizing",
    sessionId: null as string | null,
  },
  currentTab: {
    type: "empty",
  } as {
    type: string;
    id?: string;
    state?: { tab?: string; view?: { type: string } };
  },
  config: {
    current_llm_provider: "local" as string | null,
    current_llm_model: "model" as string | null,
    current_stt_provider: "local" as string | null,
    current_stt_model: "model" as string | null,
    stt_on_device: false as boolean,
  },
  onDevice: null as unknown,
  commissioning: null as unknown,
  onDeviceLoading: false,
  commissioningLoading: false,
}));

vi.mock("@syntheo/ui/components/ui/toast", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@syntheo/ui/components/ui/toast")>();
  return {
    ...actual,
    toast: {
      message: mocks.message,
      error: mocks.error,
      warning: mocks.warning,
      loading: mocks.loading,
      dismiss: mocks.dismiss,
    },
  };
});

vi.mock("~/shared/config", () => ({
  useConfigValues: () => mocks.config,
}));

vi.mock("~/store/zustand/devtools-toast-preview", () => ({
  useDevtoolsToastPreview: (
    selector: (state: { preview: null; clearPreview: () => void }) => unknown,
  ) =>
    selector({
      preview: null,
      clearPreview: mocks.clearDevtoolsPreview,
    }),
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (
    selector: (state: {
      currentTab: typeof mocks.currentTab;
      openNew: () => void;
      updateSettingsTabState: () => void;
    }) => unknown,
  ) =>
    selector({
      currentTab: mocks.currentTab,
      openNew: mocks.openNew,
      updateSettingsTabState: mocks.updateSettingsTabState,
    }),
}));

vi.mock("~/stt/capabilities", () => ({
  isConfiguredSttModel: (provider?: string | null, model?: string | null) =>
    !!provider && !!model,
  isSyntheoCloudSttModel: () => false,
}));

vi.mock("~/stt/useSTTConnection", () => ({
  useSTTConnection: () => ({
    serverConn:
      mocks.config.current_stt_provider && mocks.config.current_stt_model
        ? { provider: mocks.config.current_stt_provider }
        : null,
    // Comme useSTTConnection : l'état du poste ne compte que s'il est choisi.
    isLoading: !!mocks.config.stt_on_device && mocks.onDeviceLoading,
  }),
}));

vi.mock("~/stt/on-device", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/stt/on-device")>()),
  useOnDeviceStatus: () => ({
    data: mocks.onDevice,
    isLoading: mocks.onDeviceLoading,
  }),
  useOnDeviceCommissioning: () => ({
    data: mocks.commissioning,
    isLoading: mocks.commissioningLoading,
  }),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (
    selector: (state: {
      getSessionMode: () => string;
      live: typeof mocks.live;
    }) => unknown,
  ) => selector({ getSessionMode: () => mocks.sessionMode, live: mocks.live }),
}));

vi.mock("./useDismissedToasts", () => ({
  useDismissedToasts: () => ({
    dismissToast: mocks.dismissToast,
    isDismissed: (id: string) => mocks.dismissedToastIds.has(id),
  }),
}));

import { ToastNotifications } from "./index";

const storedValues = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storedValues.get(key) ?? null,
  setItem: (key: string, value: string) => storedValues.set(key, value),
  removeItem: (key: string) => storedValues.delete(key),
  clear: () => storedValues.clear(),
};

describe("ToastNotifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", localStorageMock);
    mocks.dismissToast.mockClear();
    mocks.message.mockClear();
    mocks.error.mockClear();
    mocks.warning.mockClear();
    mocks.loading.mockClear();
    mocks.dismiss.mockClear();
    mocks.dismissedToastIds.clear();
    localStorage.clear();
    mocks.live = { status: "inactive", sessionId: null };
    mocks.openNew.mockClear();
    mocks.updateSettingsTabState.mockClear();
    mocks.currentTab = { type: "empty" };
    mocks.config.current_llm_provider = "local";
    mocks.config.current_llm_model = "model";
    mocks.config.current_stt_provider = "local";
    mocks.config.current_stt_model = "model";
    mocks.config.stt_on_device = false;
    mocks.onDevice = null;
    mocks.commissioning = null;
    mocks.onDeviceLoading = false;
    mocks.commissioningLoading = false;
  });

  // QA de 0.8.0-2 (William) : seule la transcription sur ce poste, prête.
  it("asks for no transcription provider when this computer is ready", () => {
    mocks.config.current_stt_provider = null;
    mocks.config.current_stt_model = null;
    mocks.config.stt_on_device = true;
    mocks.onDevice = {
      allowed: true,
      companion: true,
      models: { kind: "installed", totalBytes: 1 },
      downloadable: true,
    };
    mocks.commissioning = {
      profile: "two_streams",
      measures: [],
      measuredAt: 1,
    };

    render(<ToastNotifications />);
    act(() => vi.advanceTimersByTime(500));

    const descriptions = mocks.message.mock.calls.map((call) => call[0]);
    expect(descriptions).not.toContain("Transcription provider needed");
  });

  // Revue de 8d988afd : « Sur ce poste » choisi mais pas mesuré a son propre
  // toast ; « Fournisseur requis » n'y changerait rien.
  it("says this computer is not ready when it is chosen but not measured", () => {
    mocks.config.current_stt_provider = null;
    mocks.config.current_stt_model = null;
    mocks.config.stt_on_device = true;
    mocks.onDevice = {
      allowed: true,
      companion: true,
      models: { kind: "installed", totalBytes: 1 },
      downloadable: true,
    };
    mocks.commissioning = { profile: null, measures: [], measuredAt: 1 };

    render(<ToastNotifications />);
    act(() => vi.advanceTimersByTime(500));

    const descriptions = mocks.message.mock.calls.map((call) => call[0]);
    expect(descriptions).not.toContain("Transcription provider needed");
    expect(descriptions).toContain(
      "Transcription on this computer is not ready",
    );
  });

  it("says this computer is not ready even with a configured server", () => {
    mocks.config.stt_on_device = true;
    mocks.onDevice = {
      allowed: true,
      companion: true,
      models: { kind: "missing", totalBytes: 1 },
      downloadable: true,
    };

    render(<ToastNotifications />);
    act(() => vi.advanceTimersByTime(500));

    const descriptions = mocks.message.mock.calls.map((call) => call[0]);
    expect(descriptions).not.toContain("Transcription provider needed");
    expect(descriptions).toContain(
      "Transcription on this computer is not ready",
    );
  });

  it("shows no transcription toast while the measurement loads", () => {
    mocks.config.current_stt_provider = null;
    mocks.config.current_stt_model = null;
    mocks.config.stt_on_device = true;
    mocks.onDevice = {
      allowed: true,
      companion: true,
      models: { kind: "installed", totalBytes: 1 },
      downloadable: true,
    };
    mocks.commissioning = undefined;
    mocks.commissioningLoading = true;

    render(<ToastNotifications />);
    act(() => vi.advanceTimersByTime(500));

    const descriptions = mocks.message.mock.calls.map((call) => call[0]);
    expect(descriptions).not.toContain("Transcription provider needed");
    expect(descriptions).not.toContain(
      "Transcription on this computer is not ready",
    );
  });

  it("asks for no provider while the state of this computer loads", () => {
    mocks.config.current_stt_provider = null;
    mocks.config.current_stt_model = null;
    mocks.config.stt_on_device = true;
    mocks.onDeviceLoading = true;

    render(<ToastNotifications />);
    act(() => vi.advanceTimersByTime(500));

    const descriptions = mocks.message.mock.calls.map((call) => call[0]);
    expect(descriptions).not.toContain("Transcription provider needed");
    expect(descriptions).not.toContain(
      "Transcription on this computer is not ready",
    );
  });

  it("asks for a provider without any transcription source", () => {
    mocks.config.current_stt_provider = null;
    mocks.config.current_stt_model = null;
    mocks.config.stt_on_device = false;

    render(<ToastNotifications />);
    act(() => vi.advanceTimersByTime(500));

    const descriptions = mocks.message.mock.calls.map((call) => call[0]);
    expect(descriptions).toContain("Transcription provider needed");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the latest registry action while a toast remains visible", () => {
    mocks.config.current_llm_provider = null;
    mocks.config.current_llm_model = null;

    const view = render(<ToastNotifications />);

    act(() => vi.advanceTimersByTime(500));

    const options = mocks.message.mock.calls[0][1];

    mocks.currentTab = { type: "settings", state: { tab: "general" } };
    view.rerender(<ToastNotifications />);

    options.action.onClick();

    expect(mocks.updateSettingsTabState).toHaveBeenCalledWith(
      mocks.currentTab,
      { tab: "intelligence" },
    );
    expect(mocks.openNew).not.toHaveBeenCalled();
  });
});
