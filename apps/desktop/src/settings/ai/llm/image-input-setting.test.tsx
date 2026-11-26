import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ImageInputSetting } from "./image-input-setting";

// Issue 754 : le réglage dans la carte « Mon serveur ». La sonde est simulée,
// le stockage du réglage aussi ; le reste (décision, textes) est réel.

const mocks = vi.hoisted(() => ({
  stored: "{}",
  detect: vi.fn(),
  updateSettingValue: vi.fn(),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: () => mocks.stored,
}));

vi.mock("~/settings/queries", () => ({
  updateSettingValue: mocks.updateSettingValue,
}));

vi.mock("~/settings/ai/shared/image-input", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/settings/ai/shared/image-input")
  >()),
  detectImageInput: mocks.detect,
}));

const BASE = "http://gpu.exemple.fr:8000/v1";
const MODEL = "qwen3.8-flash";
const KEY = `${BASE}|${MODEL}`;

beforeEach(() => {
  mocks.stored = "{}";
  mocks.detect.mockReset();
  mocks.updateSettingValue.mockReset();
  // Applique la mise à jour comme le ferait le stockage.
  mocks.updateSettingValue.mockImplementation(
    async (_key: string, update: (current: string) => string) => {
      mocks.stored = update(mocks.stored);
      return mocks.stored;
    },
  );
});

afterEach(cleanup);

function setup(connected = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ImageInputSetting
        baseUrl={BASE}
        apiKey=""
        model={MODEL}
        connected={connected}
      />
    </QueryClientProvider>,
  );
}

it("checks the server once in Automatic and keeps the result", async () => {
  mocks.detect.mockResolvedValue({
    reads: true,
    source: "probe",
    checkedAt: "2026-11-26T10:00:00.000Z",
  });
  setup();

  await waitFor(() =>
    expect(JSON.parse(mocks.stored)[KEY]?.detected?.reads).toBe(true),
  );
  expect(mocks.detect).toHaveBeenCalledWith({
    baseUrl: BASE,
    apiKey: "",
    model: MODEL,
  });
});

it("says when Automatic cannot check an unrecognized model", async () => {
  mocks.detect.mockResolvedValue(null);
  setup();

  await screen.findByText(
    "The server could not be checked and “qwen3.8-flash” is not recognized: its images are not attached. Choose Yes if your server serves the vision part of the model.",
  );
  expect(mocks.stored).toBe("{}");
});

it("shows the kept detection without probing again", () => {
  mocks.stored = JSON.stringify({
    [KEY]: {
      detected: {
        reads: false,
        source: "metadata",
        checkedAt: "2026-11-26T10:00:00.000Z",
      },
    },
  });
  setup();

  expect(screen.getByText(/^Does not read images \(checked on /)).toBeTruthy();
  expect(mocks.detect).not.toHaveBeenCalled();
});

it("saves Yes for this server and model", async () => {
  mocks.stored = JSON.stringify({
    [KEY]: {
      detected: {
        reads: false,
        source: "probe",
        checkedAt: "2026-11-26T10:00:00.000Z",
      },
    },
  });
  setup();

  fireEvent.click(screen.getByRole("radio", { name: "Yes" }));

  await waitFor(() =>
    expect(JSON.parse(mocks.stored)[KEY]?.choice).toBe("yes"),
  );
});

it("runs the image test again on demand and shows the outcome", async () => {
  mocks.stored = JSON.stringify({ [KEY]: { choice: "yes" } });
  mocks.detect.mockResolvedValue({
    reads: false,
    source: "probe",
    checkedAt: "2026-11-26T11:00:00.000Z",
  });
  setup();

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));

  await screen.findByText("The model does not accept images.");
  expect(JSON.parse(mocks.stored)[KEY]).toMatchObject({
    choice: "yes",
    detected: { reads: false },
  });
});
