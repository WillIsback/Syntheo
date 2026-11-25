import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWebhook: vi.fn(),
  listWebhooks: vi.fn(),
}));

vi.mock("@syntheo/plugin-local-api", () => ({
  commands: {
    listWebhooks: mocks.listWebhooks,
    createWebhook: mocks.createWebhook,
    deleteWebhook: vi.fn(),
    setWebhookActive: vi.fn(),
    testWebhook: vi.fn(),
  },
}));
vi.mock("@syntheo/plugin-opener2", () => ({ commands: { openUrl: vi.fn() } }));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@syntheo/ui/components/ui/toast";

import { WebhooksSection } from "./webhooks";

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WebhooksSection />
    </QueryClientProvider>,
  );
}

const webhook = (url: string) => ({
  id: url,
  url,
  events: [],
  active: true,
  created_at: "2026-11-24T10:00:00Z",
  last_delivery_at: null,
  last_delivery_status: "",
});

beforeEach(() => {
  mocks.listWebhooks.mockResolvedValue({ status: "ok", data: [] });
  mocks.createWebhook.mockResolvedValue({
    status: "ok",
    data: { info: webhook("http://192.168.1.10/hook"), secret: "whsec_x" },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Issue 703 : même règle et même confirmation que les serveurs d'inférence.
describe("WebhooksSection", () => {
  it("asks to confirm a private cleartext address before creating it", async () => {
    renderSection();
    fireEvent.change(
      screen.getByPlaceholderText("https://example.com/webhooks/syntheo"),
      { target: { value: "http://192.168.1.10/hook" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));

    await screen.findByText(/Unencrypted connection to 192.168.1.10/);
    expect(mocks.createWebhook).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Use unencrypted HTTP anyway" }),
    );
    await waitFor(() =>
      expect(mocks.createWebhook).toHaveBeenCalledWith(
        "http://192.168.1.10/hook",
        [],
      ),
    );
  });

  // Passe QA 0.8.1-1 : une adresse publique en HTTP affichait l'encart de
  // confirmation, puis le refus du Rust en anglais.
  it("refuses a public cleartext address directly, in a translated message", async () => {
    renderSection();
    fireEvent.change(
      screen.getByPlaceholderText("https://example.com/webhooks/syntheo"),
      { target: { value: "http://203.0.113.5/x" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Use HTTPS: plain HTTP is only accepted on this computer or a private network.",
      ),
    );
    expect(screen.queryByText(/Unencrypted connection/)).toBeNull();
    expect(mocks.createWebhook).not.toHaveBeenCalled();
  });

  it("translates an address refusal from the backend", async () => {
    mocks.createWebhook.mockResolvedValue({
      status: "error",
      error:
        "unencrypted HTTP is only allowed to this machine or a private network",
    });
    renderSection();
    fireEvent.change(
      screen.getByPlaceholderText("https://example.com/webhooks/syntheo"),
      { target: { value: "https://n8n.example.com/hook" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Use HTTPS: plain HTTP is only accepted on this computer or a private network.",
      ),
    );
  });

  it("creates an HTTPS webhook without confirmation", async () => {
    renderSection();
    fireEvent.change(
      screen.getByPlaceholderText("https://example.com/webhooks/syntheo"),
      { target: { value: "https://n8n.example.com/hook" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));
    await waitFor(() => expect(mocks.createWebhook).toHaveBeenCalledOnce());
  });

  it("marks a legacy public cleartext webhook as blocked", async () => {
    mocks.listWebhooks.mockResolvedValue({
      status: "ok",
      data: [
        webhook("http://example.com/hook"),
        webhook("http://n8n.local/hook"),
      ],
    });
    renderSection();
    await screen.findByText("http://example.com/hook");
    expect(document.querySelectorAll("[data-webhook-blocked]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-cleartext-notice]")).toHaveLength(
      1,
    );
  });
});
