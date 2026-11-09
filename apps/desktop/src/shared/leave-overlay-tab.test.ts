import { beforeEach, describe, expect, test } from "vitest";

import {
  goBackOrHome,
  goBackToSettings,
  goHome,
  leaveOverlayTab,
  settingsReturnSection,
} from "./leave-overlay-tab";

import { type SettingsTab, type TabInput, useTabs } from "~/store/zustand/tabs";
import {
  createSessionTab,
  resetTabsStore,
} from "~/store/zustand/tabs/test-utils";

describe("goHome (bouton Accueil, issue 315)", () => {
  beforeEach(() => {
    resetTabsStore();
  });

  test("ramène une note à l'accueil", () => {
    useTabs.getState().openNew(createSessionTab({ id: "s1" }));

    goHome();

    expect(useTabs.getState().currentTab?.type).toBe("empty");
  });

  test("ramène les réglages à l'accueil, même ouverts depuis une note", () => {
    useTabs.getState().openNew(createSessionTab({ id: "s1" }));
    useTabs.getState().openNew({ type: "settings" });

    goHome();

    expect(useTabs.getState().currentTab?.type).toBe("empty");
  });

  test("réutilise l'accueil déjà ouvert", () => {
    useTabs.getState().openNew({ type: "empty" });
    const homeSlot = useTabs.getState().currentTab?.slotId;
    useTabs.getState().openNew(createSessionTab({ id: "s1" }));

    goHome();

    expect(useTabs.getState().currentTab?.slotId).toBe(homeSlot);
    expect(
      useTabs.getState().tabs.filter((t) => t.type === "empty"),
    ).toHaveLength(1);
  });

  test("ne fait rien sur l'accueil", () => {
    useTabs.getState().openNew({ type: "empty" });
    const before = useTabs.getState().currentTab;

    goHome();

    expect(useTabs.getState().currentTab).toBe(before);
  });
});

describe("goBackOrHome (Alt+←, issue 315)", () => {
  beforeEach(() => {
    resetTabsStore();
  });

  test("revient à l'écran précédent quand l'historique le permet", () => {
    useTabs.getState().openNew({ type: "empty" });
    useTabs.getState().openCurrent(createSessionTab({ id: "s1" }));
    useTabs.getState().openCurrent(createSessionTab({ id: "s2" }));

    goBackOrHome();

    const current = useTabs.getState().currentTab;
    expect(current?.type === "sessions" && current.id).toBe("s1");

    goBackOrHome();

    expect(useTabs.getState().currentTab?.type).toBe("empty");
  });

  test("ramène à l'accueil sans historique", () => {
    useTabs.getState().openNew(createSessionTab({ id: "s1" }));
    expect(useTabs.getState().canGoBack).toBe(false);

    goBackOrHome();

    expect(useTabs.getState().currentTab?.type).toBe("empty");
  });
});

describe("retour aux Paramètres (issue 443)", () => {
  const screens: TabInput[] = [
    { type: "templates" },
    { type: "calendar" },
    { type: "folders" },
    { type: "contacts" },
    { type: "automations" },
  ];

  beforeEach(() => {
    resetTabsStore();
  });

  function openFromSettings(destination: TabInput, section: SettingsTab) {
    useTabs.getState().openNew({ type: "empty" });
    useTabs.getState().openNew({ type: "settings", state: { tab: section } });
    useTabs.getState().openNew(destination);
  }

  function expectSettingsSection(section: SettingsTab) {
    const { currentTab } = useTabs.getState();
    expect(currentTab?.type).toBe("settings");
    expect(currentTab?.type === "settings" ? currentTab.state.tab : null).toBe(
      section,
    );
  }

  test.each(screens)(
    "$type ouvert depuis une section des Paramètres y revient",
    (destination) => {
      openFromSettings(destination, "meetings");
      expect(useTabs.getState().currentTab?.type).toBe(destination.type);
      expect(settingsReturnSection(useTabs.getState().currentTab)).toBe(
        "meetings",
      );

      goBackToSettings();

      expectSettingsSection("meetings");
    },
  );

  test.each(screens)(
    "raccourci Retour (Alt+←) : $type revient à la section des Paramètres",
    (destination) => {
      openFromSettings(destination, "privacy");

      goBackOrHome();

      expectSettingsSection("privacy");
    },
  );

  test.each(screens)(
    "Échap : $type revient à la section des Paramètres",
    (destination) => {
      openFromSettings(destination, "dictionary");

      leaveOverlayTab();

      expectSettingsSection("dictionary");
    },
  );

  test.each(screens)(
    "$type ouvert depuis l'accueil n'a pas de retour aux Paramètres",
    (destination) => {
      useTabs.getState().openNew({ type: "empty" });
      useTabs.getState().openNew(destination);

      expect(settingsReturnSection(useTabs.getState().currentTab)).toBeNull();

      goBackOrHome();

      expect(useTabs.getState().currentTab?.type).toBe("empty");
    },
  );

  test("rouvert depuis l'accueil, l'écran oublie son origine Paramètres", () => {
    openFromSettings({ type: "templates" }, "meetings");
    goHome();
    useTabs.getState().openNew({ type: "templates" });

    expect(useTabs.getState().currentTab?.type).toBe("templates");
    expect(settingsReturnSection(useTabs.getState().currentTab)).toBeNull();
  });

  test("revient à la section d'origine même si les Paramètres ont changé de section", () => {
    openFromSettings({ type: "calendar" }, "meetings");
    const settingsTab = useTabs
      .getState()
      .tabs.find((tab) => tab.type === "settings")!;
    useTabs.getState().updateSettingsTabState(settingsTab, { tab: "app" });

    goBackToSettings();

    expectSettingsSection("meetings");
  });

  test("rouvre les Paramètres sur la section d'origine s'ils ont été fermés", () => {
    openFromSettings({ type: "contacts" }, "notifications");
    const settingsTab = useTabs
      .getState()
      .tabs.find((tab) => tab.type === "settings")!;
    useTabs.getState().close(settingsTab);
    // La fermeture efface l'origine : on la rétablit pour simuler un onglet
    // des Paramètres disparu autrement.
    useTabs.setState((state) => ({
      currentTab: state.currentTab
        ? { ...state.currentTab, returnToSettingsTab: "notifications" }
        : null,
    }));

    goBackToSettings();

    expectSettingsSection("notifications");
  });

  test("les Paramètres eux-mêmes ne proposent pas de retour aux Paramètres", () => {
    useTabs.getState().openNew({ type: "settings", state: { tab: "app" } });

    expect(settingsReturnSection(useTabs.getState().currentTab)).toBeNull();
  });
});
