import { beforeEach, describe, expect, it, vi } from "vitest";

const opener = vi.hoisted(() => ({
  openPath: vi.fn(),
  revealItemInDir: vi.fn(async () => ({ status: "ok", data: null })),
}));
vi.mock("@syntheo/plugin-opener2", () => ({ commands: opener }));

import { openAttachmentFile } from "./file-attachment-view";

beforeEach(() => vi.clearAllMocks());

// Issue 654 : une pièce jointe qui peut lancer un programme est montrée dans
// son dossier, jamais ouverte.
describe("openAttachmentFile", () => {
  it("opens an ordinary attachment", async () => {
    opener.openPath.mockResolvedValue({ status: "ok", data: null });
    await openAttachmentFile("/vault/notes.pdf");
    expect(opener.openPath).toHaveBeenCalledWith("/vault/notes.pdf");
    expect(opener.revealItemInDir).not.toHaveBeenCalled();
  });

  it("shows an active attachment in its folder instead", async () => {
    opener.openPath.mockResolvedValue({
      status: "error",
      error: "active_file_not_opened",
    });
    await openAttachmentFile("/vault/facture.exe");
    expect(opener.revealItemInDir).toHaveBeenCalledWith("/vault/facture.exe");
  });

  it("does not reveal after another error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    opener.openPath.mockResolvedValue({
      status: "error",
      error: "path not allowed",
    });
    await openAttachmentFile("//server/share/x.pdf");
    expect(opener.revealItemInDir).not.toHaveBeenCalled();
  });
});
