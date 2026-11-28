import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LlmServerCard } from "./server-card";

import { IMAGE_INPUT_PROBE_QUESTION } from "~/settings/ai/shared/image-input";

// Issue 803 : « Saisir un autre nom » enregistrait le modèle à chaque
// frappe, et chaque nom intermédiaire relançait la détection des images.
// La carte, le champ, la détection et l'envoi de l'image de test sont les
// vrais ; seuls le stockage des réglages, l'état de connexion et le réseau
// (plugin HTTP de Tauri) sont simulés.

const { BASE, LISTED } = vi.hoisted(() => ({
  BASE: "https://gpu.exemple.fr/v1",
  LISTED: "modele-liste",
}));

const store = vi.hoisted(() => {
  let settings: Record<string, string> = {};
  const listeners = new Set<() => void>();
  return {
    get: () => settings,
    reset: (next: Record<string, string>) => {
      settings = next;
    },
    set: (patch: Record<string, string>) => {
      settings = { ...settings, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

vi.mock("~/shared/config", () => {
  const useSettings = () => useSyncExternalStore(store.subscribe, store.get);
  return {
    useConfigValue: (key: string) => useSettings()[key],
    useConfigValues: (keys: readonly string[]) => {
      const settings = useSettings();
      return Object.fromEntries(keys.map((key) => [key, settings[key]]));
    },
  };
});

vi.mock("~/settings/queries", () => ({
  updateSettingValue: async (
    key: string,
    update: (current: string | undefined) => string,
  ) => {
    const next = update(store.get()[key]);
    store.set({ [key]: next });
    return next;
  },
  setSettingValues: async (patch: Record<string, string>) => {
    store.set(patch);
  },
  useSettingsReady: () => true,
  useSetSettingValue: () => vi.fn(),
  useSetSettingValues: () => vi.fn(),
}));

vi.mock("~/settings/ai/shared/server-connection", () => ({
  useServerConnection: () => ({
    state: { status: "connected", latencyMs: 5, models: [LISTED] },
    baseUrl: BASE,
    apiKey: "",
    disabled: false,
    test: vi.fn(),
  }),
}));

vi.mock("~/settings/ai/shared/server-address", () => ({
  ServerAddressForm: () => null,
}));

vi.mock("~/settings/ai/shared/list-openai", () => ({
  listCustomModels: vi.fn().mockResolvedValue({ models: [LISTED] }),
}));

vi.mock("./health", () => ({
  useConnectionHealth: () => ({ status: "ok" }),
}));

/** Modèles reçus par l'envoi de l'image de test (la sonde). */
let probedModels: string[] = [];

beforeEach(() => {
  probedModels = [];
  store.reset({
    current_llm_provider: "custom",
    current_llm_model: LISTED,
    // Le modèle de la liste a déjà son résultat : seul un nouveau nom
    // déclenche la détection.
    llm_image_input: JSON.stringify({
      [`${BASE}|${LISTED}`]: {
        detected: {
          reads: true,
          source: "probe",
          checkedAt: "2026-11-26T10:00:00.000Z",
        },
      },
    }),
  });
  vi.mocked(tauriFetch).mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/chat/completions")) {
      const body = JSON.parse(init?.body as string) as {
        model: string;
        messages: Array<{ content: Array<{ text?: string }> }>;
      };
      if (body.messages[0]?.content[0]?.text === IMAGE_INPUT_PROBE_QUESTION) {
        probedModels.push(body.model);
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Blue" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // Pas de métadonnées (comme vLLM) : la détection passe à la sonde.
    return new Response("not found", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.mocked(tauriFetch).mockReset();
});

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <LlmServerCard />
    </QueryClientProvider>,
  );
}

async function typeName(input: HTMLElement, name: string) {
  for (const step of ["fa", "faux", "faux-", name]) {
    fireEvent.change(input, { target: { value: step } });
    // Laisse partir une éventuelle détection entre deux frappes.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

it("ne sonde pas les noms intermédiaires, et une seule fois après Entrée", async () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Enter another name" }));
  const input = screen.getByRole("textbox", { name: "Model name" });

  await typeName(input, "faux-neuf");

  expect(probedModels).toEqual([]);
  expect(store.get().current_llm_model).toBe(LISTED);

  fireEvent.keyDown(input, { key: "Enter" });

  await waitFor(() => expect(probedModels).toEqual(["faux-neuf"]));
  expect(store.get().current_llm_model).toBe("faux-neuf");
  // La perte du focus après Entrée ne relance rien.
  fireEvent.blur(input);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(probedModels).toEqual(["faux-neuf"]);
});

it("enregistre le nom saisi à la perte du focus", async () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Enter another name" }));
  const input = screen.getByRole("textbox", { name: "Model name" });

  await typeName(input, "faux-neuf");
  expect(probedModels).toEqual([]);

  fireEvent.blur(input);

  await waitFor(() => expect(probedModels).toEqual(["faux-neuf"]));
  expect(store.get().current_llm_model).toBe("faux-neuf");
});

it("ouvrir le champ puis le quitter sans rien saisir garde le modèle", async () => {
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Enter another name" }));
  fireEvent.blur(screen.getByRole("textbox", { name: "Model name" }));

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(store.get().current_llm_model).toBe(LISTED);
  expect(probedModels).toEqual([]);
});

it("quitter le champ pour un modèle de la liste ne sonde pas le nom saisi", async () => {
  store.set({ current_llm_model: "autre-modele" });
  renderCard();
  const input = screen.getByRole("textbox", { name: "Model name" });

  await typeName(input, "faux-neuf");
  const radio = screen.getByRole("radio", { name: LISTED });
  fireEvent.blur(input, { relatedTarget: radio });
  fireEvent.click(radio);

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(store.get().current_llm_model).toBe(LISTED);
  // « autre-modele », sans résultat gardé, est sondé à l'ouverture ; aucun
  // nom saisi ne l'est.
  expect(probedModels).toEqual(["autre-modele"]);
});
