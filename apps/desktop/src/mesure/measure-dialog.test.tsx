import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  measure: vi.fn(),
  measureDifferences: vi.fn(),
  executeTransaction: vi.fn(async () => [1]),
  generatedRows: [] as { body: string }[],
  copy: vi.fn(async () => undefined),
  config: { calibration_enabled: true, personalization_dictionary_terms: [] },
}));

vi.mock("@syntheo/plugin-mesure", () => ({
  commands: {
    measure: mocks.measure,
    measureDifferences: mocks.measureDifferences,
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("~/db", () => ({
  executeTransaction: mocks.executeTransaction,
  liveQueryClient: { execute: async () => mocks.generatedRows },
}));
vi.mock("~/db/write-queue", () => ({
  enqueueDatabaseWrite: (_key: string, write: () => Promise<void>) => write(),
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => mocks.config,
}));
vi.mock("~/session/components/note-input/header-shared", () => ({
  copyTextToClipboard: mocks.copy,
  getStoredNoteMarkdown: (content: string | undefined) => content?.trim() ?? "",
}));
vi.mock("~/stt/select-upload-file", () => ({
  resolveUploadDefaultPath: async () => undefined,
}));

import { MeasureDialog } from "./measure-dialog";

const SENT = "Le projet avance avec Marten et un secret confidentiel.";
const RESULT = {
  ruleVersion: 1,
  aligned: true,
  headingsGenerated: 1,
  headingsMatched: 1,
  total: {
    generated: 5,
    added: 2,
    deleted: 0,
    replacedContent: 0,
    replacedLexical: 1,
  },
  sections: [],
  unmatchedSentWords: 0,
  contentPerMille: 400,
  lexicalPerMille: 200,
};
const ROWS = [
  {
    section: 0,
    kind: "replaced",
    lexical: true,
    weight: 1,
    generated: "Martin",
    sent: "Marten",
  },
  {
    section: 0,
    kind: "added",
    lexical: false,
    weight: 2,
    generated: "",
    sent: "secret confidentiel",
  },
];

function renderDialog() {
  return render(
    <MeasureDialog
      open
      onOpenChange={() => undefined}
      sessionId="session-1"
      documentId="doc-1"
      summaryMarkdown={"# Résumé\n\nLe projet avance avec Martin."}
    />,
  );
}

function persisted(): string {
  return JSON.stringify(mocks.executeTransaction.mock.calls);
}

beforeEach(() => {
  mocks.measure.mockResolvedValue({ status: "ok", data: RESULT });
  mocks.measureDifferences.mockResolvedValue({ status: "ok", data: ROWS });
  mocks.executeTransaction.mockClear();
  mocks.copy.mockClear();
  mocks.config.calibration_enabled = true;
  mocks.generatedRows = [];
});
afterEach(() => cleanup());

describe("MeasureDialog", () => {
  it("measures a pasted version and saves counts only", async () => {
    mocks.config.calibration_enabled = false;
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));

    await screen.findByText(/words of content reworked per 100 generated/);
    expect(mocks.measure).toHaveBeenCalledWith(
      "# Résumé\n\nLe projet avance avec Martin.",
      { kind: "text", text: SENT, format: "text" },
      [],
    );
    expect(mocks.measureDifferences).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.executeTransaction).toHaveBeenCalledOnce(),
    );
    const saved = persisted();
    for (const leak of ["Marten", "secret", "confidentiel", "Martin"]) {
      expect(saved).not.toContain(leak);
    }
  });

  it("keeps a pasted HTML version as HTML", async () => {
    mocks.config.calibration_enabled = false;
    renderDialog();
    fireEvent.paste(screen.getByLabelText("Sent version"), {
      clipboardData: {
        getData: (type: string) =>
          type === "text/html" ? "<h1>Résumé</h1><p>Texte</p>" : "Résumé Texte",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    await screen.findByText(/words of content reworked/);
    expect(mocks.measure.mock.calls[0][1]).toEqual({
      kind: "text",
      text: "<h1>Résumé</h1><p>Texte</p>",
      format: "html",
    });
  });

  // Mode Calibrage : extraits et classes choisies restent à l'écran ; seule la
  // matrice d'accord (des nombres) est enregistrée.
  it("calibration saves the agreement counts, never the excerpts or labels", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));

    await screen.findByText("Marten");
    expect(screen.getByText("secret confidentiel")).toBeTruthy();
    const groups = screen.getAllByRole("radiogroup");
    fireEvent.click(
      groups[0].querySelector('[role="radio"]:nth-child(2)') as Element,
    );
    fireEvent.click(
      groups[1].querySelector('[role="radio"]:nth-child(1)') as Element,
    );
    await screen.findByText(/Agreement: 100.0% on 2 differences/);

    fireEvent.click(screen.getByRole("button", { name: "Copy the matrix" }));
    const copied = (mocks.copy.mock.calls as unknown as string[][])[0][0];
    expect(copied).toContain("auto_lexical_vrai_lexical\t1");
    expect(copied).not.toContain("Marten");

    fireEvent.click(screen.getByRole("button", { name: "Save the matrix" }));
    await screen.findByRole("button", { name: "Matrix saved" });

    // Deux transactions : les compteurs de la mesure, puis la matrice.
    expect(mocks.executeTransaction).toHaveBeenCalledTimes(2);
    const saved = persisted();
    for (const leak of [
      "Marten",
      "Martin",
      "secret",
      "confidentiel",
      'lexical"',
      'content"',
    ]) {
      expect(saved).not.toContain(leak);
    }
    const matrixParams = (
      mocks.executeTransaction.mock.calls as unknown as {
        params: unknown[];
      }[][][]
    )[1][0][0].params;
    expect(matrixParams.slice(1)).toEqual([1, 1, 0, 0, 1]);
  });

  // Spec §2 : la version générée est le corps produit par Syntheo, avant
  // toute retouche ; à défaut (synthèse antérieure à la 0.8.0), la synthèse
  // actuelle, marquée `current`.
  it("compares with the produced body when it was kept", async () => {
    mocks.config.calibration_enabled = false;
    mocks.generatedRows = [{ body: "# Résumé\n\nTexte produit par Syntheo." }];
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    await screen.findByText(/words of content reworked/);
    expect(mocks.measure.mock.calls[0][0]).toBe(
      "# Résumé\n\nTexte produit par Syntheo.",
    );
    expect(screen.queryByText(/Compared with the current summary/)).toBeNull();
    await waitFor(() =>
      expect(mocks.executeTransaction).toHaveBeenCalledOnce(),
    );
    expect(persisted()).toContain('"original"');
  });

  it("falls back to the current summary and says so", async () => {
    mocks.config.calibration_enabled = false;
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    await screen.findByText(/Compared with the current summary/);
    await waitFor(() =>
      expect(mocks.executeTransaction).toHaveBeenCalledOnce(),
    );
    expect(persisted()).toContain('"current"');
  });
});
