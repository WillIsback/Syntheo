import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  entries: [] as {
    version: string;
    date: string | null;
    summary: string | null;
    content: string;
  }[],
}));

vi.mock("./data", () => ({
  get changelogEntries() {
    return mocks.entries;
  },
}));

vi.mock("@syntheo/changelog", () => ({
  ChangelogContent: ({ content }: { content: string }) => <p>{content}</p>,
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({ chat: { mode: "FloatingClosed", sendEvent: vi.fn() } }),
}));

vi.mock("~/shared/main", () => ({
  StandardContentWrapper: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: { close: () => void }) => unknown) =>
    selector({ close: vi.fn() }),
}));

import { TabContentChangelog } from ".";

function renderTab() {
  const tab = {
    type: "changelog",
    state: { current: "0.7.1", previous: "0.7.1" },
  } as Parameters<typeof TabContentChangelog>[0]["tab"];
  return render(
    <I18nProvider i18n={i18n}>
      <TabContentChangelog tab={tab} />
    </I18nProvider>,
  );
}

describe("TabContentChangelog", () => {
  afterEach(cleanup);

  it("déplie la version la plus récente et replie les précédentes", () => {
    mocks.entries = [
      {
        version: "0.7.1",
        date: "2026-11-12",
        summary: "Résumé 0.7.1",
        content: "Contenu 0.7.1",
      },
      {
        version: "0.7.0",
        date: "2026-11-10",
        summary: null,
        content: "Contenu 0.7.0",
      },
    ];
    const { container } = renderTab();

    const latest = screen.getByText("Contenu 0.7.1");
    expect(latest.closest("details")).toBeNull();
    expect(screen.getByText("Résumé 0.7.1")).toBeTruthy();

    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(1);
    expect(details[0].open).toBe(false);
    expect(details[0].querySelector("summary")?.textContent).toContain("0.7.0");
    expect(details[0].textContent).toContain("Contenu 0.7.0");
  });

  it("signale l'absence de journal", () => {
    mocks.entries = [];
    renderTab();
    expect(
      screen.getByText("No changelog available for this version."),
    ).toBeTruthy();
  });
});
