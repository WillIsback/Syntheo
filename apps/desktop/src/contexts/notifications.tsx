import { createContext, type ReactNode, useMemo } from "react";

import { useConfigValues } from "~/shared/config";
import { useTabs } from "~/store/zustand/tabs";
import { useUsableTranscription } from "~/stt/usable-transcription";

interface NotificationState {
  hasActiveBanner: boolean;
  hasActiveEnhancement: boolean;
  notificationCount: number;
  shouldShowBadge: boolean;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { current_llm_provider, current_llm_model } = useConfigValues([
    "current_llm_provider",
    "current_llm_model",
  ] as const);
  const transcription = useUsableTranscription();

  const hasConfigBanner =
    !transcription.usable || !current_llm_provider || !current_llm_model;

  const hasActiveEnhancement = false;

  const currentTab = useTabs(
    (state: {
      currentTab: ReturnType<typeof useTabs.getState>["currentTab"];
    }) => state.currentTab,
  );
  const isAiTab =
    currentTab?.type === "settings" &&
    ["transcription", "intelligence"].includes(currentTab.state?.tab ?? "");

  const value = useMemo<NotificationState>(() => {
    const hasActiveBanner = hasConfigBanner && !isAiTab;
    const notificationCount =
      (hasActiveBanner ? 1 : 0) + (hasActiveEnhancement ? 1 : 0);

    return {
      hasActiveBanner,
      hasActiveEnhancement,
      notificationCount,
      shouldShowBadge: notificationCount > 0,
    };
  }, [hasConfigBanner, hasActiveEnhancement, isAiTab]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
