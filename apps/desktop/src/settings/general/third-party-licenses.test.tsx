import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AboutSection } from "./third-party-licenses";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

// Issue 747 : la page des licences, sur des données simulées (la liste réelle
// est générée au build par le plugin Vite).
vi.mock("virtual:third-party-licenses", () => ({
  default: {
    syntheo: {
      license: "MIT",
      text: "MIT License\n\nCopyright (c) Syntheo",
      origin: {
        project: "Anarlog",
        url: "https://github.com/fastrepl/anarlog",
        license: "MIT",
        holder: "Fastrepl, Inc.",
      },
    },
    texts: ["Apache License 2.0 text", "MIT text of React"],
    components: [
      {
        kind: "crate",
        name: "serde",
        version: "1.0.228",
        license: "MIT OR Apache-2.0",
        url: null,
        texts: [0],
      },
      {
        kind: "crate",
        name: "dasp",
        version: "0.11.0",
        license: "MIT OR Apache-2.0",
        url: null,
        texts: [],
      },
      {
        kind: "npm",
        name: "react",
        version: "19.2.0",
        license: "MIT",
        url: "https://react.dev",
        texts: [1],
      },
      {
        kind: "model",
        name: "nemotron-3.5-asr-streaming-0.6b",
        version: "int8",
        license: "OpenMDW-1.1",
        url: null,
        texts: [],
      },
    ],
  },
}));

afterEach(cleanup);

function openLicenses() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AboutSection />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/derived from Anarlog/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Licenses" }));
}

it("lists the third-party components by kind, with version and license", async () => {
  openLicenses();

  await screen.findByText("Rust crates (2)");
  expect(screen.getByText("npm packages (1)")).toBeTruthy();
  expect(screen.getByText("Models (1)")).toBeTruthy();
  expect(screen.getByText("serde")).toBeTruthy();
  expect(screen.getByText("1.0.228")).toBeTruthy();
  expect(screen.getByText("react")).toBeTruthy();
});

it("shows a license text only when its component is opened", async () => {
  openLicenses();
  await screen.findByText("react");
  expect(screen.queryByText("MIT text of React")).toBeNull();

  const details = screen
    .getByText("react")
    .closest("details") as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));

  await screen.findByText("MIT text of React");
});

it("says when a package ships no license file", async () => {
  openLicenses();
  await screen.findByText("dasp");
  const details = screen
    .getByText("dasp")
    .closest("details") as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));

  await screen.findByText(/ships no license file/);
});

it("filters by component name or license", async () => {
  openLicenses();
  await screen.findByText("serde");

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "openmdw" },
  });

  await screen.findByText("Models (1)");
  expect(screen.queryByText("serde")).toBeNull();
  expect(screen.queryByText("react")).toBeNull();
});

// Issue 777 : « dérivé d'Anarlog », avec élision, dans le catalogue français.
it("elides « de » before Anarlog in French", () => {
  const origin = {
    url: "https://github.com/fastrepl/anarlog",
    holder: "Fastrepl, Inc.",
    license: "MIT",
  };
  i18n.load("fr", frMessages);
  i18n.activate("fr");
  try {
    expect(
      t`Syntheo is derived from Anarlog (${origin.url}), by ${origin.holder}, under the ${origin.license} license.`,
    ).toBe(
      "Syntheo est dérivé d'Anarlog (https://github.com/fastrepl/anarlog), de Fastrepl, Inc., sous licence MIT.",
    );
  } finally {
    i18n.activate("en");
  }
});

it("names the origin project in the Syntheo license block", async () => {
  openLicenses();
  await screen.findByText(
    /Syntheo is derived from Anarlog \(https:\/\/github\.com\/fastrepl\/anarlog\)/,
  );
});
