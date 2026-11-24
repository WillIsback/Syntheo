import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SummarySwitcherView } from "./summary-switcher-view";

import { createI18n } from "~/i18n/catalogs";

// Passe QA 0.8.1-2 : l'onglet s'appelait « Résumé », la traduction de
// « Summary » sans contexte. Vrai catalogue français.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

afterEach(() => {
  i18n.activate("en");
});

function renderView(hasSummary: boolean) {
  render(
    <I18nProvider i18n={i18n}>
      <SummarySwitcherView
        view={{ kind: "summary" }}
        onSelectView={() => {}}
        currentVersion={1}
        currentDate={null}
        versions={[]}
        isGenerating={false}
        currentNoteId="summary-1"
        onSelectNote={() => {}}
        canCopy={false}
        canRemove={false}
        onCopy={() => {}}
        onRemove={() => {}}
        hasSummary={hasSummary}
      />
    </I18nProvider>,
  );
}

describe("SummarySwitcherView in French", () => {
  it("names the tab « Synthèse », with or without a version", async () => {
    await createI18n("fr");
    renderView(false);
    expect(screen.getByRole("button", { name: "Synthèse" })).toBeTruthy();
    expect(screen.queryByText("Résumé")).toBeNull();
  });

  it("keeps « Synthèse · v1 » once a summary exists", async () => {
    await createI18n("fr");
    renderView(true);
    expect(screen.getByRole("button", { name: "Synthèse · v1" })).toBeTruthy();
  });
});
