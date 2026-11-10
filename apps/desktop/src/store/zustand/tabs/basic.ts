import type { StoreApi } from "zustand";

import {
  type BasicState,
  clearReturnOriginsForSlot,
  findNextActiveIndex,
  findReturnOriginIndex,
  getChatModeForNavigation,
  openTab,
  setActiveFlags,
  withChatModeForNavigation,
} from "./basic-open-tab";
import type { ChatModeState } from "./chat-mode";
import type { LifecycleState } from "./lifecycle";
import type { NavigationState } from "./navigation";
import type {
  RecentlyOpenedActions,
  RecentlyOpenedState,
} from "./recently-opened";
import { isSameTab, type Tab, type TabInput } from "./schema";

import { listenerStore } from "~/store/zustand/listener/instance";

export {
  RETURN_ORIGIN_TAB_TYPES,
  SETTINGS_RETURN_TAB_TYPES,
  type BasicState,
} from "./basic-open-tab";

export type BasicActions = {
  openCurrent: (tab: TabInput) => void;
  openNew: (tab: TabInput, options?: { position?: "start" | "end" }) => void;
  select: (tab: Tab) => void;
  clearSelection: () => void;
  selectNext: () => void;
  selectPrev: () => void;
  close: (tab: Tab) => void;
  reorder: (tabs: Tab[]) => void;
  closeOthers: (tab: Tab) => void;
  closeAll: () => void;
  pin: (tab: Tab) => void;
  unpin: (tab: Tab) => void;
};

export const createBasicSlice = <
  T extends BasicState &
    NavigationState &
    LifecycleState &
    RecentlyOpenedState &
    RecentlyOpenedActions &
    ChatModeState,
>(
  set: StoreApi<T>["setState"],
  get: StoreApi<T>["getState"],
): BasicState & BasicActions => ({
  tabs: [],
  currentTab: null,
  openCurrent: (tab) => {
    const { tabs, history, addRecentlyOpened, chatMode } = get();
    const currentActiveTab = tabs.find((t) => t.active);
    const nextChatMode = getChatModeForNavigation(
      currentActiveTab,
      tab,
      chatMode,
    );

    const isCurrentTabListening =
      currentActiveTab?.type === "sessions" &&
      currentActiveTab.id === listenerStore.getState().live.sessionId &&
      (listenerStore.getState().live.status === "active" ||
        listenerStore.getState().live.status === "finalizing");

    if (currentActiveTab?.pinned || isCurrentTabListening) {
      set(
        withChatModeForNavigation(
          openTab(tabs, tab, history, true),
          nextChatMode,
        ),
      );
    } else {
      set(
        withChatModeForNavigation(
          openTab(tabs, tab, history, false),
          nextChatMode,
        ),
      );
    }

    if (tab.type === "sessions") {
      addRecentlyOpened(tab.id);
    }
  },
  openNew: (tab, options) => {
    const { tabs, history, addRecentlyOpened, chatMode } = get();
    const currentActiveTab = tabs.find((t) => t.active);
    const nextChatMode = getChatModeForNavigation(
      currentActiveTab,
      tab,
      chatMode,
    );

    set(
      withChatModeForNavigation(
        openTab(tabs, tab, history, true, options?.position),
        nextChatMode,
      ),
    );

    if (tab.type === "sessions") {
      addRecentlyOpened(tab.id);
    }
  },
  select: (tab) => {
    const { tabs, addRecentlyOpened, chatMode } = get();
    const currentActiveTab = tabs.find((t) => t.active);
    const nextChatMode = getChatModeForNavigation(
      currentActiveTab,
      tab,
      chatMode,
    );
    const nextTabs = setActiveFlags(tabs, tab);
    const currentTab = nextTabs.find((t) => t.active) || null;
    set(
      withChatModeForNavigation(
        { tabs: nextTabs, currentTab } as Partial<T>,
        nextChatMode,
      ),
    );

    if (tab.type === "sessions") {
      addRecentlyOpened(tab.id);
    }
  },
  clearSelection: () => {
    const { tabs } = get();
    set({
      tabs: tabs.map((tab) => ({ ...tab, active: false })),
      currentTab: null,
    } as Partial<T>);
  },
  selectNext: () => {
    const { tabs, currentTab, chatMode } = get();
    if (tabs.length === 0 || !currentTab) return;

    const currentIndex = tabs.findIndex((t) => isSameTab(t, currentTab));
    const nextIndex = (currentIndex + 1) % tabs.length;
    const nextTab = tabs[nextIndex];
    const nextChatMode = getChatModeForNavigation(
      currentTab,
      nextTab,
      chatMode,
    );

    const nextTabs = setActiveFlags(tabs, nextTab);
    set(
      withChatModeForNavigation(
        {
          tabs: nextTabs,
          currentTab: { ...nextTab, active: true },
        } as Partial<T>,
        nextChatMode,
      ),
    );
  },
  selectPrev: () => {
    const { tabs, currentTab, chatMode } = get();
    if (tabs.length === 0 || !currentTab) return;

    const currentIndex = tabs.findIndex((t) => isSameTab(t, currentTab));
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    const prevTab = tabs[prevIndex];
    const nextChatMode = getChatModeForNavigation(
      currentTab,
      prevTab,
      chatMode,
    );

    const nextTabs = setActiveFlags(tabs, prevTab);
    set(
      withChatModeForNavigation(
        {
          tabs: nextTabs,
          currentTab: { ...prevTab, active: true },
        } as Partial<T>,
        nextChatMode,
      ),
    );
  },
  close: (tab) => {
    const { tabs, history, canClose, chatMode } = get();
    const tabToClose = tabs.find((t) => isSameTab(t, tab));

    if (!tabToClose) {
      return;
    }

    if (canClose && !canClose(tabToClose)) {
      return;
    }

    const remainingTabs = clearReturnOriginsForSlot(
      tabs.filter((t) => !isSameTab(t, tab)),
      tabToClose.slotId,
    );

    if (remainingTabs.length === 0) {
      set({
        tabs: [],
        currentTab: null,
        history: new Map(),
        canGoBack: false,
        canGoNext: false,
      } as unknown as Partial<T>);
      return;
    }

    const closedTabIndex = tabs.findIndex((t) => isSameTab(t, tab));
    // Sans barre d'onglets, fermer l'onglet affiché doit ramener là d'où il a
    // été ouvert (ex. revue d'une proposition du chat → la note courante), et
    // non sur le voisin positionnel, qui peut être une autre note.
    const originIndex = tabToClose.active
      ? findReturnOriginIndex(remainingTabs, tabToClose)
      : -1;
    const nextActiveIndex =
      originIndex === -1
        ? findNextActiveIndex(remainingTabs, closedTabIndex)
        : originIndex;
    const nextTabs = setActiveFlags(
      remainingTabs,
      remainingTabs[nextActiveIndex],
    );
    const nextCurrentTab = nextTabs[nextActiveIndex];
    const nextChatMode = tabToClose.active
      ? getChatModeForNavigation(tabToClose, nextCurrentTab, chatMode)
      : null;

    const nextHistory = new Map(history);
    nextHistory.delete(tabToClose.slotId);

    set(
      withChatModeForNavigation(
        {
          tabs: nextTabs,
          currentTab: nextCurrentTab,
          history: nextHistory,
        } as Partial<T>,
        nextChatMode,
      ),
    );
  },
  reorder: (tabs) => {
    const currentTab = tabs.find((t) => t.active) || null;
    set({ tabs, currentTab } as Partial<T>);
  },
  closeOthers: (tab) => {
    const { tabs, history } = get();
    const tabToKeep = tabs.find((t) => isSameTab(t, tab));

    if (!tabToKeep) {
      return;
    }

    const nextHistory = new Map(history);
    const tabWithActiveFlag = { ...tabToKeep, active: true };
    const nextTabs = [tabWithActiveFlag];

    Array.from(history.keys()).forEach((slotId) => {
      if (slotId !== tabToKeep.slotId) {
        nextHistory.delete(slotId);
      }
    });

    set({
      tabs: nextTabs,
      currentTab: tabWithActiveFlag,
      history: nextHistory,
    } as Partial<T>);
  },
  closeAll: () => {
    set({
      tabs: [],
      currentTab: null,
      history: new Map(),
      canGoBack: false,
      canGoNext: false,
    } as unknown as Partial<T>);
  },
  pin: (tab) => {
    if (tab.type === "shared_sessions" || tab.type === "shared_note_preview") {
      return;
    }

    const { tabs } = get();
    const tabIndex = tabs.findIndex((t) => isSameTab(t, tab));
    if (tabIndex === -1) return;

    const pinnedTab = { ...tabs[tabIndex], pinned: true };
    const pinnedCount = tabs.filter((t) => t.pinned).length;

    const nextTabs = [...tabs.slice(0, tabIndex), ...tabs.slice(tabIndex + 1)];
    nextTabs.splice(pinnedCount, 0, pinnedTab);

    const currentTab = nextTabs.find((t) => t.active) || null;
    set({ tabs: nextTabs, currentTab } as Partial<T>);
  },
  unpin: (tab) => {
    const { tabs } = get();
    const tabIndex = tabs.findIndex((t) => isSameTab(t, tab));
    if (tabIndex === -1) return;

    const unpinnedTab = { ...tabs[tabIndex], pinned: false };
    const pinnedCount = tabs.filter((t) => t.pinned).length;

    const nextTabs = [...tabs.slice(0, tabIndex), ...tabs.slice(tabIndex + 1)];
    nextTabs.splice(pinnedCount - 1, 0, unpinnedTab);

    const currentTab = nextTabs.find((t) => t.active) || null;
    set({ tabs: nextTabs, currentTab } as Partial<T>);
  },
});
