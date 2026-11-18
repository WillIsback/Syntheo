import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  managed: false,
  automaticUpdates: true,
  setAutomaticUpdates: vi.fn(),
  listening: false,
  openUrl: vi.fn(() => Promise.resolve({ status: "ok" })),
}));

vi.mock("~/db", () => ({
  useLiveQuery: ({ mapRows }: { mapRows: (rows: unknown[]) => unknown }) => ({
    data: mapRows(mocks.managed ? [{ managed: 1 }] : []),
  }),
}));

vi.mock("~/shared/config", () => ({
  useConfigValues: () => ({ automatic_updates: mocks.automaticUpdates }),
}));

vi.mock("~/settings/queries", () => ({
  useSetSettingValue: () => mocks.setAutomaticUpdates,
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: { live: { status: string } }) => unknown) =>
    selector({ live: { status: mocks.listening ? "active" : "inactive" } }),
}));

vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: mocks.openUrl },
}));

// Le store est remplacé par son état : on vérifie l'affichage et les actions.
vi.mock("~/services/updater/store", async () => {
  const { create } = await import("zustand");
  const useUpdater = create(() => ({
    phase: "idle",
    update: null,
    progress: null,
    error: null,
    check: vi.fn(),
    download: vi.fn(),
    install: vi.fn(),
  }));
  return { useUpdater };
});

import { UpdateSection } from "./update-section";

import { useUpdater } from "~/services/updater/store";

type Store = typeof useUpdater;
function setUpdater(state: Partial<ReturnType<Store["getState"]>>) {
  act(() => useUpdater.setState(state as never));
}

const UPDATE = {
  version: "0.7.4",
  notes: "- Sous-dossiers",
  date: null,
  installable: true,
  releaseUrl: "https://github.com/WillIsback/Syntheo/releases/tag/v0.7.4",
};

describe("UpdateSection", () => {
  beforeEach(() => {
    mocks.managed = false;
    mocks.automaticUpdates = true;
    mocks.listening = false;
    mocks.setAutomaticUpdates.mockReset();
    mocks.openUrl.mockClear();
    useUpdater.setState({
      phase: "idle",
      update: null,
      progress: null,
      error: null,
      check: vi.fn(),
      download: vi.fn(),
      install: vi.fn(),
    } as never);
  });
  afterEach(cleanup);

  it("shows the installed version and checks on demand", () => {
    render(<UpdateSection version="0.7.3" />);
    expect(screen.getByText("Installed version: 0.7.3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(useUpdater.getState().check).toHaveBeenCalledWith({ manual: true });

    setUpdater({ phase: "up_to_date" });
    expect(screen.getByRole("status").textContent).toBe(
      "Syntheo is up to date.",
    );
  });

  it("offers to download an installable update, then to install it", () => {
    render(<UpdateSection version="0.7.3" />);
    setUpdater({ phase: "available", update: UPDATE });
    expect(screen.getByRole("status").textContent).toContain(
      "Version 0.7.4 is available.",
    );
    expect(screen.getByText("- Sous-dossiers")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Download the update" }),
    );
    expect(useUpdater.getState().download).toHaveBeenCalled();

    setUpdater({
      phase: "downloading",
      progress: { downloaded: 50, total: 200 },
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Downloading… 25%",
    );

    setUpdater({ phase: "ready", progress: null });
    fireEvent.click(
      screen.getByRole("button", { name: "Install and restart" }),
    );
    expect(useUpdater.getState().install).toHaveBeenCalled();
  });

  it("never installs during a recording", () => {
    mocks.listening = true;
    render(<UpdateSection version="0.7.3" />);
    setUpdater({ phase: "ready", update: UPDATE });

    const install = screen.getByRole("button", { name: "Install and restart" });
    expect(install.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText(
        "A meeting is being recorded: install the update once it ends.",
      ),
    ).toBeTruthy();
  });

  it("only announces an update for .deb and MSI installs, with a link", () => {
    render(<UpdateSection version="0.7.3" />);
    setUpdater({
      phase: "available",
      update: { ...UPDATE, installable: false },
    });

    expect(
      screen.queryByRole("button", { name: "Download the update" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open the download page" }),
    );
    expect(mocks.openUrl).toHaveBeenCalledWith(UPDATE.releaseUrl, null);
  });

  it("shows a clear error after a manual check fails", () => {
    render(<UpdateSection version="0.7.3" />);
    setUpdater({ phase: "error", error: "network unreachable" });
    expect(screen.getByRole("status").textContent).toBe(
      "The update failed: network unreachable",
    );
  });

  it("toggles the startup check, unless the administrator set it", () => {
    const { unmount } = render(<UpdateSection version="0.7.3" />);
    const toggle = screen.getByRole("switch", {
      name: /Check for updates at startup/,
    });
    fireEvent.click(toggle);
    expect(mocks.setAutomaticUpdates).toHaveBeenCalledWith(false);
    unmount();

    mocks.managed = true;
    render(<UpdateSection version="0.7.3" />);
    const managed = screen.getByRole("switch", {
      name: /Check for updates at startup/,
    });
    expect(
      managed.hasAttribute("disabled") ||
        managed.getAttribute("aria-disabled") === "true",
    ).toBe(true);
    expect(screen.getByText("Set by your administrator.")).toBeTruthy();
  });
});
