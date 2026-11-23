import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Issue 646 : HTTP clair hors de cette machine confirmé avant
// l'enregistrement, puis signalé en permanence.
const mocks = vi.hoisted(() => ({
  saved: {} as Record<string, { base_url?: string; api_key?: string }>,
  mutateAsync: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
  setSettingValues: vi.fn(async () => undefined),
}));

vi.mock("~/settings/providers", () => ({
  useAiProvidersState: () => ({ providers: mocks.saved, isReady: true }),
  useSetAiProvider: () => ({
    mutateAsync: mocks.mutateAsync,
    reset: vi.fn(),
    error: null,
  }),
  useClearAiProvider: () => ({
    mutateAsync: mocks.clear,
    isPending: false,
    error: null,
  }),
  isKeychainAccessError: () => false,
  repairKeychainAccess: vi.fn(),
}));

vi.mock("~/settings/queries", () => ({
  setSettingValues: mocks.setSettingValues,
}));
vi.mock("~/shared/ui/settings-alert", () => ({
  SettingsAlertToast: () => null,
}));
vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: vi.fn(async () => undefined) },
}));

import { ServerAddressForm } from "./server-address";

function renderForm(managed?: boolean, selectionManaged?: boolean) {
  const client = new QueryClient();
  const tree = () => (
    <QueryClientProvider client={client}>
      <ServerAddressForm
        managed={managed}
        selectionManaged={selectionManaged}
        kind="stt"
        providerId="openai"
        label="Server address"
        placeholder="http://localhost:8000/v1"
        testing={false}
        onTest={vi.fn()}
        isCurrentProvider
      />
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, rerender: () => view.rerender(tree()) };
}

function typeAddress(value: string) {
  fireEvent.change(screen.getByPlaceholderText("http://localhost:8000/v1"), {
    target: { value },
  });
}

describe("ServerAddressForm, HTTP clair", () => {
  beforeEach(() => {
    mocks.saved = {};
    mocks.mutateAsync.mockClear();
  });
  afterEach(cleanup);

  it.each(["http://192.168.1.87:8000/v1", "http://gpu.tailnet.ts.net:8000/v1"])(
    "asks before saving %s, then shows a permanent notice",
    async (url) => {
      renderForm();
      typeAddress(url);

      const confirm = await screen.findByRole(
        "button",
        { name: "Use unencrypted HTTP anyway" },
        { timeout: 2000 },
      );
      expect(mocks.mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain(
        `Unencrypted connection to ${new URL(url).host}`,
      );

      fireEvent.click(confirm);
      await waitFor(() =>
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
          base_url: url,
          api_key: "",
        }),
      );
      expect(screen.getByRole("note").textContent).toContain(
        "Unencrypted connection",
      );
    },
  );

  it.each(["http://localhost:8000/v1", "https://asr.example.com/v1"])(
    "saves %s without any warning",
    async (url) => {
      renderForm();
      typeAddress(url);

      await waitFor(
        () =>
          expect(mocks.mutateAsync).toHaveBeenCalledWith({
            base_url: url,
            api_key: "",
          }),
        { timeout: 2000 },
      );
      expect(
        screen.queryByRole("button", { name: "Use unencrypted HTTP anyway" }),
      ).toBeNull();
      expect(screen.queryByRole("note")).toBeNull();
    },
  );

  it("keeps the permanent notice for an address saved before", () => {
    mocks.saved = { "stt:openai": { base_url: "http://192.168.1.87:8000/v1" } };
    renderForm();

    expect(screen.getByRole("note").textContent).toContain(
      "Unencrypted connection",
    );
    expect(
      screen.queryByRole("button", { name: "Use unencrypted HTTP anyway" }),
    ).toBeNull();
  });
});

// Issue 710 : adresse imposée par managed_settings.json.
describe("ServerAddressForm, adresse gérée", () => {
  beforeEach(() => {
    mocks.saved = {
      "stt:openai": { base_url: "https://asr.example.com/v1", api_key: "" },
    };
    mocks.mutateAsync.mockClear();
  });
  afterEach(cleanup);

  it("affiche l'adresse sans champ éditable ni « Réinitialiser »", () => {
    renderForm(true);

    expect(screen.getByTestId("server-address-managed").textContent).toBe(
      "https://asr.example.com/v1",
    );
    expect(
      screen.queryByPlaceholderText("http://localhost:8000/v1"),
    ).toBeNull();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Reset/ })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Test connection",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("garde la clé API saisissable, sans toucher à l'adresse", async () => {
    renderForm(true);

    fireEvent.change(screen.getByLabelText("API key (optional)"), {
      target: { value: "sk-poste" },
    });

    await waitFor(
      () =>
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
          base_url: "https://asr.example.com/v1",
          api_key: "sk-poste",
        }),
      { timeout: 2000 },
    );
    expect(
      screen.queryByRole("button", { name: "Use unencrypted HTTP anyway" }),
    ).toBeNull();
  });

  // Le formulaire garde l'adresse qu'il avait au montage : sans le
  // garde-fou de onSubmit, la saisie de la clé réécrirait cette adresse
  // périmée par-dessus celle qu'impose désormais la politique.
  it("enregistre la clé avec l'adresse imposée en vigueur, pas celle du montage", async () => {
    const view = renderForm(true);
    fireEvent.change(screen.getByLabelText("API key (optional)"), {
      target: { value: "sk-1" },
    });
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled(), {
      timeout: 2000,
    });
    mocks.mutateAsync.mockClear();

    mocks.saved = {
      "stt:openai": { base_url: "https://asr2.example.com/v1", api_key: "" },
    };
    view.rerender();
    fireEvent.change(screen.getByLabelText("API key (optional)"), {
      target: { value: "sk-2" },
    });

    await waitFor(
      () =>
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
          base_url: "https://asr2.example.com/v1",
          api_key: "sk-2",
        }),
      { timeout: 2000 },
    );
    expect(mocks.mutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ base_url: "https://asr.example.com/v1" }),
    );
  });

  // Politique limitée au protocole ou au modèle : l'adresse de ce
  // fournisseur n'est pas gérée. Elle reste saisissable, y compris quand une
  // adresse est déjà enregistrée à l'ouverture (remontage de la carte).
  it("adresse non gérée, déjà enregistrée : le champ reste saisissable", async () => {
    renderForm(false, true);

    expect(screen.queryByTestId("server-address-managed")).toBeNull();
    typeAddress("https://asr2.example.com/v1");
    await waitFor(
      () =>
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
          base_url: "https://asr2.example.com/v1",
          api_key: "",
        }),
      { timeout: 2000 },
    );
  });

  // Modèle géré : « Réinitialiser » oublie l'adresse sans tenter de vider le
  // modèle, que le déclencheur refuserait.
  it("modèle géré : « Réinitialiser » n'écrit pas le modèle", async () => {
    mocks.clear.mockClear();
    mocks.setSettingValues.mockClear();
    renderForm(false, true);

    fireEvent.click(screen.getByRole("button", { name: "Reset this server…" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(mocks.clear).toHaveBeenCalled());
    // Le bouton de confirmation disparaît une fois la réinitialisation finie.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Reset" })).toBeNull(),
    );
    expect(mocks.setSettingValues).not.toHaveBeenCalled();
  });

  it("modèle non géré : « Réinitialiser » vide le modèle courant", async () => {
    mocks.setSettingValues.mockClear();
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Reset this server…" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() =>
      expect(mocks.setSettingValues).toHaveBeenCalledWith({
        current_stt_model: "",
      }),
    );
  });

  it("non géré : champ d'adresse et « Réinitialiser » présents", () => {
    renderForm();

    expect(
      screen.getByPlaceholderText("http://localhost:8000/v1"),
    ).toBeTruthy();
    expect(screen.queryByTestId("server-address-managed")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Reset this server…" }),
    ).toBeTruthy();
  });
});
