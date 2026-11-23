import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decideLateFilingProposal, proposeLateFiling } from "./late-filing";

const mocks = vi.hoisted(() => ({
  rawTemplateId: "",
  summaryTemplateId: "",
  summaryContent: "",
  folderTemplateId: undefined as string | undefined,
  intelligenceBlocked: false,
  toast: vi.fn(),
  dismiss: vi.fn(),
  enhance: vi.fn(async () => ({ type: "started", noteId: "summary-1" })),
}));

vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: Object.assign((...args: unknown[]) => mocks.toast(...args), {
    dismiss: (...args: unknown[]) => mocks.dismiss(...args),
  }),
}));
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
vi.mock("~/settings/managed", () => ({
  loadIntelligenceBlocked: async () => mocks.intelligenceBlocked,
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
    mocks.intelligenceBlocked = false;
  });

  afterEach(() => {
    mocks.toast.mockReset();
    mocks.dismiss.mockReset();
    mocks.enhance.mockClear();
  });

  it("takes over the move message and its « Undo » (issue 603)", async () => {
    const undo = vi.fn();
    await proposeLateFiling("session-1", () => true, {
      toastId: "move-note-session-1",
      label: "Undo",
      onClick: undo,
    });

    expect(mocks.dismiss).toHaveBeenCalledWith("move-note-session-1");
    const [, options] = mocks.toast.mock.calls[0]!;
    expect(options.id).toBe("late-filing-session-1");
    expect(options.action.label).toBe("Regenerate");
    options.secondaryAction.onClick();
    expect(undo).toHaveBeenCalled();
    expect(mocks.enhance).not.toHaveBeenCalled();
  });

  it("leaves other messages alone without a move to undo", async () => {
    await proposeLateFiling("session-1");
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.toast.mock.calls[0]![1].secondaryAction).toBeUndefined();
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

  // Issue 707 : synthèse coupée (politique ou copie d'app_settings), comme
  // les autres générations manuelles. Le message du déplacement reste seul.
  it("offers no regeneration while summaries are turned off", async () => {
    mocks.intelligenceBlocked = true;
    await proposeLateFiling("session-1", () => true, {
      toastId: "move-note-session-1",
      label: "Undo",
      onClick: vi.fn(),
    });
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.enhance).not.toHaveBeenCalled();
  });
});
