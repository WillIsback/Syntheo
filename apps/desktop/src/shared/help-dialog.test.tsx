import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  openUrl: vi.fn(() => Promise.resolve({ status: "ok", data: null })),
}));

vi.mock("@syntheo/plugin-opener2", () => ({
  commands: { openUrl: hoisted.openUrl },
}));

import { DOCUMENTATION_URL } from "~/shared/documentation";
import { HelpDialog, HelpDialogHost, openHelpDialog } from "~/shared/help-dialog";
import {
  formatShortcut,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  shortcutGroupLabel,
} from "~/shared/shortcuts";

describe("Aide et raccourcis (F1, issue 372)", () => {
  afterEach(() => {
    cleanup();
    hoisted.openUrl.mockClear();
  });

  it("liste les raccourcis disponibles de la table, rangés par tâche", () => {
    render(<HelpDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Help and shortcuts" })).toBeTruthy();
    for (const group of SHORTCUT_GROUPS) {
      expect(
        screen.getByRole("region", { name: shortcutGroupLabel(group) }),
      ).toBeTruthy();
    }
    for (const def of SHORTCUTS) {
      const shown = screen.queryAllByLabelText(formatShortcut(def.id));
      if (def.available) {
        expect(shown.length, def.id).toBeGreaterThan(0);
        expect(screen.getAllByText(def.label()).length, def.id).toBeGreaterThan(0);
      } else {
        // Ctrl+P (issue 374), Ctrl+Maj+P (issue 373) : pas encore.
        expect(shown, def.id).toHaveLength(0);
      }
    }
    expect(screen.getByLabelText("F10")).toBeTruthy();
    expect(screen.queryByText(/Ctrl\+Alt/)).toBeNull();
  });

  it("rappelle l'enregistrement automatique", () => {
    render(<HelpDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByText("Your notes are saved automatically.")).toBeTruthy();
  });

  it("ouvre la documentation en ligne dans le navigateur", () => {
    render(<HelpDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open the online documentation (opens your web browser)",
      }),
    );

    expect(hoisted.openUrl).toHaveBeenCalledWith(DOCUMENTATION_URL, null);
  });

  it("s'ouvre depuis n'importe où avec openHelpDialog", async () => {
    render(<HelpDialogHost />);
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => openHelpDialog());

    expect(
      await screen.findByRole("dialog", { name: "Help and shortcuts" }),
    ).toBeTruthy();
  });
});
