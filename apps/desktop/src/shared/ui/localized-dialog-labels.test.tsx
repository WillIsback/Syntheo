import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorErrorBoundary } from "@syntheo/editor/error-boundary";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";

import { LocalizedDialogLabels } from "./localized-dialog-labels";

// Catalogue français simulé : le libellé vient bien de l'application.
vi.mock("@lingui/react", () => {
  const french: Record<string, string> = {
    Close: "Fermer",
    "The editor failed to render. Your recording is still running.":
      "L'éditeur n'a pas pu s'afficher. L'enregistrement continue.",
    "Reload editor": "Recharger l'éditeur",
  };
  const translate = (descriptor: { message?: string }) =>
    french[descriptor.message ?? ""] ?? descriptor.message ?? "";
  return { useLingui: () => ({ _: translate, t: translate }) };
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
  it("gives the editor fallback the app's texts", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <LocalizedDialogLabels>
        <EditorErrorBoundary>
          <Broken />
        </EditorErrorBoundary>
      </LocalizedDialogLabels>,
    );
    expect(
      screen.getByText(
        "L'éditeur n'a pas pu s'afficher. L'enregistrement continue.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Recharger l'éditeur" }),
    ).toBeTruthy();
  });
});
