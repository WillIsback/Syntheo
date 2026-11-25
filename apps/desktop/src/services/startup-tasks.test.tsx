import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StartupTasks } from "./startup-tasks";

import { AppI18nProvider } from "~/i18n/provider";

// Passe QA 0.8.1-1 (issue 665) : l'invite des adresses HTTP héritées ne
// s'affichait jamais, la tâche traduisait avant le chargement du catalogue.

vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

vi.mock("~/settings/queries", () => ({
  useStoredSettingValues: () => ({
    values: { ui_language: "fr" },
    hasValues: new Set(["ui_language"]),
  }),
}));

// Chargement du catalogue retenu jusqu'à `release`, comme au lancement réel.
const catalog = vi.hoisted(() => ({
  release: () => {},
}));
vi.mock("~/i18n/catalogs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/i18n/catalogs")>();
  return {
    ...actual,
    createI18n: (locale: Parameters<typeof actual.createI18n>[0]) =>
      new Promise<Awaited<ReturnType<typeof actual.createI18n>>>((resolve) => {
        catalog.release = () => resolve(actual.createI18n(locale));
      }),
  };
});

// État de l'instance Lingui globale avant tout chargement de catalogue.
function forgetActiveLocale() {
  (i18n as unknown as { _locale: string })._locale = "";
}

afterEach(() => {
  i18n.activate("en");
});

describe("StartupTasks", () => {
  it("runs the startup tasks once the catalog is active, so they can translate", async () => {
    forgetActiveLocale();
    expect(() => t`Keep unencrypted HTTP`).toThrow(/without setting a locale/);

    const translated: string[] = [];
    const run = vi.fn(() => {
      translated.push(t`Keep unencrypted HTTP`);
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppI18nProvider>
          <StartupTasks run={run} />
        </AppI18nProvider>
      </QueryClientProvider>,
    );
    await act(async () => {});
    expect(run).not.toHaveBeenCalled();

    await act(async () => {
      catalog.release();
    });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(translated).toEqual(["Garder le HTTP non chiffré"]);
  });
});
