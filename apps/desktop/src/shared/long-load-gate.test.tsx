import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getStartupStatus = vi.hoisted(() => vi.fn());
const waitUntilReady = vi.hoisted(() => vi.fn());

vi.mock("@syntheo/plugin-db", () => ({
  getStartupStatus,
  waitUntilReady,
}));

// Vraie traduction (catalogues compilés) pour l'écran d'erreur.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

const systemLanguages = vi.hoisted(() => ({ value: ["en-US"] }));
const catalogFails = vi.hoisted(() => ({ value: false }));
vi.mock("~/i18n/catalogs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/i18n/catalogs")>();
  return {
    ...actual,
    createI18n: (locale: Parameters<typeof actual.createI18n>[0]) =>
      catalogFails.value
        ? Promise.reject(new Error("catalogue illisible"))
        : actual.createI18n(locale),
  };
});
vi.mock("@syntheo/plugin-detect", () => ({
  commands: {
    getPreferredLanguages: async () => ({
      status: "ok",
      data: systemLanguages.value,
    }),
  },
}));

import { LONG_LOAD_SPLASH_DELAY_MS, LongLoadGate } from "./long-load-gate";

describe("LongLoadGate", () => {
  beforeEach(() => {
    systemLanguages.value = ["en-US"];
    catalogFails.value = false;
    getStartupStatus.mockReset();
    getStartupStatus.mockResolvedValue({
      phase: "preparing_database",
      migrationCurrent: null,
      migrationTotal: null,
    });
    waitUntilReady.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("skips the splash when startup finishes before the delay", async () => {
    waitUntilReady.mockResolvedValue(undefined);
    const bootSplash = document.createElement("div");
    bootSplash.id = "boot-splash";
    document.body.append(bootSplash);

    renderLongLoadGate();

    await waitFor(() => {
      expect(screen.getByText("app")).toBeTruthy();
      expect(document.getElementById("boot-splash")).toBeNull();
    });
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("shows the reported migration progress after the delay", async () => {
    let resolveReady!: () => void;
    waitUntilReady.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReady = resolve;
      }),
    );
    getStartupStatus.mockResolvedValue({
      phase: "migrating_database",
      migrationCurrent: 2,
      migrationTotal: 5,
    });
    vi.useFakeTimers();

    renderLongLoadGate();

    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
    expect(screen.queryByText("app")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LONG_LOAD_SPLASH_DELAY_MS);
    });
    // Le catalogue de démarrage se charge ensuite (import dynamique).
    await advanceUntil(() => screen.getByRole("status", { name: "Loading" }));
    expect(
      screen.getByText(
        "Migrating your local database (2 of 5). This may take a few minutes.",
      ),
    ).toBeTruthy();

    await act(async () => {
      resolveReady();
    });

    expect(screen.getByText("app")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("does not claim a migration while the database is only being checked", async () => {
    waitUntilReady.mockReturnValue(new Promise<void>(() => {}));
    vi.useFakeTimers();

    renderLongLoadGate();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LONG_LOAD_SPLASH_DELAY_MS);
    });
    await advanceUntil(() =>
      screen.getByText(
        "Checking your local database. This is taking longer than expected.",
      ),
    );
    expect(screen.queryByText(/Migrating your local database/)).toBeNull();
  });

  // Revue de 0.8.0-3 (constat 15) : l'écran d'attente, monté avant le
  // réglage de langue, suit la langue du système, lecteur d'écran compris.
  it("shows the waiting screen in the system language", async () => {
    systemLanguages.value = ["fr-FR"];
    waitUntilReady.mockReturnValue(new Promise<void>(() => {}));
    getStartupStatus.mockResolvedValue({
      phase: "migrating_database",
      migrationCurrent: 3,
      migrationTotal: 7,
    });
    const bootSplash = document.createElement("div");
    bootSplash.id = "boot-splash";
    document.body.append(bootSplash);
    vi.useFakeTimers();

    renderLongLoadGate();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LONG_LOAD_SPLASH_DELAY_MS);
    });
    const status = await advanceUntil(() =>
      screen.getByRole("status", { name: "Chargement" }),
    );
    expect(status.textContent).toMatch(/3 sur 7/);
    expect(document.body.textContent).not.toMatch(/Migrating|Loading/);
    expect(document.getElementById("boot-splash")).toBeNull();
  });

  it("keeps English on the waiting screen when the catalog cannot load", async () => {
    systemLanguages.value = ["fr-FR"];
    catalogFails.value = true;
    waitUntilReady.mockReturnValue(new Promise<void>(() => {}));
    vi.useFakeTimers();

    renderLongLoadGate();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LONG_LOAD_SPLASH_DELAY_MS);
    });
    await advanceUntil(() => screen.getByRole("status", { name: "Loading" }));
    expect(
      screen.getByText(
        "Checking your local database. This is taking longer than expected.",
      ),
    ).toBeTruthy();
  });

  it("shows an update prompt when startup reports a newer schema", async () => {
    waitUntilReady.mockRejectedValue(
      new Error(
        "the database was created by a newer version of Syntheo: it requires migration 1",
      ),
    );

    renderLongLoadGate();

    await waitFor(() => {
      expect(screen.getByText("Syntheo needs an update")).toBeTruthy();
    });
    expect(screen.queryByText("app")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restart App" })).toBeNull();
  });

  // QA de 0.8.0-2 : réglages gérés invalides. Message traduit dans la
  // langue du système, qui nomme le fichier sans en montrer le contenu.
  it("names an invalid managed settings file in the system language", async () => {
    systemLanguages.value = ["fr-FR"];
    waitUntilReady.mockRejectedValue(
      new Error(
        "encountered unexpected or invalid data: invalid managed settings file",
      ),
    );

    renderLongLoadGate();

    await waitFor(() => {
      expect(screen.getByText("Syntheo n'a pas pu démarrer")).toBeTruthy();
    });
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/managed_settings\.json/);
    expect(text).toMatch(/administrateur/);
    expect(text).not.toMatch(/invalid data/);
    expect(
      screen.getByRole("button", { name: "Redémarrer l'application" }),
    ).toBeTruthy();
  });

  // Vérification de f84794c4 : catalogue illisible, textes anglais et non
  // une fenêtre blanche.
  it("falls back to English when the catalog cannot load", async () => {
    systemLanguages.value = ["fr-FR"];
    catalogFails.value = true;
    waitUntilReady.mockRejectedValue(
      new Error(
        "encountered unexpected or invalid data: invalid managed settings file",
      ),
    );

    renderLongLoadGate();

    await waitFor(() => {
      expect(screen.getByText("Syntheo could not start")).toBeTruthy();
    });
    expect(document.body.textContent).toMatch(/managed_settings\.json/);
    expect(screen.getByRole("button", { name: "Restart App" })).toBeTruthy();
  });

  it("keeps the generic message in English for other startup errors", async () => {
    waitUntilReady.mockRejectedValue(new Error("disk I/O error"));

    renderLongLoadGate();

    await waitFor(() => {
      expect(screen.getByText("Syntheo could not start")).toBeTruthy();
    });
    expect(document.body.textContent).not.toMatch(/managed_settings/);
  });
});

// Sous horloge factice, React Query planifie ses notifications par
// setTimeout : on avance le temps jusqu'à ce que le catalogue de démarrage
// (import dynamique) soit chargé et l'écran affiché.
async function advanceUntil<T>(find: () => T): Promise<T> {
  return vi.waitFor(async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    return find();
  });
}

function renderLongLoadGate() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LongLoadGate>
        <div>app</div>
      </LongLoadGate>
    </QueryClientProvider>,
  );
}
