import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@syntheo/ui/components/ui/dialog";

import { LocalizedDialogLabels } from "./localized-dialog-labels";

// Catalogue français simulé : le libellé vient bien de l'application.
vi.mock("@lingui/react", () => {
  const translate = (descriptor: { message?: string }) =>
    descriptor.message === "Close" ? "Fermer" : (descriptor.message ?? "");
  return { useLingui: () => ({ _: translate, t: translate }) };
});

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
});
