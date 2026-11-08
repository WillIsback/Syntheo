import {
  RETURN_ORIGIN_TAB_TYPES,
  SETTINGS_RETURN_TAB_TYPES,
  type SettingsTab,
  type Tab,
  uniqueIdfromTab,
  useTabs,
} from "~/store/zustand/tabs";

export function leaveAllOverlayTabs() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { currentTab } = useTabs.getState();
    if (!currentTab) return;
    if (!RETURN_ORIGIN_TAB_TYPES.includes(currentTab.type)) return;
    const { slotId } = currentTab;
    leaveOverlayTab();
    if (useTabs.getState().currentTab?.slotId === slotId) return;
  }
}

export function leaveOverlayTab() {
  const { tabs, currentTab, select, goBack, canGoBack } = useTabs.getState();

  if (currentTab?.type === "onboarding" || currentTab?.type === "empty") {
    return;
  }

  if (settingsReturnSection(currentTab)) {
    goBackToSettings();
    return;
  }

  const returnToSlotId = currentTab?.returnToSlotId;
  const returnToTab = returnToSlotId
    ? tabs.find(
        (tab) =>
          tab.slotId === returnToSlotId &&
          tab.slotId !== currentTab.slotId &&
          (!currentTab.returnToTabId ||
            uniqueIdfromTab(tab) === currentTab.returnToTabId),
      )
    : null;
  if (returnToTab) {
    select(returnToTab);
    return;
  }

  if (returnToSlotId === currentTab?.slotId && canGoBack) {
    goBack();
    return;
  }

  openHome();
}

// Bouton « Accueil » de la barre de titre (issue 315) : va droit à l'accueil,
// quel que soit l'écran d'origine (note, réglages, vue ouverte depuis une note).
export function goHome() {
  const { currentTab } = useTabs.getState();
  if (currentTab?.type === "onboarding" || currentTab?.type === "empty") {
    return;
  }

  openHome();
}

// Alt+← : revient à l'écran précédent de l'historique s'il existe, sinon à
// l'accueil.
export function goBackOrHome() {
  const { currentTab, canGoBack, goBack } = useTabs.getState();
  if (currentTab?.type === "onboarding") {
    return;
  }

  if (settingsReturnSection(currentTab)) {
    goBackToSettings();
    return;
  }

  if (canGoBack) {
    goBack();
    return;
  }

  goHome();
}

// Section des Paramètres d'où l'écran courant a été ouvert (issue 443), ou
// null s'il a été ouvert autrement (accueil, note, palette…).
export function settingsReturnSection(
  tab: Pick<Tab, "type" | "returnToSettingsTab"> | null | undefined,
): SettingsTab | null {
  if (!tab?.returnToSettingsTab) {
    return null;
  }
  return SETTINGS_RETURN_TAB_TYPES.includes(tab.type)
    ? tab.returnToSettingsTab
    : null;
}

// « ← Paramètres » (issue 443) : revient à la section des Paramètres d'où
// l'on a ouvert Modèles, Calendrier, Dossiers, Contacts ou Automatisations.
export function goBackToSettings() {
  const { tabs, currentTab, select, openCurrent, updateSettingsTabState } =
    useTabs.getState();
  const section = settingsReturnSection(currentTab);
  if (!currentTab || !section) {
    return;
  }

  const settingsTab = tabs.find(
    (tab) => tab.type === "settings" && tab.slotId !== currentTab.slotId,
  );
  if (!settingsTab) {
    openCurrent({ type: "settings", state: { tab: section } });
    return;
  }

  select(settingsTab);
  if (settingsTab.type === "settings" && settingsTab.state.tab !== section) {
    updateSettingsTabState(settingsTab, { tab: section });
  }
}

function openHome() {
  const { tabs, select, openCurrent } = useTabs.getState();
  const existingHomeTab = tabs.find((tab) => tab.type === "empty");
  if (existingHomeTab) {
    select(existingHomeTab);
    return;
  }

  openCurrent({ type: "empty" });
}
