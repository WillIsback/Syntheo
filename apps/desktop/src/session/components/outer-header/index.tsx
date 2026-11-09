import { cn } from "@syntheo/utils";

import { FolderPicker } from "../folder-picker";
import { OverflowButton } from "./overflow";

import {
  useWindowControlsGutter,
  WINDOW_CONTROLS_GUTTER_CLASS,
} from "~/shared/hooks/useWindowControlsGutter";
import type { EditorView, Tab } from "~/store/zustand/tabs/schema";

// Le titre vit désormais dans le document et les actions d'écoute dans la
// capsule : l'en-tête ne garde que le dossier et le menu « Plus ».
export function OuterHeader({
  sessionId,
  currentView,
  standaloneWindow = false,
}: {
  sessionId: string;
  currentView: EditorView;
  tab?: Extract<Tab, { type: "sessions" }>;
  standaloneWindow?: boolean;
}) {
  const showWindowControlsGutter = useWindowControlsGutter();

  return (
    <div
      data-tauri-drag-region
      className={cn([
        "relative flex w-full items-center gap-[2px]",
        // 46px content box centers the 28px controls at 23px, on the macOS
        // traffic-light baseline.
        "h-12 pb-0.5",
        // Plus de barre latérale : seul le gutter des feux macOS reste réservé.
        showWindowControlsGutter ? WINDOW_CONTROLS_GUTTER_CLASS : "pl-2",
      ])}
    >
      <div
        data-tauri-drag-region
        data-session-header-spacer
        className="min-h-full min-w-0 flex-1"
      />
      <div
        data-tauri-drag-region
        className="relative z-10 flex shrink-0 items-center pr-1"
      >
        <FolderPicker sessionId={sessionId} align="end" />
        <OverflowButton
          standaloneWindow={standaloneWindow}
          sessionId={sessionId}
          currentView={currentView}
        />
      </div>
    </div>
  );
}
