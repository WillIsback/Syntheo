import { i18n } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppI18nProvider } from "./provider";

// test-setup.ts remplace Lingui par un faux (anglais figé) : ce test vérifie le
// vrai changement de langue.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

// Réglages stockés, modifiés par le test comme le ferait Paramètres › Profil.
const settings = vi.hoisted(() => ({
  current: {
    values: {} as Record<string, string>,
    hasValues: new Set<string>(),
  },
}));

vi.mock("~/settings/queries", () => ({
  useStoredSettingValues: () => settings.current,
}));

vi.mock("@syntheo/plugin-detect", () => ({
  commands: {
    getPreferredLanguages: vi.fn(async () => ({
      status: "ok",
      data: ["en-US"],
    })),
  },
}));

function setUiLanguage(value: string) {
  settings.current = {
    values: { ui_language: value },
    hasValues: new Set(["ui_language"]),
  };
}

function FileLabel() {
  const { t } = useLingui();
  return <span data-testid="label">{t`File`}</span>;
}

function renderApp() {
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AppI18nProvider>
        <FileLabel />
      </AppI18nProvider>
    </QueryClientProvider>,
  );
  const rerender = () =>
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <AppI18nProvider>
          <FileLabel />
        </AppI18nProvider>
      </QueryClientProvider>,
    );
  return { rerender };
}

async function switchTo(value: string, rerender: () => void) {
  setUiLanguage(value);
  await act(async () => {
    rerender();
  });
}

afterEach(() => {
  i18n.activate("en");
});

describe("AppI18nProvider", () => {
  // Issue 558 : de retour sur une langue déjà chargée (anglais → français →
  // automatique en anglais), le catalogue en cache n'était pas réactivé et
  // l'interface restait en français jusqu'au rechargement.
  it("applies a language whose catalog is already cached, in both directions", async () => {
    setUiLanguage("en");
    const { rerender } = renderApp();
    expect(await screen.findByText("File", {}, { timeout: 5000 })).toBeTruthy();

    await switchTo("fr", rerender);
    expect(
      await screen.findByText("Fichier", {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(i18n.locale).toBe("fr");

    await switchTo("auto", rerender);
    expect(await screen.findByText("File", {}, { timeout: 5000 })).toBeTruthy();
    expect(i18n.locale).toBe("en");

    await switchTo("fr", rerender);
    expect(
      await screen.findByText("Fichier", {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(i18n.locale).toBe("fr");
  }, 30_000);
});
