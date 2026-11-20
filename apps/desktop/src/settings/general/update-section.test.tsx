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
    supported: true,
    loadSupport: vi.fn(),
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
      supported: true,
      loadSupport: vi.fn(),
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
    expect(screen.getByRole("listitem").textContent).toBe("Sous-dossiers");
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

  it("renders the release notes as Markdown, in a bounded scroll area", () => {
    render(<UpdateSection version="0.7.3" />);
    setUpdater({
      phase: "available",
      update: {
        ...UPDATE,
        notes: [
          "Les dossiers acceptent des sous-dossiers.",
          "",
          "## Dossiers",
          "",
          "- **Sous-dossiers :** un dossier peut en contenir d'autres.",
          "- Réglage `automatic_updates` à `false`.",
          "",
          "```",
          "~/.local/bin/Syntheo.AppImage",
          "```",
        ].join("\n"),
      },
    });

    const notes = screen.getByTestId("update-notes");
    expect(notes.className).toContain("max-h-72");
    expect(notes.className).toContain("overflow-y-auto");
    expect(
      screen.getByRole("heading", { level: 2, name: "Dossiers" }),
    ).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].querySelector("strong")?.textContent).toBe(
      "Sous-dossiers :",
    );
    expect(
      [...notes.querySelectorAll("code")].map((code) => code.textContent),
    ).toEqual(
      expect.arrayContaining([
        "automatic_updates",
        "false",
        expect.stringContaining("~/.local/bin/Syntheo.AppImage"),
      ]),
    );
    expect(notes.textContent).not.toMatch(/##|\*\*|`/);
  });

  it("never interprets raw HTML nor navigates the window from a link", () => {
    render(<UpdateSection version="0.7.3" />);
    setUpdater({
      phase: "available",
      update: {
        ...UPDATE,
        notes: [
          '<img src="https://evil.example/x.png" onerror="alert(1)">',
          '<a href="https://evil.example">piège</a>',
          "",
          "[Voir la release](https://github.com/WillIsback/Syntheo/releases)",
          "",
          "[Script](javascript:alert(1))",
        ].join("\n"),
      },
    });

    const notes = screen.getByTestId("update-notes");
    expect(notes.querySelector("img")).toBeNull();
    expect(notes.querySelector('[href^="https://evil"]')).toBeNull();
    expect(notes.querySelector('[href^="javascript"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Script" })).toBeNull();
    expect(notes.textContent).toContain("Script");

    const link = screen.getByRole("link", { name: "Voir la release" });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://github.com/WillIsback/Syntheo/releases",
      null,
    );
  });

  it("shows no notes block for empty or missing notes", () => {
    render(<UpdateSection version="0.7.3" />);
    for (const notes of [null, "", "  \n "]) {
      setUpdater({ phase: "available", update: { ...UPDATE, notes } });
      expect(screen.queryByTestId("update-notes")).toBeNull();
      expect(screen.queryByText(/What's new in/)).toBeNull();
    }
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

  // Issue 601 : un libellé traduit par code, sans le détail technique.
  it.each([
    [
      "signature",
      "The update's signature could not be verified: nothing was installed. Try again later; if it happens again, report it.",
    ],
    [
      "offline",
      "Can't reach the update server. Check your connection, then try again.",
    ],
    ["interrupted", "The download was interrupted. Try again."],
    [
      "manifest",
      "The update information could not be read. Try again later, or use the release page.",
    ],
    ["other", "The update failed. Try again, or use the release page."],
  ] as const)("explains the %s error", (code, message) => {
    render(<UpdateSection version="0.7.3" />);
    setUpdater({ phase: "error", error: code });
    expect(screen.getByRole("status").textContent).toBe(message);
  });

  it("never links to a manual download after a signature error", () => {
    render(<UpdateSection version="0.7.3" />);
    setUpdater({ phase: "error", error: "signature", update: UPDATE });
    expect(screen.queryByRole("button", { name: "Release page" })).toBeNull();
  });

  it("links the release page after an error, the release list without a known update", () => {
    render(<UpdateSection version="0.7.3" />);
    setUpdater({ phase: "error", error: "manifest", update: null });
    fireEvent.click(screen.getByRole("button", { name: "Release page" }));
    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://github.com/WillIsback/Syntheo/releases",
      null,
    );

    setUpdater({ phase: "error", error: "interrupted", update: UPDATE });
    fireEvent.click(screen.getByRole("button", { name: "Release page" }));
    expect(mocks.openUrl).toHaveBeenLastCalledWith(UPDATE.releaseUrl, null);
  });

  it("reads the build support on mount and hides the switch in a devtools build", () => {
    const loadSupport = vi.fn();
    setUpdater({ loadSupport } as never);
    render(<UpdateSection version="0.7.3-1" />);
    expect(loadSupport).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("switch", { name: /Check for updates at startup/ }),
    ).toBeTruthy();

    setUpdater({ supported: false, phase: "unavailable" } as never);
    expect(screen.getByRole("status").textContent).toBe(
      "Updates are not checked in this build.",
    );
    expect(
      screen.queryByRole("switch", { name: /Check for updates at startup/ }),
    ).toBeNull();
  });

  // Reprise QA de l'issue 601 : au premier rendu, ni interrupteur avant de connaître
  // le support du build, ni « unknown » pendant la lecture de la version.
  it("renders no startup switch while the build support is unknown", () => {
    setUpdater({ supported: null } as never);
    render(<UpdateSection version="0.7.3" />);
    expect(
      screen.queryByRole("switch", { name: /Check for updates at startup/ }),
    ).toBeNull();
    expect(
      screen.queryByText("Updates are not checked in this build."),
    ).toBeNull();

    setUpdater({ supported: true } as never);
    expect(
      screen.getByRole("switch", { name: /Check for updates at startup/ }),
    ).toBeTruthy();
  });

  it("renders no startup switch in a build without updates", () => {
    setUpdater({ supported: false, phase: "unavailable" } as never);
    render(<UpdateSection version="0.7.3-2" />);
    expect(
      screen.getByText("Updates are not checked in this build."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("switch", { name: /Check for updates at startup/ }),
    ).toBeNull();
  });

  it("says the version is unknown only when reading it failed", () => {
    const { rerender } = render(<UpdateSection version={undefined} />);
    expect(screen.queryByText(/Installed version/)).toBeNull();

    rerender(<UpdateSection version={undefined} versionFailed />);
    expect(screen.getByText("Installed version: unknown")).toBeTruthy();

    rerender(<UpdateSection version="0.7.3" />);
    expect(screen.getByText("Installed version: 0.7.3")).toBeTruthy();
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
