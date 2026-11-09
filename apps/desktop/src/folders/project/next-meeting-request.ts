// « Préparer l'ordre du jour de la prochaine réunion », proposé dans
// « Demander à la note » (Ctrl+J) pour une note rangée dans un dossier
// (issue 491) : on renvoie vers le bloc « Prochaine réunion » de la page du
// dossier, qui propose l'ordre du jour s'il n'existe pas encore. Une seule
// génération, un seul ordre du jour, quel que soit le chemin.

import { create } from "zustand";

import { useFolderSelection } from "../selection";

import { useTabs } from "~/store/zustand/tabs";

export const useNextMeetingRequest = create<{
  folderPath: string | null;
  request: (folderPath: string) => void;
  clear: () => void;
}>((set) => ({
  folderPath: null,
  request: (folderPath) => set({ folderPath }),
  clear: () => set({ folderPath: null }),
}));

export function openNextMeetingBlock(folderPath: string) {
  useFolderSelection.getState().setSelectedPath(folderPath);
  useNextMeetingRequest.getState().request(folderPath);
  const tabs = useTabs.getState();
  tabs.openNew({ type: "folders" });
  tabs.transitionChatMode({ type: "CLOSE" });
}
