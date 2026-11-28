import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bout en bout « Demander au dossier » (issue 805) : le message part du vrai
// pipeline de contexte, le vrai transport en tire le contexte des outils et
// le vrai outil read_folder_material le lit. Seuls le modèle (ToolLoopAgent),
// le rendu de gabarit, les requêtes SQLite et la lecture disque sont simulés.
const mocks = vi.hoisted(() => ({
  agentOptions: vi.fn(),
  renderTemplate: vi.fn(),
  loadFolderMaterial: vi.fn(),
  folderAttachmentRead: vi.fn(),
}));

vi.mock("@syntheo/plugin-template", () => ({
  commands: { render: mocks.renderTemplate },
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  ToolLoopAgent: class {
    constructor(options: unknown) {
      mocks.agentOptions(options);
    }
    stream = async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    });
  },
}));

vi.mock("~/session/queries", () => ({
  useSessionSummariesByIds: () => [],
}));

vi.mock("~/contacts/queries", () => ({
  useHumanDisplayRecordsByIds: () => [],
  useOrganizationDisplayRecordsByIds: () => [],
}));

vi.mock("@syntheo/plugin-fs-sync", () => ({
  commands: { folderAttachmentRead: mocks.folderAttachmentRead },
}));

vi.mock("~/session/folder-attachments", () => ({
  diskAttachmentId: (relativePath: string) =>
    relativePath.split("/").pop() ?? relativePath,
  loadFolderMaterial: mocks.loadFolderMaterial,
}));

import { useChatContextPipeline } from "../context/use-chat-context-pipeline";
import { buildReadFolderMaterialTool } from "../tools/folder-materials";
import { CustomChatTransport } from "./index";

describe("Demander au dossier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.renderTemplate.mockResolvedValue({ status: "ok", data: "" });
    mocks.loadFolderMaterial.mockResolvedValue({
      id: "mat-1",
      filename: "programme.txt",
      contentType: "text/plain",
      sizeBytes: 16,
      relativePath: "materials/programme.txt",
    });
    mocks.folderAttachmentRead.mockResolvedValue({
      status: "ok",
      data: Array.from(new TextEncoder().encode("Séance 1 : accueil")),
    });
  });

  it("reads the material of the folder page the chat was opened from", async () => {
    const { result } = renderHook(() =>
      useChatContextPipeline({
        messages: [],
        folderId: "Projets/Atelier",
        pendingManualRefs: [],
      }),
    );

    // Le filtre de dossier de la barre latérale n'existe plus : il reste nul.
    const readFolderMaterial = buildReadFolderMaterialTool({
      getFolderFilter: () => null,
    } as never);
    const transport = new CustomChatTransport({} as never, {
      read_folder_material: readFolderMaterial,
    });

    await transport.sendMessages({
      chatId: "chat-1",
      abortSignal: undefined,
      messageId: undefined,
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Que dit le programme ?" }],
          metadata: { contextRefs: result.current.pendingRefs },
        },
      ],
      trigger: "submit-message",
    });

    const { tools, toolsContext } = mocks.agentOptions.mock.calls[0]![0];
    const output = await tools.read_folder_material.execute(
      { materialId: "mat-1" },
      { context: toolsContext.read_folder_material },
    );

    expect(mocks.loadFolderMaterial).toHaveBeenCalledWith(
      "Projets/Atelier",
      "mat-1",
    );
    expect(output).toMatchObject({
      status: "ok",
      materialId: "mat-1",
      contextText: "Séance 1 : accueil",
    });
  });
});
