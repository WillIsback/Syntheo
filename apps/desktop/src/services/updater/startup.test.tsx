import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ready: true,
  automaticUpdates: true,
  check: vi.fn(),
  loadSupport: vi.fn(),
  openNew: vi.fn(),
  listeners: new Map<string, () => void>(),
}));

vi.mock("~/settings/queries", () => ({
  useSettingsReady: () => mocks.ready,
}));

vi.mock("~/shared/config", () => ({
  useConfigValues: () => ({ automatic_updates: mocks.automaticUpdates }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: () => void) => {
    mocks.listeners.set(event, handler);
    return Promise.resolve(() => mocks.listeners.delete(event));
  },
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: {
    getState: () => ({
      currentTab: null,
      openNew: mocks.openNew,
      updateSettingsTabState: vi.fn(),
    }),
  },
}));

vi.mock("./store", () => ({
  useUpdater: {
    getState: () => ({ check: mocks.check, loadSupport: mocks.loadSupport }),
  },
}));

import {
  CHECK_UPDATES_EVENT,
  resetStartupUpdateCheck,
  useTrayUpdateCheck,
  STARTUP_CHECK_DELAY_MS,
  useStartupUpdateCheck,
} from "./startup";

function Probe() {
  useStartupUpdateCheck();
  return null;
}

describe("startup update check", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStartupUpdateCheck();
    mocks.ready = true;
    mocks.automaticUpdates = true;
    mocks.check.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // Reprise QA de l'issue 601 : le support est lu dès le démarrage, même sans
  // vérification automatique, avant l'ouverture des Paramètres.
  it("reads the build support at startup, whatever the startup check setting", () => {
    mocks.automaticUpdates = false;
    mocks.loadSupport.mockClear();
    render(<Probe />);
    expect(mocks.loadSupport).toHaveBeenCalledTimes(1);
  });

  it("checks once, silently, a while after startup", () => {
    const { rerender } = render(<Probe />);
    expect(mocks.check).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS));
    expect(mocks.check).toHaveBeenCalledExactlyOnceWith({ manual: false });

    rerender(<Probe />);
    act(() => vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS * 2));
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it("does not check when the setting or the administrator turns it off", () => {
    mocks.automaticUpdates = false;
    render(<Probe />);
    act(() => vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS * 2));
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("waits for the settings to load", () => {
    mocks.ready = false;
    render(<Probe />);
    act(() => vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS * 2));
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("opens the update settings and checks when asked from the tray", async () => {
    function TrayProbe() {
      useTrayUpdateCheck();
      return null;
    }
    render(<TrayProbe />);
    await act(async () => {});

    mocks.listeners.get(CHECK_UPDATES_EVENT)!();
    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "app" },
    });
    expect(mocks.check).toHaveBeenCalledWith({ manual: true });
  });
});
