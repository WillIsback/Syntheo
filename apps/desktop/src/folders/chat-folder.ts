import { useFolderSelection } from "./selection";

import { useTabs } from "~/store/zustand/tabs";

// Sur la page d'un dossier, le chat (« Demander au dossier », Ctrl+J) prend
// ce dossier pour contexte (issue 496).
export function useFolderPageChatFolder(): string | null {
  const onFolderPage = useTabs((state) => state.currentTab?.type === "folders");
  const selectedPath = useFolderSelection((state) => state.selectedPath);
  return onFolderPage && selectedPath ? selectedPath : null;
}
