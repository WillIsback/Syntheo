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

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ServerAddressForm
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
