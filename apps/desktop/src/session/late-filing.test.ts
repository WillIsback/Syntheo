import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decideLateFilingProposal, proposeLateFiling } from "./late-filing";

const mocks = vi.hoisted(() => ({
  rawTemplateId: "",
  summaryTemplateId: "",
  summaryContent: "",
  folderTemplateId: undefined as string | undefined,
  toast: vi.fn(),
  enhance: vi.fn(async () => ({ type: "started", noteId: "summary-1" })),
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({ toast: mocks.toast }));
vi.mock("~/session/content-queries", () => ({
  loadSessionContentSnapshot: async () => ({
    title: "Point produit",
    rawTemplateId: mocks.rawTemplateId,
    enhancedNotes: [
      {
        id: "summary-1",
        templateId: mocks.summaryTemplateId,
        position: 0,
        content: mocks.summaryContent,
      },
    ],
  }),
}));
vi.mock("~/folders/folder-template", () => ({
  loadSessionFolderTemplateId: async () => mocks.folderTemplateId,
}));
vi.mock("~/templates/queries", () => ({
  getTemplateById: async (id: string) =>
    id === "weekly" ? { id, title: "Point hebdo" } : null,
}));
vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => ({ enhance: mocks.enhance }),
}));
vi.mock("~/ai/task-window-sync", () => ({
  isMainAITaskHostWindow: () => true,
  requestMainEnhance: vi.fn(),
}));

const WRITTEN = JSON.stringify({
  type: "doc",
  content: [
    { type: "heading", content: [{ type: "text", text: "Décisions" }] },
    { type: "paragraph", content: [{ type: "text", text: "On livre jeudi." }] },
  ],
});

describe("decideLateFilingProposal", () => {
  const summaries = [
    { id: "summary-2", templateId: "retro", position: 1, hasContent: true },
    { id: "summary-1", templateId: "", position: 0, hasContent: true },
  ];

  it("proposes the folder template for the first written summary", () => {
    expect(
      decideLateFilingProposal({
        noteTemplateId: "",
        folderTemplateId: "weekly",
        summaries,
      }),
    ).toEqual({ templateId: "weekly", targetNoteId: "summary-1" });
  });

  it("proposes nothing when a summary already uses the folder template", () => {
    expect(
      decideLateFilingProposal({
        noteTemplateId: "",
        folderTemplateId: "retro",
        summaries,
      }),
    ).toBeNull();
  });

  it("proposes nothing when the note has its own template", () => {
    expect(
      decideLateFilingProposal({
        noteTemplateId: "one-on-one",
        folderTemplateId: "weekly",
        summaries,
      }),
    ).toBeNull();
  });

  it("proposes nothing without a folder template or a written summary", () => {
    expect(
      decideLateFilingProposal({
        noteTemplateId: "",
        folderTemplateId: undefined,
        summaries,
      }),
    ).toBeNull();
    expect(
      decideLateFilingProposal({
        noteTemplateId: "",
        folderTemplateId: "weekly",
        summaries: [
          { id: "summary-1", templateId: "", position: 0, hasContent: false },
        ],
      }),
    ).toBeNull();
  });
});

describe("proposeLateFiling", () => {
  beforeEach(() => {
    mocks.rawTemplateId = "";
    mocks.summaryTemplateId = "";
    mocks.summaryContent = WRITTEN;
    mocks.folderTemplateId = "weekly";
  });

  afterEach(() => {
    mocks.toast.mockReset();
    mocks.enhance.mockClear();
  });

  it("offers to regenerate an Automatic summary with the folder template", async () => {
    await proposeLateFiling("session-1");

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    const [message, options] = mocks.toast.mock.calls[0]!;
    expect(message).toBe("This folder uses the Point hebdo template");
    // Rien n'est réécrit sans accord.
    expect(mocks.enhance).not.toHaveBeenCalled();

    options.action.onClick();
    expect(mocks.enhance).toHaveBeenCalledWith("session-1", {
      templateId: "weekly",
      targetNoteId: "summary-1",
      templateTitle: "Point hebdo",
    });
  });

  it("stays quiet when the summary already uses the folder template", async () => {
    mocks.summaryTemplateId = "weekly";
    await proposeLateFiling("session-1");
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("stays quiet when the note has an explicitly chosen template", async () => {
    mocks.rawTemplateId = "one-on-one";
    await proposeLateFiling("session-1");
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("stays quiet when the folder template no longer exists", async () => {
    mocks.folderTemplateId = "deleted";
    await proposeLateFiling("session-1");
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
