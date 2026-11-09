import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  seedChatDraft: vi.fn(),
  transitionChatMode: vi.fn(),
  chatMode: "FloatingClosed",
}));

vi.mock("~/chat/components/input/hooks", () => ({
  seedChatDraft: mocks.seedChatDraft,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: {
    getState: () => ({
      chatMode: mocks.chatMode,
      transitionChatMode: mocks.transitionChatMode,
    }),
  },
}));

import { askFolder, buildFolderQuestionDraft } from "./ask-folder";

import { useChatContext } from "~/chat/state/chat-context";

describe("askFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chatMode = "FloatingClosed";
  });

  it("mentionne le dossier puis reprend le texte cherché", () => {
    expect(buildFolderQuestionDraft("Clients/ACME", " livraison ")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "mention-@",
              attrs: { id: "Clients/ACME", type: "folder", label: "ACME" },
            },
            { type: "text", text: " livraison" },
          ],
        },
      ],
    });
  });

  it("ouvre une nouvelle conversation pré-remplie, sans l'envoyer", () => {
    const before = useChatContext.getState().chatByScope.general.sessionId;

    askFolder("Clients/ACME", "livraison");

    const after = useChatContext.getState().chatByScope.general.sessionId;
    expect(after).not.toBe(before);
    expect(mocks.seedChatDraft).toHaveBeenCalledWith(
      after,
      buildFolderQuestionDraft("Clients/ACME", "livraison"),
    );
    expect(mocks.transitionChatMode).toHaveBeenCalledWith({ type: "OPEN" });
  });

  it("garde le panneau latéral déjà ouvert", () => {
    mocks.chatMode = "RightPanelOpen";

    askFolder("Clients/ACME", "");

    expect(mocks.transitionChatMode).not.toHaveBeenCalled();
  });
});
