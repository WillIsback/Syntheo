import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { messages as frMessages } from "./locales/fr/messages";

import { getFloatingTitle } from "~/meeting-float/route-state";
import { getSummaryIneligibilityReason } from "~/services/enhancer/eligibility";
import { getCaptureWarning } from "~/store/zustand/listener/general-shared";
import { showMeetingEndedPrompt } from "~/stt/auto-stop";
import { cancelAutoStopEndedNotification } from "~/stt/auto-stop-notification";
import { getMicDetectedNotificationTitle } from "~/stt/detect-events";
import { getIgnoreAppsFooterText } from "~/stt/meeting-apps";
import { describeStartFailure } from "~/stt/start-failure";
import { getCaptureReminderMessage } from "~/stt/useStartListening";

const { showNotificationMock } = vi.hoisted(() => ({
  showNotificationMock: vi.fn(),
}));

vi.mock("@syntheo/plugin-notification", () => ({
  commands: { showNotification: showNotificationMock },
}));

// Libellés autrefois codés en dur : ils doivent suivre la locale active.
describe("libellés hors composant en français", () => {
  beforeEach(() => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
  });

  afterEach(() => {
    i18n.activate("en");
    cancelAutoStopEndedNotification("session-1");
    showNotificationMock.mockReset();
  });

  test("notification de détection du micro", () => {
    expect(getMicDetectedNotificationTitle()).toBe("Êtes-vous en réunion ?");
    expect(
      getIgnoreAppsFooterText([
        { id: "a", name: "Zoom" },
        { id: "b", name: "Slack" },
        { id: "c", name: "Discord" },
      ]),
    ).toBe("Ignorer Zoom et 2 autres apps ?");
  });

  test("invite de fin de réunion avec le repère du décompte", async () => {
    await showMeetingEndedPrompt({
      sessionId: "session-1",
      stoppedTriggerAppIds: [],
      stoppedApps: [],
    });

    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Votre réunion est-elle terminée ?",
        message: "Syntheo arrêtera l'écoute dans {seconds} s.",
        action_label: "Arrêter",
        action_variant: "destructive",
        labels: expect.objectContaining({ showLess: "Afficher moins" }),
      }),
    );
  });

  test("bandeau flottant", () => {
    expect(getFloatingTitle(null)).toBe("Transcription en direct");
    expect(
      getCaptureWarning({
        captureHealth: { mic: false, speaker: true, unavailable: false },
        lastError: null,
        lastErrorIsAudioRelated: false,
      }),
    ).toBe("Micro indisponible. L'audio système continue");
  });

  test("échecs de démarrage et toasts", () => {
    expect(describeStartFailure("microphone_permission")).toEqual({
      title: "Syntheo n'a pas accès au micro",
      description: "Autorisez Syntheo à accéder au micro, puis réessayez.",
      action: { label: "Ouvrir les autorisations", tab: "permissions" },
    });
    expect(getCaptureReminderMessage()).toBe(
      "Rappelez aux participants que la réunion est transcrite.",
    );
    expect(
      getSummaryIneligibilityReason({
        eligible: false,
        code: "transcript_too_short",
        reason: "",
        characterCount: 120,
        wordCount: 30,
      }),
    ).toBe(
      "Transcription trop courte pour un résumé (120/160 caractères minimum)",
    );
  });
});

describe("emplacement d'export sans chemin", () => {
  test("displayPath ne code plus « Loading... » en dur", async () => {
    const { displayPath } =
      await import("~/settings/general/storage/path-utils");
    expect(displayPath(undefined, undefined)).toBe("");
  });
});
