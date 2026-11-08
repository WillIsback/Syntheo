import type { ToolRegistry } from "~/contexts/tool-registry/core";
import type { AITaskStore } from "~/store/zustand/ai-task";
import type { ListenerStore } from "~/store/zustand/listener";

/** Résultat d'une commande tauri-specta en mode `ErrorHandlingMode::Result`. */
export type Result<T, E> =
  | { status: "ok"; data: T }
  | { status: "error"; error: E };

export type Context = {
  listenerStore: ListenerStore;
  aiTaskStore: AITaskStore;
  toolRegistry: ToolRegistry;
};
