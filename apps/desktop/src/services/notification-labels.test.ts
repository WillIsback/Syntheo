import { i18n } from "@lingui/core";
import { afterEach, describe, expect, test, vi } from "vitest";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

const { showNotificationMock } = vi.hoisted(() => ({
  showNotificationMock: vi.fn(),
}));

vi.mock("@syntheo/plugin-notification", () => ({
  commands: { showNotification: showNotificationMock },
}));

import {
  nativeNotificationLabels,
  showNativeNotification,
} from "./notification-labels";

const notification = {
  key: "test",
  title: "Title",
  message: "",
  timeout: null,
  source: null,
  start_time: null,
  action_label: null,
  action_variant: null,
  options: ["Note A"],
  footer: null,
  icon: null,
};

describe("showNativeNotification", () => {
  afterEach(() => {
    i18n.activate("en");
    showNotificationMock.mockReset();
  });

  test("sends the labels in the active interface language", async () => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
    showNotificationMock.mockResolvedValue({ status: "ok", data: null });

    await showNativeNotification(notification);

    expect(showNotificationMock).toHaveBeenCalledOnce();
    const sent = showNotificationMock.mock.calls[0][0];
    expect(sent).toMatchObject({ key: "test", options: ["Note A"] });
    expect(sent.labels).toMatchObject({
      startingSoon: "Démarrage imminent",
      startingInOther: "Démarrage dans {minutes} minutes",
      showLess: "Afficher moins",
      createNewNote: "Créer une note…",
    });
  });

  test("keeps labels provided by the caller", async () => {
    showNotificationMock.mockResolvedValue({ status: "ok", data: null });
    const labels = { ...nativeNotificationLabels(), options: "Custom" };

    await showNativeNotification({ ...notification, labels });

    expect(showNotificationMock.mock.calls[0][0].labels).toBe(labels);
  });
});
