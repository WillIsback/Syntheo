import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import {
  AppWindow,
  CalendarBlank,
  ClockCounterClockwise,
  DotsThree,
  FileText,
  PictureInPicture,
  Waveform,
} from "@syntheo/ui/components/icons";
import { Button } from "@syntheo/ui/components/ui/button";
import {
  AppFloatingPanel,
  appFloatingMenuPanelClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@syntheo/ui/components/ui/dropdown-menu";

import { MetadataPanelContent } from "../metadata";
import { AlwaysOnTop } from "./always-on-top";
import { DeleteNote } from "./delete";
import { LockNote } from "./lock-note";

import { NoteMenuAutomationItems } from "~/automations/launch";
import { openFloatingMeetingPanel } from "~/meeting-float/host";
import { isFloatingBarSupported } from "~/meeting-float/support";
import {
  useCurrentNoteHasContent,
  useHasTranscript,
} from "~/session/components/shared";
import { VersionHistoryDialog } from "~/session/components/version-history-dialog";
import { openStandaloneNoteWindow } from "~/session/window";
import { useConfigValue } from "~/shared/config";
import type { EditorView } from "~/store/zustand/tabs/schema";
import { describeAudioImportUnavailable } from "~/stt/audio-import-feedback";
import { useListener } from "~/stt/contexts";
import { useUploadFile } from "~/stt/useUploadFile";

// L'écoute et l'export vivent dans la capsule (Ctrl+P compris) : ce menu ne
// garde que les actions qu'on ne trouve pas ailleurs (issue 458).
export function OverflowButton({
  standaloneWindow = false,
  sessionId,
  currentView,
}: {
  standaloneWindow?: boolean;
  sessionId: string;
  currentView: EditorView;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [hasOpenedVersionHistory, setHasOpenedVersionHistory] = useState(false);
  const hasTranscript = useHasTranscript(sessionId);
  const currentNoteHasContent = useCurrentNoteHasContent(
    sessionId,
    currentView,
  );
  const { audioImportAvailability, uploadAudio, uploadTranscript } =
    useUploadFile(sessionId);
  // Grisée mais cliquable : l'infobulle et le message expliquent pourquoi,
  // avec un lien vers les réglages (issue 462).
  const audioImportUnavailableReason = describeAudioImportUnavailable(
    audioImportAvailability,
  );
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const floatingBarEnabled = useConfigValue("floating_bar_enabled");
  const floatingBarSupported = isFloatingBarSupported();
  const isMeetingInProgress =
    sessionMode === "active" || sessionMode === "finalizing";
  // Syntheo ne conserve jamais l'audio : l'import n'est proposé que tant
  // que la note est vide.
  const showUploadActions =
    !hasTranscript && !currentNoteHasContent && !isMeetingInProgress;
  const canOpenFloatingPanel =
    floatingBarSupported && floatingBarEnabled && sessionMode === "active";
  const openVersionHistory = () => {
    setOpen(false);
    setHasOpenedVersionHistory(true);
    requestAnimationFrame(() => setIsVersionHistoryOpen(true));
  };
  const handleUploadAudio = () => {
    setOpen(false);
    uploadAudio();
  };
  const handleUploadTranscript = () => {
    setOpen(false);
    uploadTranscript();
  };
  const handleOpenFloatingPanel = () => {
    setOpen(false);
    void openFloatingMeetingPanel({
      sessionId,
      enabled: floatingBarEnabled,
    });
  };
  const handleOpenStandaloneWindow = () => {
    setOpen(false);
    void openStandaloneNoteWindow(sessionId);
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            data-tauri-drag-region="false"
            aria-label={t`More`}
            className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-full [&_svg]:size-4"
          >
            <DotsThree className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent variant="app" align="end" className="w-56">
          <AppFloatingPanel className={appFloatingMenuPanelClassName}>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <CalendarBlank />
                <span>
                  <Trans>Meeting info</Trans>
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  variant="app"
                  className="w-72 overflow-hidden"
                >
                  <MetadataPanelContent sessionId={sessionId} />
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={openVersionHistory}
              className="cursor-pointer"
            >
              <ClockCounterClockwise />
              <span>
                <Trans>Version history</Trans>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {showUploadActions && (
              <>
                <DropdownMenuItem
                  onClick={handleUploadAudio}
                  aria-disabled={
                    audioImportUnavailableReason ? true : undefined
                  }
                  title={audioImportUnavailableReason ?? undefined}
                  className={
                    audioImportUnavailableReason
                      ? "cursor-pointer opacity-50"
                      : "cursor-pointer"
                  }
                >
                  <Waveform />
                  <span>
                    <Trans>Upload audio</Trans>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleUploadTranscript}
                  className="cursor-pointer"
                >
                  <FileText />
                  <span>
                    <Trans>Upload transcript</Trans>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {/* Porte son propre séparateur quand une automatisation est prête. */}
            {isMeetingInProgress ? null : (
              <NoteMenuAutomationItems sessionId={sessionId} />
            )}
            {!standaloneWindow && (
              <DropdownMenuItem
                onClick={handleOpenStandaloneWindow}
                className="cursor-pointer"
              >
                <AppWindow />
                <span>
                  <Trans>Open in New Window</Trans>
                </span>
              </DropdownMenuItem>
            )}
            {canOpenFloatingPanel && (
              <DropdownMenuItem
                onClick={handleOpenFloatingPanel}
                className="cursor-pointer"
              >
                <PictureInPicture />
                <span>
                  <Trans>Open floating panel</Trans>
                </span>
              </DropdownMenuItem>
            )}
            <AlwaysOnTop />
            <DropdownMenuSeparator />
            <LockNote sessionId={sessionId} />
            <DeleteNote sessionId={sessionId} />
          </AppFloatingPanel>
        </DropdownMenuContent>
      </DropdownMenu>
      {hasOpenedVersionHistory && (
        <VersionHistoryDialog
          sessionId={sessionId}
          open={isVersionHistoryOpen}
          onOpenChange={setIsVersionHistoryOpen}
        />
      )}
    </>
  );
}
