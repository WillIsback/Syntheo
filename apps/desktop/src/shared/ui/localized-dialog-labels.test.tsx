import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorErrorBoundary } from "@syntheo/editor/error-boundary";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";

import { LocalizedDialogLabels } from "./localized-dialog-labels";

import { listenerStore } from "~/store/zustand/listener/instance";

// Catalogue français simulé : le libellé vient bien de l'application.
vi.mock("@lingui/react", () => {
  const french: Record<string, string> = {
    Close: "Fermer",
    "The editor failed to render. Your recording is still running.":
      "L'éditeur n'a pas pu s'afficher. L'enregistrement continue.",
    "The editor failed to render. Reload it to try again.":
      "L'éditeur n'a pas pu s'afficher. Rechargez-le pour réessayer.",
    "Reload editor": "Recharger l'éditeur",
  };
  const translate = (descriptor: { message?: string }) =>
    french[descriptor.message ?? ""] ?? descriptor.message ?? "";
  return { useLingui: () => ({ _: translate, t: translate }) };
});

function setListening(active: boolean): void {
  listenerStore.setState((state) => ({
    live: { ...state.live, status: active ? "active" : "inactive" },
  }));
}

afterEach(() => {
  cleanup();
  listenerStore.setState(listenerStore.getInitialState(), true);
});

function Broken(): never {
  throw new Error("render failed");
}

// Issue 560 : le bouton de fermeture des dialogues gardait l'aria « Close »
// en anglais, faute de catalogue dans @syntheo/ui.
describe("LocalizedDialogLabels", () => {
  it("gives dialogs the app's close label", () => {
    render(
      <LocalizedDialogLabels>
        <Dialog open>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Export</DialogTitle>
          </DialogContent>
        </Dialog>
      </LocalizedDialogLabels>,
    );
    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
  });

  // Issue 636 : l'écran de secours de l'éditeur suit la langue de l'app.
  // Issue 766 : la phrase sur l'enregistrement n'apparaît que pendant une écoute.
  function renderFallback() {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <LocalizedDialogLabels>
        <EditorErrorBoundary>
          <Broken />
        </EditorErrorBoundary>
      </LocalizedDialogLabels>,
    );
  }

  it("mentions the running recording only while listening", () => {
    setListening(true);
    renderFallback();
    expect(
      screen.getByText(
        "L'éditeur n'a pas pu s'afficher. L'enregistrement continue.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Recharger l'éditeur" }),
    ).toBeTruthy();
  });

  it("only explains how to recover when no listening is running", () => {
    setListening(false);
    renderFallback();
    expect(
      screen.getByText(
        "L'éditeur n'a pas pu s'afficher. Rechargez-le pour réessayer.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/enregistrement/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Recharger l'éditeur" }),
    ).toBeTruthy();
  });
});
