import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chooseExportPath: vi.fn(),
  exportText: vi.fn(),
  eraseBetaData: vi.fn(),
  loadExportRows: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.8.0" }));
vi.mock("@syntheo/plugin-export", () => ({
  commands: {
    chooseExportPath: mocks.chooseExportPath,
    exportText: mocks.exportText,
  },
}));
vi.mock("./beta", () => ({ eraseBetaData: mocks.eraseBetaData }));
vi.mock("./export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./export")>()),
  loadExportRows: mocks.loadExportRows,
}));

import { BetaData } from "./beta-data";

const ROWS = {
  enrollment: {
    pseudonym: "p-3f9a1c0e7b2d4f6a8c1e3b5d7f9a2c4e",
    enrolledAt: "2026-11-22T08:00:00.000Z",
  },
  measurements: [],
  sections: [],
  generations: [],
  terms: [],
  termErrors: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadExportRows.mockResolvedValue(ROWS);
  mocks.chooseExportPath.mockResolvedValue({
    status: "ok",
    data: "/tmp/x.json",
  });
  mocks.exportText.mockResolvedValue({ status: "ok", data: null });
  mocks.eraseBetaData.mockResolvedValue(undefined);
});

describe("BetaData", () => {
  it("shows the whole file before saving it, and saves exactly that", async () => {
    render(<BetaData />);
    fireEvent.click(
      screen.getByRole("button", { name: "Export my measurements…" }),
    );
    const preview = await screen.findByTestId("beta-export-preview");
    expect(preview.textContent).toContain(
      '"pseudonym": "p-3f9a1c0e7b2d4f6a8c1e3b5d7f9a2c4e"',
    );
    expect(mocks.chooseExportPath).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save the file…" }));
    await waitFor(() => expect(mocks.exportText).toHaveBeenCalledOnce());
    expect(mocks.exportText).toHaveBeenCalledWith(
      "/tmp/x.json",
      `${preview.textContent}\n`,
    );
  });

  it("says there is nothing to export before enrollment", async () => {
    mocks.loadExportRows.mockResolvedValue({ ...ROWS, enrollment: null });
    render(<BetaData />);
    fireEvent.click(
      screen.getByRole("button", { name: "Export my measurements…" }),
    );
    await screen.findByText("No measurement yet: measure a summary first.");
    expect(screen.queryByRole("button", { name: "Save the file…" })).toBeNull();
  });

  it("erases only after confirmation", async () => {
    render(<BetaData />);
    fireEvent.click(
      screen.getByRole("button", { name: "Erase my measurements…" }),
    );
    expect(mocks.eraseBetaData).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Erase all measurements and my pseudonym",
      }),
    );
    await screen.findByText(
      "Measurements and pseudonym erased from this computer. Measurement is now off.",
    );
    expect(mocks.eraseBetaData).toHaveBeenCalledOnce();
  });
});
