import type { StoreApi } from "zustand";

type ChatMode = "FloatingOpen" | "FloatingClosed" | "RightPanelOpen";

type ChatEvent =
  | { type: "OPEN" }
  | { type: "OPEN_RIGHT_PANEL" }
  | { type: "CLOSE" }
  | { type: "TOGGLE" };

export type ChatModeState = {
  chatMode: ChatMode;
  // Synthèse coupée par l'administration (issue 718) : le chat ne s'ouvre
  // plus, quelle que soit l'entrée (Ctrl+J, capsule, dossier, palette).
  chatBlocked: boolean;
};

export type ChatModeActions = {
  transitionChatMode: (event: ChatEvent) => void;
  setChatBlocked: (blocked: boolean) => void;
};

const computeNextChatMode = (state: ChatMode, event: ChatEvent): ChatMode => {
  switch (state) {
    case "FloatingOpen":
      if (event.type === "CLOSE" || event.type === "TOGGLE") {
        return "FloatingClosed";
      }
      if (event.type === "OPEN_RIGHT_PANEL") {
        return "RightPanelOpen";
      }
      return state;
    case "RightPanelOpen":
      if (event.type === "CLOSE" || event.type === "TOGGLE") {
        return "FloatingClosed";
      }
      if (event.type === "OPEN") {
        return "FloatingOpen";
      }
      return state;
    case "FloatingClosed":
      if (event.type === "OPEN" || event.type === "TOGGLE") {
        return "FloatingOpen";
      }
      if (event.type === "OPEN_RIGHT_PANEL") {
        return "RightPanelOpen";
      }
      return state;
    default:
      return state;
  }
};

export const createChatModeSlice = <T extends ChatModeState>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): ChatModeState & ChatModeActions => ({
  chatMode: "FloatingClosed",
  chatBlocked: false,
  setChatBlocked: (blocked) => {
    if (get().chatBlocked === blocked) return;
    set({
      chatBlocked: blocked,
      ...(blocked ? { chatMode: "FloatingClosed" } : {}),
    } as Partial<T>);
  },
  transitionChatMode: (event) => {
    const currentMode = get().chatMode;
    const nextMode = computeNextChatMode(currentMode, event);
    if (nextMode === currentMode) return;
    if (get().chatBlocked && nextMode !== "FloatingClosed") return;

    set({
      chatMode: nextMode,
    } as Partial<T>);
  },
});
