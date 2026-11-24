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
vi.mock("~/db", () => ({
  executeTransaction: mocks.executeTransaction,
  liveQueryClient: { execute: async () => mocks.generatedRows },
}));
vi.mock("~/db/write-queue", () => ({
  enqueueDatabaseWrite: (_key: string, write: () => Promise<void>) => write(),
}));
// L'inscription avant le calcul (clé des empreintes) est testée à part.
vi.mock("./beta", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./beta")>()),
  ensureEnrollment: async () => {},
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => mocks.config,
}));
vi.mock("~/session/components/note-input/header-shared", () => ({
  copyTextToClipboard: mocks.copy,
  getStoredNoteMarkdown: (content: string | undefined) => content?.trim() ?? "",
}));

import { fileInput, MeasureDialog } from "./measure-dialog";

const SENT = "Le projet avance avec Marten et un secret confidentiel.";
const RESULT = {
  ruleVersion: 2,
  guardVersion: 1,
  status: "ok" as "ok" | "doubtful" | "refused",
  statusReasons: [] as string[],
  controls: {
    generatedKeptWords: 4,
    sectionsMatchedExact: 1,
    sectionsMatchedNear: 0,
    deletedSectionWords: 0,
    residualEntities: 0,
  },
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
  correctedTerms: [{ hash: "c".repeat(64), count: 1 }],
  dictionaryHashes: [],
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
      { kind: "text", text: SENT, format: "markdown" },
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

  // Issue 733 : une mesure refusée n'affiche aucun chiffre ; une mesure
  // douteuse les affiche grisés, avec la raison.
  it("shows no number for a refused measurement", async () => {
    mocks.config.calibration_enabled = false;
    mocks.measure.mockResolvedValue({
      status: "ok",
      data: {
        ...RESULT,
        status: "refused",
        statusReasons: ["entity_left"],
        controls: { ...RESULT.controls, residualEntities: 3 },
      },
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));

    await screen.findByText(/This measurement was refused/);
    expect(screen.getByText(/still contains HTML codes/)).toBeTruthy();
    expect(screen.queryByText(/words of content reworked/)).toBeNull();
    expect(screen.queryByText("Generated words")).toBeNull();
  });

  it("does not calibrate on a refused measurement", async () => {
    mocks.measure.mockResolvedValue({
      status: "ok",
      data: { ...RESULT, status: "refused", statusReasons: ["entity_left"] },
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));

    await screen.findByText(/This measurement was refused/);
    await waitFor(() =>
      expect(mocks.executeTransaction).toHaveBeenCalledOnce(),
    );
    expect(mocks.measureDifferences).not.toHaveBeenCalled();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText(/Agreement:/)).toBeNull();
  });

  it("greys a doubtful measurement and says why", async () => {
    mocks.config.calibration_enabled = false;
    mocks.measure.mockResolvedValue({
      status: "ok",
      data: {
        ...RESULT,
        status: "doubtful",
        statusReasons: ["unmatched_sections"],
        controls: { ...RESULT.controls, sectionsMatchedNear: 1 },
      },
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));

    await screen.findByText(/Doubtful measurement/);
    expect(screen.getByText(/sections that were not found/)).toBeTruthy();
    expect(screen.getByText(/words of content reworked/)).toBeTruthy();
    expect(screen.getByText(/with a corrected heading/)).toBeTruthy();
    expect(
      document
        .querySelector("[data-measure-result]")
        ?.getAttribute("data-measure-status"),
    ).toBe("doubtful");
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
    expect(matrixParams.slice(1)).toEqual([2, 1, 0, 0, 1]);
  });

  // Issue 735 : étiquetage en aveugle, et classe « artefact » hors matrice.
  it("hides the automatic class until a class is chosen", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    await screen.findByText("Marten");

    const automatic = () =>
      Array.from(document.querySelectorAll("[data-automatic-class]")).map(
        (cell) => cell.textContent,
      );
    expect(automatic()).toEqual(["Hidden", "Hidden"]);

    const groups = screen.getAllByRole("radiogroup");
    fireEvent.click(
      groups[0].querySelector('[role="radio"]:nth-child(2)') as Element,
    );
    expect(automatic()).toEqual(["Lexical", "Hidden"]);

    // La seconde différence est un artefact : hors matrice, comptée à part.
    fireEvent.click(
      groups[1].querySelector('[role="radio"]:nth-child(3)') as Element,
    );
    expect(automatic()).toEqual(["Lexical", "Content"]);
    await screen.findByText(/Agreement: 100.0% on 1 differences/);
    screen.getByText(/Weighted by words: 100.0% on 1 words/);
    screen.getByText(/Artifacts: 1 differences \(2 words\)/);

    fireEvent.click(screen.getByRole("button", { name: "Copy the matrix" }));
    const copied = (mocks.copy.mock.calls as unknown as string[][])[0][0];
    expect(copied).toContain("artefacts\t1");
    expect(copied).toContain("mots_artefacts\t2");
    expect(copied).not.toContain("secret");

    fireEvent.click(screen.getByRole("button", { name: "Save the matrix" }));
    await screen.findByRole("button", { name: "Matrix saved" });
    const matrixParams = (
      mocks.executeTransaction.mock.calls as unknown as {
        params: unknown[];
      }[][][]
    )[1][0][0].params;
    // Les quatre cases seulement : l'artefact n'y figure pas.
    expect(matrixParams.slice(1)).toEqual([2, 0, 0, 0, 1]);
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

  // Revue du lot 0.8.0, constats 21 et 25 : fermer pendant le calcul
  // n'enregistre rien et n'affiche rien.
  it("closing during the calculation saves and shows nothing", async () => {
    mocks.config.calibration_enabled = false;
    let resolve: (value: unknown) => void = () => undefined;
    mocks.measure.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onOpenChange = vi.fn();
    render(
      <MeasureDialog
        open
        onOpenChange={onOpenChange}
        sessionId="session-1"
        documentId="doc-1"
        summaryMarkdown={"# Résumé\n\nTexte."}
      />,
    );
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    await waitFor(() => expect(mocks.measure).toHaveBeenCalled());
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    resolve({ status: "ok", data: RESULT });
    await new Promise((done) => setTimeout(done, 20));
    expect(mocks.executeTransaction).not.toHaveBeenCalled();
    expect(screen.queryByText(/words of content reworked/)).toBeNull();
  });

  // Constats 22 et 24 : un calibrage par mesure, réenregistré à la même ligne.
  it("saving the matrix again replaces the same row", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Sent version"), {
      target: { value: SENT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    await screen.findByText("Marten");
    const groups = screen.getAllByRole("radiogroup");
    fireEvent.click(
      groups[0].querySelector('[role="radio"]:nth-child(2)') as Element,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save the matrix" }));
    await screen.findByRole("button", { name: "Matrix saved" });
    fireEvent.click(
      groups[1].querySelector('[role="radio"]:nth-child(1)') as Element,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save the matrix" }));
    await screen.findByRole("button", { name: "Matrix saved" });
    const calls = mocks.executeTransaction.mock.calls as unknown as {
      sql: string;
      params: unknown[];
    }[][][];
    const matrixWrites = calls.slice(1).map((call) => call[0][0]);
    expect(matrixWrites).toHaveLength(2);
    expect(matrixWrites[0].params[0]).toBe(matrixWrites[1].params[0]);
    expect(matrixWrites[1].sql).toContain("ON CONFLICT(id) DO UPDATE");
  });

  it("keeps the text when pasting into a non-empty field", () => {
    renderDialog();
    const field = screen.getByLabelText("Sent version");
    fireEvent.change(field, { target: { value: "Début déjà saisi" } });
    fireEvent.paste(field, {
      clipboardData: {
        getData: (type: string) =>
          type === "text/html" ? "<p>Suite</p>" : "Suite",
      },
    });
    expect((field as HTMLTextAreaElement).value).toBe("Début déjà saisi");
  });

  it("reads a chosen file in the window, never by path", async () => {
    mocks.config.calibration_enabled = false;
    renderDialog();
    const file = new File(["# Résumé\n\nTexte."], "publiee.md", {
      type: "text/markdown",
    });
    fireEvent.change(screen.getByTestId("measure-file"), {
      target: { files: [file] },
    });
    await screen.findByText("publiee.md");
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    await screen.findByText(/words of content reworked/);
    expect(mocks.measure.mock.calls[0][1]).toEqual({
      kind: "text",
      text: "# Résumé\n\nTexte.",
      format: "markdown",
    });
  });
});

// Constats 23 et 26 : taille vérifiée avant la lecture, UTF-8 strict.
describe("fileInput", () => {
  it("refuses an oversized file without reading it", async () => {
    const file = new File(["x"], "gros.txt");
    Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 });
    const read = vi.spyOn(file, "arrayBuffer");
    expect(await fileInput(file)).toEqual({ ok: false, reason: "size" });
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a text file that is not UTF-8", async () => {
    const latin1 = new File(
      [new Uint8Array([0x76, 0x61, 0x6c, 0x69, 0x64, 0xe9])],
      "a.html",
    );
    expect(await fileInput(latin1)).toEqual({ ok: false, reason: "encoding" });
  });

  it("refuses other file types", async () => {
    expect(await fileInput(new File(["%PDF"], "a.pdf"))).toEqual({
      ok: false,
      reason: "type",
    });
  });
});
