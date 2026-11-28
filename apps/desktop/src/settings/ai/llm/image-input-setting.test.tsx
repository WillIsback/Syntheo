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
    status: "detected",
    detection: {
      reads: true,
      source: "probe",
      checkedAt: "2026-11-26T10:00:00.000Z",
    },
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
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unreachable" });
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
    "The server accepted the test image, but the model did not describe it: it may not read images.",
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
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unreachable" });
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
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unreachable" });
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

// Issue 768 : une demande de « Tester la connexion » faite sous un choix
// forcé ne relance pas la sonde au retour sur Automatique quand un résultat
// est gardé.
it("ignores a connection test made while the choice was forced", async () => {
  const detected = {
    reads: true,
    source: "probe",
    checkedAt: "2026-11-26T10:00:00.000Z",
  };
  mocks.stored = JSON.stringify({ [KEY]: { choice: "yes", detected } });
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unreachable" });
  const client = new QueryClient();
  const tree = (recheck: number) => (
    <QueryClientProvider client={client}>
      <ImageInputSetting
        baseUrl={BASE}
        apiKey=""
        model={MODEL}
        connected
        recheck={recheck}
      />
    </QueryClientProvider>
  );
  const view = render(tree(0));

  view.rerender(tree(1));
  fireEvent.click(screen.getByRole("radio", { name: "Automatic" }));
  await waitFor(() =>
    expect(JSON.parse(mocks.stored)[KEY]?.choice).toBe("auto"),
  );
  view.rerender(tree(1));
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(mocks.detect).not.toHaveBeenCalled();
  expect(
    screen.getByText(/^The model accepted the test image and described it/),
  ).toBeTruthy();

  // Une demande faite sous Automatique relance bien la détection.
  view.rerender(tree(2));
  await waitFor(() => expect(mocks.detect).toHaveBeenCalledTimes(1));
});

// Deux clics rapprochés sur « Tester la connexion » : seule la détection la
// plus récente écrit son résultat, même si l'ancienne répond après.
it("keeps only the latest detection after two quick connection tests", async () => {
  const older = {
    reads: false,
    source: "probe",
    checkedAt: "2026-11-26T11:00:00.000Z",
  };
  const latest = {
    reads: true,
    source: "metadata",
    checkedAt: "2026-11-26T11:00:01.000Z",
  };
  mocks.stored = JSON.stringify({
    [KEY]: {
      detected: {
        reads: true,
        source: "probe",
        checkedAt: "2026-11-26T10:00:00.000Z",
      },
    },
  });
  let answerOlder: (value: unknown) => void = () => {};
  mocks.detect
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerOlder = resolve;
        }),
    )
    .mockResolvedValueOnce({ status: "detected", detection: latest });
  const client = new QueryClient();
  const tree = (recheck: number) => (
    <QueryClientProvider client={client}>
      <ImageInputSetting
        baseUrl={BASE}
        apiKey=""
        model={MODEL}
        connected
        recheck={recheck}
      />
    </QueryClientProvider>
  );
  const view = render(tree(0));

  view.rerender(tree(1));
  await waitFor(() => expect(mocks.detect).toHaveBeenCalledTimes(1));
  view.rerender(tree(2));
  await waitFor(() =>
    expect(JSON.parse(mocks.stored)[KEY].detected).toEqual(latest),
  );
  answerOlder({ status: "detected", detection: older });
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(mocks.detect).toHaveBeenCalledTimes(2);
  expect(JSON.parse(mocks.stored)[KEY].detected).toEqual(latest);
});

// Issue 784 : après un test non concluant, la carte sépare le résultat
// gardé du dernier test et dit lequel s'applique.
it("says the kept result still applies after an unclear test", async () => {
  const detected = {
    reads: true,
    source: "probe",
    checkedAt: "2026-11-26T10:00:00.000Z",
  };
  mocks.stored = JSON.stringify({ [KEY]: { detected } });
  mocks.probe.mockResolvedValue({ status: "unclear", reason: "unrelated" });
  setup();

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Last test:");
  expect(status.textContent).toContain(
    "This test is not kept: the result above still applies.",
  );
  expect(
    screen.getByText(/^The model accepted the test image and described it/),
  ).toBeTruthy();
});

it("says a clear test result now applies", async () => {
  mocks.probe.mockResolvedValue({
    status: "refused",
    detection: {
      reads: false,
      source: "probe",
      checkedAt: "2026-11-26T11:00:00.000Z",
    },
  });
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unreachable" });
  setup();

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));

  await screen.findByText("This result now applies.");
});

it("says a forced choice still applies after a test", async () => {
  mocks.stored = JSON.stringify({ [KEY]: { choice: "no" } });
  mocks.probe.mockResolvedValue({ status: "unclear", reason: "no-answer" });
  setup();

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));

  await screen.findByText(
    "The server answered without describing the test image.",
  );
  expect(
    screen.getByText(
      "Your choice No still applies: the note's images are never attached.",
    ),
  ).toBeTruthy();
});

// Une réponse 200 ambiguë de la détection automatique : le serveur a bien
// répondu, il n'a simplement pas décrit l'image.
it("says the server answered without describing the image", async () => {
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unrelated" });
  setup();

  await screen.findByText(
    "The server answered without describing the test image and “qwen3.8-flash” is not recognized: its images are not attached. Choose Yes if your server serves the vision part of the model.",
  );
  expect(mocks.stored).toBe("{}");
});

// Le dernier test appartient au serveur et au modèle testés : passer à un
// autre modèle sans remonter la carte ne doit pas reporter son résultat ni
// la phrase « ce qui s'applique » sur le nouveau modèle.
function treeFor(client: QueryClient, model: string) {
  return (
    <QueryClientProvider client={client}>
      <ImageInputSetting baseUrl={BASE} apiKey="" model={model} connected />
    </QueryClientProvider>
  );
}

it("drops the last test when another model is chosen", async () => {
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unreachable" });
  mocks.probe.mockResolvedValue({
    status: "reads",
    detection: {
      reads: true,
      source: "probe",
      checkedAt: "2026-11-26T11:00:00.000Z",
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(treeFor(client, MODEL));

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));
  await screen.findByText("This result now applies.");

  view.rerender(treeFor(client, "llama-text-only"));

  await screen.findByText(/“llama-text-only” is not recognized/);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText(/^Last test:/)).toBeNull();

  view.rerender(treeFor(client, MODEL));
  expect(screen.getByText("This result now applies.")).toBeTruthy();
});

it("keeps a test that ends after a model change for the tested model", async () => {
  mocks.detect.mockResolvedValue({ status: "unclear", reason: "unreachable" });
  let answer: (value: unknown) => void = () => {};
  mocks.probe.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(treeFor(client, MODEL));

  fireEvent.click(screen.getByRole("button", { name: "Test with an image" }));
  view.rerender(treeFor(client, "llama-text-only"));
  expect(
    screen.getByRole("button", { name: "Test with an image" }),
  ).toBeTruthy();

  answer({
    status: "reads",
    detection: {
      reads: true,
      source: "probe",
      checkedAt: "2026-11-26T11:00:00.000Z",
    },
  });

  await waitFor(() =>
    expect(JSON.parse(mocks.stored)[KEY]?.detected?.reads).toBe(true),
  );
  expect(JSON.parse(mocks.stored)[`${BASE}|llama-text-only`]).toBeUndefined();
  expect(screen.queryByRole("status")).toBeNull();
});
