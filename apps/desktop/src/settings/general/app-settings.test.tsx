import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: vi.fn(() => "macos"),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: mocks.platform,
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("1.4.31"),
}));

// La section « Mises à jour » a ses propres tests (update-section.test.tsx).
vi.mock("./update-section", () => ({
  UpdateSection: ({ version }: { version?: string }) => (
    <section data-testid="update-section" data-version={version} />
  ),
}));

import { AppSettingsView } from "./app-settings";

import { useTabs } from "~/store/zustand/tabs";

function setting(value = true) {
  return {
    value,
    onChange: vi.fn(),
  };
}

function renderAppSettings() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppSettingsView
        autostart={setting()}
        showAppInDock={setting()}
        showTrayIcon={setting()}
      />
    </QueryClientProvider>,
  );
}

describe("AppSettingsView", () => {
  afterEach(() => {
    cleanup();
    useTabs.setState({ tabs: [], currentTab: null });
    mocks.platform.mockReturnValue("macos");
  });

  it("reopens the installed version's release notes after closing them", async () => {
    renderAppSettings();
    const button = screen.getByRole("button", { name: "Show release notes" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    const tab = useTabs.getState().currentTab!;
    expect(tab).toMatchObject({
      type: "changelog",
      state: { current: "1.4.31" },
    });
    useTabs.getState().close(tab);
    fireEvent.click(button);
    expect(useTabs.getState().currentTab).toMatchObject({
      type: "changelog",
      state: { current: "1.4.31" },
    });
  });

  it("shows the update section with the installed version", async () => {
    renderAppSettings();

    await waitFor(() =>
      expect(screen.getByTestId("update-section").dataset.version).toBe(
        "1.4.31",
      ),
    );
  });
});
