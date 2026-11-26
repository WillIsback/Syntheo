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
  ready: true,
  detect: vi.fn(),
  probe: vi.fn(),
  updateSettingValue: vi.fn(),
}));

// Avant la lecture des réglages, le stockage rend la valeur par défaut.
vi.mock("~/shared/config", () => ({
  useConfigValue: () => (mocks.ready ? mocks.stored : "{}"),
}));

vi.mock("~/settings/queries", () => ({
  updateSettingValue: mocks.updateSettingValue,
  useSettingsReady: () => mocks.ready,
}));

vi.mock("~/settings/ai/shared/image-input", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/settings/ai/shared/image-input")
  >()),
  detectImageInput: mocks.detect,
  probeImageInput: mocks.probe,
}));

const BASE = "http://gpu.exemple.fr:8000/v1";
const MODEL = "qwen3.8-flash";
const KEY = `${BASE}|${MODEL}`;

beforeEach(() => {
  mocks.stored = "{}";
  mocks.ready = true;
  mocks.detect.mockReset();
  mocks.probe.mockReset();
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

  expect(
    screen.getByText(
      /^Announced by the server: the model does not read images \(checked on /,
    ),
  ).toBeTruthy();
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
  mocks.probe.mockResolvedValue({
    status: "refused",
    detection: {
      reads: false,
      source: "probe",
      checkedAt: "2026-11-26T11:00:00.000Z",
    },
  });
  setup();

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));

  await screen.findByText(
    "The server refused the test image: the model does not read images.",
  );
  expect(JSON.parse(mocks.stored)[KEY]).toMatchObject({
    choice: "yes",
    detected: { reads: false },
  });
});

// Issue 771 : le bouton envoie toujours l'image de test, même quand les
// métadonnées du serveur ont déjà répondu, et le texte dit d'où vient le
// résultat.
it("sends the test image even when the server announced the answer", async () => {
  mocks.stored = JSON.stringify({
    [KEY]: {
      detected: {
        reads: true,
        source: "metadata",
        checkedAt: "2026-11-26T10:00:00.000Z",
      },
    },
  });
  mocks.probe.mockResolvedValue({
    status: "reads",
    detection: {
      reads: true,
      source: "probe",
      checkedAt: "2026-11-26T11:00:00.000Z",
    },
  });
  const view = setup();
  expect(
    screen.getByText(
      /^Announced by the server: the model reads images \(checked on /,
    ),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));

  await screen.findByText(
    "The model accepted the test image: it saw the blue disc.",
  );
  expect(mocks.probe).toHaveBeenCalledWith({
    baseUrl: BASE,
    apiKey: "",
    model: MODEL,
  });
  expect(mocks.detect).not.toHaveBeenCalled();
  expect(JSON.parse(mocks.stored)[KEY].detected.source).toBe("probe");
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <ImageInputSetting baseUrl={BASE} apiKey="" model={MODEL} connected />
    </QueryClientProvider>,
  );
  expect(
    screen.getByText(
      /^The model accepted the test image and described it \(checked on /,
    ),
  ).toBeTruthy();
});

it("keeps the stored result when the model answers beside the test image", async () => {
  const detected = {
    reads: true,
    source: "metadata",
    checkedAt: "2026-11-26T10:00:00.000Z",
  };
  mocks.stored = JSON.stringify({ [KEY]: { detected } });
  mocks.probe.mockResolvedValue({ status: "unclear", reason: "unrelated" });
  setup();

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));

  await screen.findByText(
    "The server accepted the test image, but the model did not describe it: it may not read images. Choose Yes or No to decide.",
  );
  expect(JSON.parse(mocks.stored)[KEY]).toEqual({ detected });
});

// Issue 769 : à l'ouverture de la page, les réglages ne sont pas encore lus
// au premier rendu. La détection attend leur lecture, puis réutilise le
// résultat gardé ; un choix forcé n'en lance aucune.
it.each([
  [
    "a kept detection",
    {
      detected: {
        reads: true,
        source: "probe",
        checkedAt: "2026-11-26T10:00:00.000Z",
      },
    },
  ],
  ["a forced Yes", { choice: "yes" }],
  ["a forced No", { choice: "no" }],
])("does not probe again when the page opens with %s", async (_, entry) => {
  mocks.stored = JSON.stringify({ [KEY]: entry });
  mocks.ready = false;
  mocks.detect.mockResolvedValue(null);
  const client = new QueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <ImageInputSetting baseUrl={BASE} apiKey="" model={MODEL} connected />
    </QueryClientProvider>,
  );

  mocks.ready = true;
  view.rerender(
    <QueryClientProvider client={client}>
      <ImageInputSetting baseUrl={BASE} apiKey="" model={MODEL} connected />
    </QueryClientProvider>,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(mocks.detect).not.toHaveBeenCalled();
  expect(JSON.parse(mocks.stored)[KEY]).toEqual(entry);
});

it("does not probe again on a second visit after an unclear answer", async () => {
  mocks.detect.mockResolvedValue(null);
  const client = new QueryClient();
  const open = () =>
    render(
      <QueryClientProvider client={client}>
        <ImageInputSetting baseUrl={BASE} apiKey="" model={MODEL} connected />
      </QueryClientProvider>,
    );

  const first = open();
  await waitFor(() => expect(mocks.detect).toHaveBeenCalledTimes(1));
  first.unmount();
  // Le temps que la page soit fermée puis rouverte.
  await new Promise((resolve) => setTimeout(resolve, 20));
  open();
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(mocks.detect).toHaveBeenCalledTimes(1);
});
