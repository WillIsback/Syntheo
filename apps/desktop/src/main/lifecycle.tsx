import { useRouteContext } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import { useLanguageModel, useLLMConnection } from "~/ai/hooks";
import { CommandConfirmationDialog } from "~/automations/command-confirmation-dialog";
import { registerAutomationLanguageModel } from "~/automations/language-model";
import { useSessionTab } from "~/chat/components/use-session-tab";
import { buildChatTools } from "~/chat/tools";
import { searchContacts } from "~/contacts/queries";
import { useRegisterTools } from "~/contexts/tool";
import { DictationLifecycle } from "~/dictation/lifecycle";
import { takePendingWelcomeSession } from "~/onboarding/welcome-note";
import { useSearchEngine } from "~/search/contexts/engine";
import { initEnhancerService } from "~/services/enhancer";
import { useConfigValue } from "~/shared/config";
import { useDesktopTabLifecycle } from "~/shared/desktop-tab-lifecycle";
import { folderIdForNewNote, useSidebarNotes } from "~/sidebar/note-filter";
import { useTabs } from "~/store/zustand/tabs";
import { BatchTranscriptionRecovery } from "~/stt/batch-transcription-recovery";
import { LiveCaptureRecovery } from "~/stt/live-capture-recovery";
import { RecordingImportWorker } from "~/stt/recording-import";
import { SystemAudioChangeNotice } from "~/stt/system-audio-change-notice";
import { MainListenerControlBridge } from "~/stt/window-control";

export function useClassicMainLifecycle() {
  const openNew = useTabs((state) => state.openNew);

  const openDefaultEmptyTab = useCallback(() => {
    openNew({ type: "empty" });
  }, [openNew]);

  const openPendingWelcomeTab = useCallback(() => {
    const welcomeSessionId = takePendingWelcomeSession();
    if (welcomeSessionId) {
      openNew({ type: "sessions", id: welcomeSessionId });
    }
  }, [openNew]);

  useDesktopTabLifecycle({
    onEmpty: openDefaultEmptyTab,
    onInitialized: openPendingWelcomeTab,
    onZeroTabs: openDefaultEmptyTab,
  });
}

export function ClassicMainServices() {
  return (
    <>
      <LiveCaptureRecovery />
      <SystemAudioChangeNotice />
      <BatchTranscriptionRecovery />
      <RecordingImportWorker />
      <MainListenerControlBridge />
      <DictationLifecycle />
      <ToolRegistration />
      <EnhancerInit />
      <CommandConfirmationDialog />
    </>
  );
}

function ToolRegistration() {
  const { search } = useSearchEngine();

  const getContactSearchResults = searchContacts;

  const { getSessionId, getEnhancedNoteId } = useSessionTab();
  const getFolderFilter = useCallback(() => {
    const { noteFilter, folderFilter } = useSidebarNotes.getState();
    return folderIdForNewNote(noteFilter, folderFilter) ?? null;
  }, []);
  const openEditTab = useCallback((requestId: string) => {
    useTabs.getState().openNew({ type: "edit", requestId });
  }, []);

  useRegisterTools(
    "chat-general",
    () =>
      buildChatTools({
        search,
        getContactSearchResults,
        getSessionId,
        getFolderFilter,
        getEnhancedNoteId,
        openEditTab,
      }),
    [
      search,
      getContactSearchResults,
      getSessionId,
      getFolderFilter,
      getEnhancedNoteId,
      openEditTab,
    ],
  );

  return null;
}

function EnhancerInit() {
  const { aiTaskStore } = useRouteContext({
    from: "__root__",
  });

  const model = useLanguageModel();
  const { conn: llmConn } = useLLMConnection();
  const selectedTemplateId = useConfigValue("selected_template_id");

  const modelRef = useRef(model);
  modelRef.current = model;
  const llmConnRef = useRef(llmConn);
  llmConnRef.current = llmConn;
  const templateIdRef = useRef(selectedTemplateId);
  templateIdRef.current = selectedTemplateId;

  // Étape « Générer avec le modèle local » : le même modèle que la synthèse.
  useEffect(() => registerAutomationLanguageModel(() => modelRef.current), []);

  useEffect(() => {
    if (!aiTaskStore) return;

    const service = initEnhancerService({
      aiTaskStore,
      getModel: () => modelRef.current,
      getLLMConn: () => llmConnRef.current,
      getSelectedTemplateId: () => templateIdRef.current || undefined,
    });

    return () => service.dispose();
  }, [aiTaskStore]);

  return null;
}
