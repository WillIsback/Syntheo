import type { ChatModeState } from "./chat-mode";
import type { NavigationState, TabHistory } from "./navigation";
import { pushHistory, updateHistoryCurrent } from "./navigation";
import {
  getDefaultState,
  isSameTab,
  type Tab,
  type TabInput,
  uniqueIdfromTab,
} from "./schema";

import { id } from "~/shared/utils";

export const RETURN_ORIGIN_TAB_TYPES: Tab["type"][] = [
  "automations",
  "contacts",
  "folders",
  "settings",
  "templates",
];

// Écrans ouverts depuis une entrée des Paramètres qui remplacent l'écran des
// Paramètres (issue 443) : ouverts depuis les Paramètres, ils proposent
// « ← Paramètres » et le raccourci Retour y ramène.
export const SETTINGS_RETURN_TAB_TYPES: Tab["type"][] = [
  "automations",
  "contacts",
  "folders",
  "templates",
];

export type BasicState = {
  tabs: Tab[];
  currentTab: Tab | null;
};

export const setActiveFlags = (tabs: Tab[], activeTab: Tab): Tab[] => {
  return tabs.map((t) => ({ ...t, active: isSameTab(t, activeTab) }));
};

const deactivateAll = (tabs: Tab[]): Tab[] => {
  return tabs.map((t) => ({ ...t, active: false }));
};

export const findNextActiveIndex = (
  tabs: Tab[],
  closedIndex: number,
): number => {
  return closedIndex < tabs.length ? closedIndex : tabs.length - 1;
};

export const findReturnOriginIndex = (tabs: Tab[], closedTab: Tab): number => {
  if (!closedTab.returnToSlotId) {
    return -1;
  }
  return tabs.findIndex(
    (tab) =>
      tab.slotId === closedTab.returnToSlotId &&
      (!closedTab.returnToTabId ||
        uniqueIdfromTab(tab) === closedTab.returnToTabId),
  );
};

const updateWithHistory = <T extends BasicState & NavigationState>(
  tabs: Tab[],
  currentTab: Tab,
  history: Map<string, TabHistory>,
): Partial<T> => {
  const nextHistory = pushHistory(history, currentTab);
  return { tabs, currentTab, history: nextHistory } as Partial<T>;
};

export const openTab = <T extends BasicState & NavigationState>(
  tabs: Tab[],
  newTab: TabInput,
  history: Map<string, TabHistory>,
  forceNewTab: boolean,
  position?: "start" | "end",
): Partial<T> => {
  const tabWithDefaults: Tab = {
    ...getDefaultState(newTab),
    active: false,
    slotId: id(),
  };
  const activeOriginTab = tabs.find((tab) => tab.active);
  const returnOrigin =
    shouldTrackReturnOrigin(tabWithDefaults) &&
    activeOriginTab &&
    !isSameTab(activeOriginTab, tabWithDefaults)
      ? {
          returnToSlotId: activeOriginTab.slotId,
          returnToTabId: uniqueIdfromTab(activeOriginTab),
          ...(activeOriginTab.type === "settings" &&
          SETTINGS_RETURN_TAB_TYPES.includes(tabWithDefaults.type)
            ? { returnToSettingsTab: activeOriginTab.state.tab ?? "app" }
            : {}),
        }
      : undefined;
  const tabWithOrigin = returnOrigin
    ? { ...tabWithDefaults, ...returnOrigin }
    : tabWithDefaults;

  let nextTabs: Tab[];
  let activeTab: Tab;

  const existingTab = tabs.find((t) => isSameTab(t, tabWithOrigin));
  const isNewTab = !existingTab;

  if (!isNewTab) {
    const nextExistingTab = reuseExistingTab(existingTab!, tabWithOrigin, {
      preserveReturnOrigin:
        existingTab!.active && !tabWithOrigin.returnToSlotId,
    });
    nextTabs = tabs.map((tab) =>
      isSameTab(tab, existingTab!)
        ? { ...nextExistingTab, active: true }
        : { ...tab, active: false },
    );
    const currentTab = { ...nextExistingTab, active: true };
    return {
      tabs: nextTabs,
      currentTab,
      history: updateHistoryCurrent(history, currentTab),
    } as Partial<T>;
  }

  if (!forceNewTab) {
    const existingActiveIdx = tabs.findIndex((t) => t.active);
    const currentActiveTab = tabs[existingActiveIdx];

    if (existingActiveIdx !== -1 && currentActiveTab) {
      activeTab = {
        ...tabWithOrigin,
        active: true,
        slotId: currentActiveTab.slotId,
      };

      const tabsWithFreshOrigins = clearReturnOriginsForSlot(
        tabs,
        currentActiveTab.slotId,
      );
      nextTabs = tabsWithFreshOrigins.map((t, idx) => {
        if (idx === existingActiveIdx) {
          return activeTab;
        }
        return { ...t, active: false };
      });
    } else {
      activeTab = { ...tabWithOrigin, active: true, slotId: id() };
      const deactivated = deactivateAll(tabs);
      nextTabs = [...deactivated, activeTab];
    }

    return updateWithHistory(nextTabs, activeTab, history);
  } else {
    activeTab = { ...tabWithOrigin, active: true, slotId: id() };
    const deactivated = deactivateAll(tabs);

    if (position === "start") {
      const pinnedCount = deactivated.filter((t) => t.pinned).length;
      nextTabs = [
        ...deactivated.slice(0, pinnedCount),
        activeTab,
        ...deactivated.slice(pinnedCount),
      ];
    } else {
      nextTabs = [...deactivated, activeTab];
    }

    return updateWithHistory(nextTabs, activeTab, history);
  }
};

const reuseExistingTab = (
  existingTab: Tab,
  requestedTab: Tab,
  {
    preserveReturnOrigin,
  }: {
    preserveReturnOrigin: boolean;
  },
): Tab => {
  if (existingTab.type === "changelog" && requestedTab.type === "changelog") {
    return {
      ...applyReturnOriginForReuse(
        existingTab,
        requestedTab,
        preserveReturnOrigin,
      ),
      state: requestedTab.state,
    };
  }

  if (existingTab.type === "settings" && requestedTab.type === "settings") {
    const nextTab = applyReturnOriginForReuse(
      existingTab,
      requestedTab,
      preserveReturnOrigin,
    );

    return {
      ...nextTab,
      state: requestedTab.state,
    };
  }

  if (existingTab.type === "contacts" && requestedTab.type === "contacts") {
    const nextTab = applyReturnOriginForReuse(
      existingTab,
      requestedTab,
      preserveReturnOrigin,
    );

    return {
      ...nextTab,
      state: requestedTab.state,
    };
  }

  if (
    existingTab.type === "sessions" &&
    requestedTab.type === "sessions" &&
    requestedTab.state.autoStart
  ) {
    const nextTab = applyReturnOriginForReuse(
      existingTab,
      requestedTab,
      preserveReturnOrigin,
    );

    return {
      ...nextTab,
      state: {
        ...nextTab.state,
        autoStart: true,
      },
    };
  }

  return applyReturnOriginForReuse(
    existingTab,
    requestedTab,
    preserveReturnOrigin,
  );
};

// Onglets « de passage » dont on retient l'origine. La revue d'une proposition
// (« edit ») n'est pas un onglet de navigation (Échap ne la quitte pas, cf.
// RETURN_ORIGIN_TAB_TYPES), mais sa fermeture doit ramener à la note d'origine.
const shouldTrackReturnOrigin = (tab: Tab): boolean =>
  RETURN_ORIGIN_TAB_TYPES.includes(tab.type) || tab.type === "edit";

export const clearReturnOriginsForSlot = (
  tabs: Tab[],
  slotId: string,
): Tab[] => {
  return tabs.map((tab) =>
    tab.returnToSlotId === slotId ? clearReturnOrigin(tab) : tab,
  );
};

const applyReturnOriginForReuse = <T extends Tab>(
  existingTab: T,
  requestedTab: Tab,
  preserveReturnOrigin: boolean,
): T => {
  if (requestedTab.returnToSlotId) {
    const nextTab: T = {
      ...existingTab,
      returnToSlotId: requestedTab.returnToSlotId,
      returnToTabId: requestedTab.returnToTabId,
      returnToSettingsTab: requestedTab.returnToSettingsTab,
    };
    if (!requestedTab.returnToSettingsTab) {
      delete nextTab.returnToSettingsTab;
    }
    return nextTab;
  }

  return preserveReturnOrigin ? existingTab : clearReturnOrigin(existingTab);
};

const clearReturnOrigin = <T extends Tab>(tab: T): T => {
  if (!tab.returnToSlotId && !tab.returnToTabId && !tab.returnToSettingsTab) {
    return tab;
  }

  const nextTab = { ...tab };
  delete nextTab.returnToSlotId;
  delete nextTab.returnToTabId;
  delete nextTab.returnToSettingsTab;
  return nextTab;
};

export const getChatModeForNavigation = (
  currentTab: Tab | null | undefined,
  targetTab: Tab | TabInput,
  chatMode: ChatModeState["chatMode"],
): ChatModeState["chatMode"] | null => {
  if (chatMode === "FloatingClosed") {
    return null;
  }

  if (targetTab.type === "settings") {
    return "FloatingClosed";
  }

  if (
    targetTab.type === "shared_sessions" ||
    targetTab.type === "shared_note_preview"
  ) {
    return "FloatingClosed";
  }

  if (targetTab.type !== "sessions") {
    return null;
  }

  return currentTab?.type !== "sessions" || currentTab.id !== targetTab.id
    ? "FloatingClosed"
    : null;
};

export const withChatModeForNavigation = <T extends ChatModeState>(
  state: Partial<T>,
  chatMode: ChatModeState["chatMode"] | null,
): Partial<T> => {
  if (!chatMode) {
    return state;
  }

  return {
    ...state,
    chatMode,
  } as Partial<T>;
};
