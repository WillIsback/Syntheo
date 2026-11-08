import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/settings/hydration-boundary", () => ({
  SettingsHydrationBoundary: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("./general", () => ({
  SettingsAccount: () => <div>Account settings</div>,
  SettingsApp: () => (
    <div>
      Profile settings
      <div data-setting-id="spoken-languages">
        <button type="button">Remove French</button>
        <input aria-label="Add spoken language" />
      </div>
    </div>
  ),
  SettingsMeetings: () => null,
  SettingsNotifications: () => null,
  SettingsPermissions: () => null,
}));

vi.mock("./todo", () => ({ SettingsTodo: () => null }));
vi.mock("~/settings/ai/llm", () => ({ LLM: () => null }));
vi.mock("~/settings/ai/stt", () => ({ STT: () => null }));
vi.mock("~/settings/appearance", () => ({ SettingsAppearance: () => null }));
vi.mock("~/settings/developers", () => ({ SettingsDevelopers: () => null }));
vi.mock("~/settings/dictionary", () => ({ SettingsDictionary: () => null }));
vi.mock("~/settings/imports", () => ({ SettingsImports: () => null }));
vi.mock("~/settings/privacy", () => ({ SettingsPrivacy: () => null }));
vi.mock("~/shared/main", () => ({
  StandardContentWrapper: ({ children }: { children: React.ReactNode }) =>
    children,
}));

import { TabContentSettings } from "./index";

import { requestSettingFocus } from "~/settings/setting-focus";
import { createSettingsTab } from "~/store/zustand/tabs/test-utils";

describe("TabContentSettings", () => {
  afterEach(cleanup);

  // « Analyses » a été retiré : un onglet persisté avant la refonte (ou un
  // lien resté vers ces écrans) ouvre le profil au lieu d'une page vide.
  it.each(["insights", "stats"])(
    "opens the profile for the removed %s destination",
    (destination) => {
      render(
        <TabContentSettings
          tab={createSettingsTab({ state: { tab: destination as never } })}
        />,
      );
      expect(screen.getByText("Profile settings")).toBeTruthy();
    },
  );

  it("focuses the requested setting in the opened page", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    requestSettingFocus("spoken-languages");

    render(
      <TabContentSettings tab={createSettingsTab({ state: { tab: "app" } })} />,
    );

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText("Add spoken language"),
      ),
    );
  });

  // Issue 373 : arrivée depuis la recherche, défilement, surbrillance 2 s.
  it("fait défiler jusqu'au réglage demandé et le surligne", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    requestSettingFocus("spoken-languages");

    const { container } = render(
      <TabContentSettings tab={createSettingsTab({ state: { tab: "app" } })} />,
    );

    const row = container.querySelector("[data-setting-id='spoken-languages']");
    await waitFor(() =>
      expect(row?.hasAttribute("data-setting-highlight")).toBe(true),
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });
});
