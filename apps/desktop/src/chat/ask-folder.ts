import type { JSONContent } from "@syntheo/editor/chat";

import { seedChatDraft } from "~/chat/components/input/hooks";
import { useChatContext } from "~/chat/state/chat-context";
import { folderDisplayName } from "~/session/folders";
import { useTabs } from "~/store/zustand/tabs";

// Brouillon « @dossier question » : la mention attache le contexte du dossier
// (ses notes, consignes et supports) au message, comme une mention tapée.
export function buildFolderQuestionDraft(
  folderPath: string,
  question: string,
): JSONContent {
  const text = question.trim();
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "mention-@",
            attrs: {
              id: folderPath,
              type: "folder",
              label: folderDisplayName(folderPath) || folderPath,
            },
          },
          { type: "text", text: text ? ` ${text}` : " " },
        ],
      },
    ],
  };
}

/**
 * « Demander au dossier » (palette `Ctrl+K`, issue 501) : ouvre une nouvelle
 * conversation dont le champ contient déjà le dossier mentionné et le texte
 * cherché. Rien n'est envoyé sans l'utilisateur.
 */
export function askFolder(folderPath: string, question: string) {
  const chat = useChatContext.getState();
  chat.startNewChat("general");
  const { sessionId } = useChatContext.getState().chatByScope.general;
  seedChatDraft(sessionId, buildFolderQuestionDraft(folderPath, question));
  const tabs = useTabs.getState();
  // Un panneau latéral déjà ouvert le reste ; sinon la bulle s'ouvre.
  if (tabs.chatMode !== "RightPanelOpen") {
    tabs.transitionChatMode({ type: "OPEN" });
  }
}
