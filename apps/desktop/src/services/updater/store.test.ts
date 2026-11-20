import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updaterCheck: vi.fn(),
  updaterSupported: vi.fn(async () => true),
  updaterDownload: vi.fn(),
  updaterInstall: vi.fn(),
  installUpdateAndRelaunch: vi.fn(async (install: () => Promise<void>) => {
    await install();
  }),
  status: "inactive",
  channel: null as null | { onmessage?: (event: unknown) => void },
}));

vi.mock("~/types/tauri.gen", () => ({
  commands: {
    updaterCheck: mocks.updaterCheck,
    updaterSupported: mocks.updaterSupported,
    updaterDownload: mocks.updaterDownload,
    updaterInstall: mocks.updaterInstall,
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage?: (event: unknown) => void;
    constructor() {
      mocks.channel = this;
    }
  },
}));

vi.mock("~/shared/relaunch", () => ({
  installUpdateAndRelaunch: mocks.installUpdateAndRelaunch,
}));

vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: {
    getState: () => ({ live: { status: mocks.status } }),
  },
}));

import { useUpdater } from "./store";

const AVAILABLE = {
  status: "available",
  version: "0.7.4",
  notes: "notes",
  date: "2026-12-01T10:00:00Z",
  installable: true,
  release_url: "https://github.com/WillIsback/Syntheo/releases/tag/v0.7.4",
  downloaded: false,
};

describe("updater store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = "inactive";
    useUpdater.setState({
      phase: "idle",
      update: null,
      progress: null,
      error: null,
      supported: null,
    });
  });

  it("reports an available update", async () => {
    mocks.updaterCheck.mockResolvedValue({ status: "ok", data: AVAILABLE });
    await useUpdater.getState().check({ manual: true });

    expect(useUpdater.getState()).toMatchObject({
      phase: "available",
      update: {
        version: "0.7.4",
        installable: true,
        releaseUrl: AVAILABLE.release_url,
      },
    });
  });

  it("reports up to date and unavailable (devtools build)", async () => {
    mocks.updaterCheck.mockResolvedValue({
      status: "ok",
      data: { status: "up_to_date" },
    });
    await useUpdater.getState().check({ manual: true });
    expect(useUpdater.getState().phase).toBe("up_to_date");

    mocks.updaterCheck.mockResolvedValue({
      status: "ok",
      data: { status: "unavailable" },
    });
    await useUpdater.getState().check({ manual: false });
    expect(useUpdater.getState().phase).toBe("unavailable");
  });

  it("fails silently on an automatic check, clearly on a manual one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.updaterCheck.mockResolvedValue({
      status: "error",
      error: "offline",
    });

    await useUpdater.getState().check({ manual: false });
    expect(useUpdater.getState()).toMatchObject({ phase: "idle", error: null });

    await useUpdater.getState().check({ manual: true });
    expect(useUpdater.getState()).toMatchObject({
      phase: "error",
      error: "offline",
    });
    warn.mockRestore();
  });

  it("downloads with progress, then installs and relaunches", async () => {
    mocks.updaterCheck.mockResolvedValue({ status: "ok", data: AVAILABLE });
    mocks.updaterDownload.mockImplementation(async () => {
      mocks.channel?.onmessage?.({
        event: "progress",
        downloaded: 10,
        total: 100,
      });
      expect(useUpdater.getState().progress).toEqual({
        downloaded: 10,
        total: 100,
      });
      return { status: "ok", data: null };
    });
    mocks.updaterInstall.mockResolvedValue({ status: "ok", data: null });

    await useUpdater.getState().check({ manual: true });
    await useUpdater.getState().download();
    expect(useUpdater.getState().phase).toBe("ready");

    await useUpdater.getState().install();
    expect(mocks.installUpdateAndRelaunch).toHaveBeenCalled();
    expect(mocks.updaterInstall).toHaveBeenCalled();
  });

  it("does not download an announce-only update (.deb, MSI)", async () => {
    mocks.updaterCheck.mockResolvedValue({
      status: "ok",
      data: { ...AVAILABLE, installable: false },
    });
    await useUpdater.getState().check({ manual: true });
    await useUpdater.getState().download();

    expect(mocks.updaterDownload).not.toHaveBeenCalled();
    expect(useUpdater.getState().phase).toBe("available");
  });

  it.each(["active", "finalizing"])(
    "never installs while the listener is %s",
    async (status) => {
      useUpdater.setState({ phase: "ready" });
      mocks.status = status;

      await useUpdater.getState().install();

      expect(mocks.updaterInstall).not.toHaveBeenCalled();
      expect(mocks.installUpdateAndRelaunch).not.toHaveBeenCalled();
      expect(useUpdater.getState().phase).toBe("ready");
    },
  );

  it("keeps the error when the installation fails", async () => {
    useUpdater.setState({ phase: "ready" });
    mocks.updaterInstall.mockResolvedValue({
      status: "error",
      error: "signature",
    });

    await useUpdater.getState().install();
    expect(useUpdater.getState()).toMatchObject({
      phase: "error",
      error: "signature",
    });
  });

  // Issue 601 : « Rechercher des mises à jour… » depuis la zone de
  // notification ne fait plus retélécharger une version déjà prête.
  it("stays ready when a new check finds the version already downloaded", async () => {
    useUpdater.setState({ phase: "ready" });
    mocks.updaterCheck.mockResolvedValue({
      status: "ok",
      data: { ...AVAILABLE, downloaded: true },
    });

    await useUpdater.getState().check({ manual: true });

    expect(useUpdater.getState()).toMatchObject({
      phase: "ready",
      update: { version: "0.7.4" },
    });
  });

  it("keeps the download error code and maps an interface failure to other", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useUpdater.setState({
      phase: "available",
      update: {
        version: "0.7.4",
        notes: null,
        date: null,
        installable: true,
        releaseUrl: AVAILABLE.release_url,
      },
    });
    mocks.updaterDownload.mockResolvedValue({
      status: "error",
      error: "interrupted",
    });
    await useUpdater.getState().download();
    expect(useUpdater.getState().error).toBe("interrupted");

    useUpdater.setState({ phase: "ready" });
    mocks.installUpdateAndRelaunch.mockRejectedValueOnce(
      new Error("relaunch failed"),
    );
    await useUpdater.getState().install();
    expect(useUpdater.getState()).toMatchObject({
      phase: "error",
      error: "other",
    });
  });

  it("shows a devtools build as unavailable as soon as support is read", async () => {
    mocks.updaterSupported.mockResolvedValueOnce(false);

    await useUpdater.getState().loadSupport();

    expect(useUpdater.getState()).toMatchObject({
      supported: false,
      phase: "unavailable",
    });
    expect(mocks.updaterCheck).not.toHaveBeenCalled();
  });
});
