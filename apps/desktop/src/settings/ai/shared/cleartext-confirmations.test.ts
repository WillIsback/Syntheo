import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, string>,
  setSettingValues: vi.fn(async (values: Record<string, string>) => {
    Object.assign(mocks.values, values);
  }),
  execute: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: async () => ({
    values: mocks.values,
    hasValues: new Set(Object.keys(mocks.values)),
  }),
  setSettingValues: mocks.setSettingValues,
}));
vi.mock("~/db", () => ({ liveQueryClient: { execute: mocks.execute } }));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { warning: mocks.warning },
}));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: vi.fn() }) },
}));
vi.mock("@syntheo/plugin-store2", () => ({ commands: {} }));

import {
  confirmCleartextUrl,
  parseConfirmedCleartextUrls,
  promptLegacyCleartextUrls,
  unconfirmedCleartextUrls,
} from "./cleartext-confirmations";

import { providerStorageId } from "~/settings/providers-storage";

const row = (type: "stt" | "llm", id: string, baseUrl: string) => ({
  id: providerStorageId(type, id),
  value_json: JSON.stringify({ type, base_url: baseUrl, api_key: "" }),
});

beforeEach(() => {
  for (const key of Object.keys(mocks.values)) delete mocks.values[key];
  vi.clearAllMocks();
});

// Issue 665 : une adresse HTTP héritée demande une confirmation une seule
// fois.
describe("cleartext confirmations", () => {
  it("lists remote cleartext addresses never confirmed", () => {
    const rows = [
      row("stt", "nvidia", "http://192.168.1.87:8000/v1"),
      row("llm", "openai", "http://10.0.0.5:8080/v1"),
      row("stt", "local", "http://localhost:9000"),
      row("llm", "tls", "https://llm.example.com/v1"),
    ];
    expect(unconfirmedCleartextUrls(rows, new Set())).toEqual([
      "http://10.0.0.5:8080/v1",
      "http://192.168.1.87:8000/v1",
    ]);
    expect(
      unconfirmedCleartextUrls(rows, new Set(["http://10.0.0.5:8080/v1"])),
    ).toEqual(["http://192.168.1.87:8000/v1"]);
  });

  it("keeps a confirmation, once", async () => {
    await confirmCleartextUrl(" http://192.168.1.87:8000/v1 ");
    await confirmCleartextUrl("http://192.168.1.87:8000/v1");
    expect(mocks.setSettingValues).toHaveBeenCalledOnce();
    expect(
      parseConfirmedCleartextUrls(mocks.values.cleartext_http_confirmed),
    ).toEqual(new Set(["http://192.168.1.87:8000/v1"]));
    expect(parseConfirmedCleartextUrls("pas du json")).toEqual(new Set());
  });

  it("asks at startup only for addresses not yet confirmed", async () => {
    mocks.execute.mockResolvedValue([
      row("stt", "nvidia", "http://192.168.1.87:8000/v1"),
    ]);
    await promptLegacyCleartextUrls();
    expect(mocks.warning).toHaveBeenCalledOnce();
    const [, options] = mocks.warning.mock.calls[0] as [
      unknown,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    await vi.waitFor(() =>
      expect(mocks.values.cleartext_http_confirmed).toBeDefined(),
    );

    mocks.warning.mockClear();
    await promptLegacyCleartextUrls();
    expect(mocks.warning).not.toHaveBeenCalled();
  });
});
