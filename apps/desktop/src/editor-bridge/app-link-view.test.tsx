import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  openUrl: vi.fn(),
  view: { state: { doc: null } },
}));

vi.mock("@handlewithcare/react-prosemirror", () => ({
  useEditorEventCallback:
    (callback: (view: typeof hoisted.view) => unknown) => () =>
      callback(hoisted.view),
}));

vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: hoisted.openUrl },
}));

import { AppLinkView } from "./app-link-view";

function renderAppLink(attrs: Record<string, unknown>) {
  return render(
    <AppLinkView nodeProps={{ node: { attrs }, getPos: () => 3 } as any} />,
  );
}

describe("AppLinkView", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    hoisted.openUrl.mockReset();
    hoisted.openUrl.mockResolvedValue({ status: "ok", data: null });
  });

  // Issue 403 : la vue GitHub des tâches est retirée, un lien GitHub déjà
  // enregistré dans une note reste un lien ordinaire vers le navigateur.
  it.each([
    ["issue", "https://github.com/acme/app/issues/12"],
    ["pull_request", "https://github.com/acme/app/pull/34"],
  ])("ouvre un lien GitHub (%s) dans le navigateur", async (kind, url) => {
    renderAppLink({
      provider: "github",
      kind,
      url,
      owner: "acme",
      repo: "app",
      number: 12,
    });

    const chip = screen.getByRole("button");
    expect(chip.textContent).toContain("acme/app");

    fireEvent.click(chip);

    await waitFor(() => {
      expect(hoisted.openUrl).toHaveBeenCalledWith(url);
    });
  });

  // Issue 655 : une pastille n'ouvre qu'une adresse http(s).
  it.each([
    "file:///etc/passwd",
    "ms-msdt:/id PCWDiagnostic",
    "javascript:alert(1)",
  ])("n'ouvre pas une pastille vers %s", async (url) => {
    renderAppLink({ provider: "github", kind: "issue", url });

    fireEvent.click(screen.getByRole("button"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hoisted.openUrl).not.toHaveBeenCalled();
  });

  it("affiche l'icône GitHub au lieu d'une case de ticket", () => {
    renderAppLink({
      provider: "github",
      kind: "issue",
      url: "https://github.com/acme/app/issues/12",
      owner: "acme",
      repo: "app",
      number: 12,
    });

    const chip = screen.getByRole("button");
    expect(chip.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  });
});
