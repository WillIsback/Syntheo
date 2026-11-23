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
}));

vi.mock("~/settings/providers", () => ({
  useAiProvidersState: () => ({ providers: mocks.saved, isReady: true }),
  useSetAiProvider: () => ({
    mutateAsync: mocks.mutateAsync,
    reset: vi.fn(),
    error: null,
  }),
  useClearAiProvider: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
  isKeychainAccessError: () => false,
  repairKeychainAccess: vi.fn(),
}));

vi.mock("~/settings/queries", () => ({ setSettingValues: vi.fn() }));
vi.mock("~/shared/ui/settings-alert", () => ({
  SettingsAlertToast: () => null,
}));
vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: vi.fn(async () => undefined) },
}));

import { ServerAddressForm } from "./server-address";

function renderForm(managed?: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ServerAddressForm
        managed={managed}
        kind="stt"
        providerId="openai"
        label="Server address"
        placeholder="http://localhost:8000/v1"
        testing={false}
        onTest={vi.fn()}
        isCurrentProvider
      />
    </QueryClientProvider>,
  );
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
