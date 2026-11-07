import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  downloadDir: vi.fn(),
  exportPdf: vi.fn(),
  printPdf: vi.fn(),
  cleanupPrintFiles: vi.fn(),
  openPath: vi.fn(),
  writeTextFile: vi.fn(),
  revealItemInDir: vi.fn(async () => ({ status: "ok" as const, data: null })),
  onOpenChange: vi.fn(),
  save: vi.fn(),
  isAppStoreBuild: vi.fn(),
  sharedNote: undefined as { body: unknown } | undefined,
}));

vi.mock("@tauri-apps/api/path", () => ({
  downloadDir: mocks.downloadDir,
  join: async (...parts: string[]) => parts.join("/"),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: mocks.save }));
vi.mock("@syntheo/plugin-export", () => ({
  commands: {
    export: mocks.exportPdf,
    printPdf: mocks.printPdf,
    cleanupPrintFiles: mocks.cleanupPrintFiles,
  },
}));
vi.mock("@syntheo/plugin-fs2", () => ({
  commands: { writeTextFile: mocks.writeTextFile },
}));
vi.mock("@syntheo/plugin-opener2", () => ({
  commands: {
    revealItemInDir: mocks.revealItemInDir,
    openPath: mocks.openPath,
  },
}));
vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: mocks.settings,
}));
vi.mock("~/shared/app-store", () => ({
  isAppStoreBuild: mocks.isAppStoreBuild,
}));
vi.mock("~/session/queries", () => ({
  useSession: () => ({ title: "Project review" }),
  useEnhancedNote: () => undefined,
  useSessionParticipants: () => [],
}));
vi.mock("~/session/utils", () => ({ getSessionEvent: () => null }));
vi.mock("~/session/components/note-input/transcript/export-data", () => ({
  useTranscriptExportSegments: () => ({ data: [], isLoading: false }),
}));
vi.mock("~/stt/queries", () => ({ useSessionTranscriptMetadata: () => [] }));
vi.mock("~/shared-notes/cache", () => ({
  useDurableSharedNote: (_viewer: string | null, shareId: string) => ({
    data: shareId ? mocks.sharedNote : undefined,
  }),
}));

import { ExportModal } from "./export-modal";
import { PRINT_CLEANUP_DELAY_MS } from "./print-pdf";

function renderModal(
  currentView: React.ComponentProps<typeof ExportModal>["currentView"] = {
    type: "raw",
  },
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ExportModal
        sessionId="session-1"
        currentView={currentView}
        open
        onOpenChange={mocks.onOpenChange}
      />
    </QueryClientProvider>,
  );
}

describe("ExportModal destination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.settings.mockResolvedValue({ values: {} });
    mocks.downloadDir.mockResolvedValue("/Users/test/Downloads");
    mocks.exportPdf.mockResolvedValue({ status: "ok", data: null });
    mocks.writeTextFile.mockResolvedValue({ status: "ok", data: null });
    mocks.isAppStoreBuild.mockReturnValue(false);
    mocks.printPdf.mockResolvedValue({
      status: "ok",
      data: "/cache/print/Project review-0f8c.pdf",
    });
    mocks.cleanupPrintFiles.mockResolvedValue({ status: "ok", data: null });
    mocks.openPath.mockResolvedValue({ status: "ok", data: null });
  });
  afterEach(cleanup);

  it.each([
    ["PDF", "pdf"],
    ["TXT", "txt"],
    ["Markdown", "md"],
    ["Org", "org"],
  ])("writes %s to the saved export folder", async (label, extension) => {
    mocks.settings.mockResolvedValue({
      values: { export_directory: "/Volumes/Work/Exports" },
    });
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: label }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.onOpenChange).toHaveBeenCalledWith(false));
    const writer = extension === "pdf" ? mocks.exportPdf : mocks.writeTextFile;
    expect(writer).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^/Volumes/Work/Exports/Project review_.*\\.${extension}$`),
      ),
      extension === "pdf" ? expect.any(Object) : expect.any(String),
    );
    expect(mocks.revealItemInDir).toHaveBeenCalledWith(writer.mock.calls[0][0]);
    expect(mocks.downloadDir).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])(
    "uses Downloads when the preference is %s",
    async (directory) => {
      mocks.settings.mockResolvedValue({
        values: { export_directory: directory },
      });
      renderModal();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(mocks.exportPdf).toHaveBeenCalledWith(
          expect.stringMatching(/^\/Users\/test\/Downloads\//),
          expect.any(Object),
        ),
      );
    },
  );

  it("does not export to Downloads if reading the saved preference fails", async () => {
    mocks.settings.mockRejectedValue(new Error("Database unavailable"));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(mocks.downloadDir).not.toHaveBeenCalled();
    expect(mocks.exportPdf).not.toHaveBeenCalled();
  });

  it("keeps the modal open and shows write failures", async () => {
    mocks.writeTextFile.mockResolvedValue({
      status: "error",
      error: "Permission denied",
    });
    renderModal();
    fireEvent.click(screen.getByRole("radio", { name: "Markdown" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check the export location in Settings",
    );
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    expect(mocks.revealItemInDir).not.toHaveBeenCalled();
  });

  it("uses the saved folder as the App Store save dialog default", async () => {
    mocks.isAppStoreBuild.mockReturnValue(true);
    mocks.settings.mockResolvedValue({
      values: { export_directory: "/Users/test/Documents" },
    });
    mocks.save.mockResolvedValue("/Users/test/Documents/review.pdf");
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.exportPdf).toHaveBeenCalledWith(
        "/Users/test/Documents/review.pdf",
        expect.any(Object),
      ),
    );
    expect(mocks.save).toHaveBeenCalledWith({
      defaultPath: expect.stringMatching(/^\/Users\/test\/Documents\//),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
  });

  it("leaves the export modal open when the native save dialog is canceled", async () => {
    mocks.isAppStoreBuild.mockReturnValue(true);
    mocks.save.mockResolvedValue(null);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(mocks.exportPdf).not.toHaveBeenCalled();
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    expect(mocks.revealItemInDir).not.toHaveBeenCalled();
  });
});

describe("ExportModal : exporter ou imprimer (issue 374)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.settings.mockResolvedValue({ values: {} });
    mocks.downloadDir.mockResolvedValue("/Users/test/Downloads");
    mocks.exportPdf.mockResolvedValue({ status: "ok", data: null });
    mocks.isAppStoreBuild.mockReturnValue(false);
    mocks.printPdf.mockResolvedValue({
      status: "ok",
      data: "/cache/print/Project review-0f8c.pdf",
    });
    mocks.cleanupPrintFiles.mockResolvedValue({ status: "ok", data: null });
    mocks.openPath.mockResolvedValue({ status: "ok", data: null });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("s'intitule « Exporter ou imprimer » et propose Enregistrer et Imprimer…", () => {
    renderModal();

    expect(
      screen.getByRole("dialog", { name: "Export or print" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print…" })).toBeTruthy();
    expect(
      screen.getByText("The PDF opens in your reader. Choose Print."),
    ).toBeTruthy();
  });

  it("affiche le dossier d'enregistrement par défaut : Téléchargements", async () => {
    renderModal();

    const folder = await screen.findByText("Saved in Downloads");
    expect(folder.getAttribute("title")).toBe("/Users/test/Downloads");
  });

  it("affiche le dossier choisi dans les paramètres", async () => {
    mocks.settings.mockResolvedValue({
      values: {
        export_directory: "C:\\Users\\Anne\\Documents\\Comptes rendus",
      },
    });
    renderModal();

    const folder = await screen.findByText("Saved in Comptes rendus");
    expect(folder.getAttribute("title")).toBe(
      "C:\\Users\\Anne\\Documents\\Comptes rendus",
    );
  });

  it("Imprimer… crée le PDF temporaire, l'ouvre dans le lecteur, puis le nettoie", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderModal();
    // TXT choisi : l'impression passe quand même par le PDF.
    fireEvent.click(screen.getByRole("radio", { name: "TXT" }));

    fireEvent.click(screen.getByRole("button", { name: "Print…" }));

    await waitFor(() => expect(mocks.onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.printPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ title: "Project review" }),
      }),
    );
    expect(mocks.exportPdf).not.toHaveBeenCalled();
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
    expect(mocks.openPath).toHaveBeenCalledWith(
      "/cache/print/Project review-0f8c.pdf",
      null,
    );
    expect(mocks.printPdf.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openPath.mock.invocationCallOrder[0],
    );
    expect(mocks.revealItemInDir).not.toHaveBeenCalled();

    // Le lecteur a le temps d'ouvrir le fichier avant le nettoyage.
    expect(mocks.cleanupPrintFiles).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PRINT_CLEANUP_DELAY_MS - 1_000);
    expect(mocks.cleanupPrintFiles).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.cleanupPrintFiles).toHaveBeenCalledOnce();
  });

  it("n'utilise jamais l'impression de la page web", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Print…" }));

    await waitFor(() => expect(mocks.openPath).toHaveBeenCalled());
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });

  it("garde la fenêtre ouverte et prévient si le PDF ne s'ouvre pas", async () => {
    mocks.openPath.mockResolvedValue({ status: "error", error: "no reader" });
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Print…" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not open the PDF to print",
    );
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
  });
});
