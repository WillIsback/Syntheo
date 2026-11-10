import { i18n } from "@lingui/core";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMicUsingApplications: vi.fn(),
  sendMeetingChatMessage: vi.fn(),
  warning: vi.fn(),
  persistDisclosureAttempt: vi.fn(),
  copyText: vi.fn(),
}));

vi.mock("@syntheo/plugin-detect", () => ({
  commands: {
    listMicUsingApplications: mocks.listMicUsingApplications,
    sendMeetingChatMessage: mocks.sendMeetingChatMessage,
  },
}));
vi.mock("@syntheo/ui/components/ui/toast", () => ({
  toast: { warning: mocks.warning },
}));
vi.mock("./meeting-consent-store", () => ({
  persistDisclosureAttempt: mocks.persistDisclosureAttempt,
}));
vi.mock("~/settings/developers/clipboard", () => ({
  copyText: mocks.copyText,
}));

import {
  MEETING_DISCLOSURE_MESSAGE,
  sendMeetingRecordingDisclosure,
} from "./meeting-disclosure";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

const run = () =>
  sendMeetingRecordingDisclosure({
    sessionId: "session-1",
    maxAttempts: 2,
    retryIntervalMs: 0,
  });

function sendResult(data: {
  sent: boolean;
  platform: string;
  warnings?: string[];
}) {
  return {
    status: "ok",
    data: { surface: "native", warnings: [], ...data },
  };
}

beforeAll(() => {
  i18n.load("fr", frMessages);
  i18n.activate("fr");
});

afterAll(() => {
  i18n.activate("en");
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.listMicUsingApplications.mockReset();
  mocks.sendMeetingChatMessage.mockReset();
  mocks.warning.mockReset();
  mocks.persistDisclosureAttempt.mockReset();
  mocks.copyText.mockReset();
});

it("meeting_disclosure_makes_no_unverified_guarantee", () => {
  // Le message part aux participants (art. 13 RGPD) : il ne promet ni absence
  // d'audio conservé ni traitement local tant que les chantiers 04b et 04c ne
  // les garantissent pas.
  expect(MEETING_DISCLOSURE_MESSAGE).toBe(
    "J'utilise Syntheo pour transcrire cette réunion ; le transcript est conservé sur mon poste.",
  );
  expect(MEETING_DISCLOSURE_MESSAGE).not.toMatch(
    /aucun enregistrement|local\)/,
  );
});

it("meeting_disclosure_without_meeting_logs_only_and_records_not_sent", async () => {
  mocks.listMicUsingApplications.mockResolvedValue({ status: "ok", data: [] });
  mocks.sendMeetingChatMessage.mockResolvedValue(
    sendResult({
      sent: false,
      platform: "unknown",
      warnings: ["no supported meeting app"],
    }),
  );

  const outcome = await run();

  expect(outcome.status).toBe("notSent");
  expect(mocks.warning).not.toHaveBeenCalled();
  expect(mocks.persistDisclosureAttempt).toHaveBeenCalledOnce();
  expect(mocks.persistDisclosureAttempt).toHaveBeenCalledWith(
    expect.objectContaining({
      delivery: "not_sent",
      platform: "unknown",
      failureReason: "no supported meeting app",
    }),
  );
});

it("meeting_disclosure_failure_in_detected_meeting_shows_french_toast", async () => {
  mocks.listMicUsingApplications.mockResolvedValue({
    status: "ok",
    data: [{ id: "us.zoom.xos" }],
  });
  mocks.sendMeetingChatMessage.mockResolvedValue(
    sendResult({
      sent: false,
      platform: "microsoftTeams",
      warnings: ["chat input not found"],
    }),
  );

  const outcome = await run();

  expect(outcome.status).toBe("notSent");
  expect(mocks.persistDisclosureAttempt).toHaveBeenCalledWith(
    expect.objectContaining({ delivery: "not_sent", platform: "teams" }),
  );
  expect(mocks.warning).toHaveBeenCalledOnce();
  const [message, options] = mocks.warning.mock.calls[0];
  expect(message).toContain("Microsoft Teams");
  expect(message).toContain("Postez-le vous-même");
  expect(Number.isFinite(options.duration)).toBe(true);
  expect(options.keepDuration).toBe(true);
  expect(options.action.label).toBe("Copier le message");

  options.action.onClick();
  expect(mocks.copyText).toHaveBeenCalledWith(
    MEETING_DISCLOSURE_MESSAGE,
    expect.any(String),
  );
});

it("meeting_disclosure_success_shows_no_toast", async () => {
  mocks.listMicUsingApplications.mockResolvedValue({
    status: "ok",
    data: [{ id: "us.zoom.xos" }],
  });
  mocks.sendMeetingChatMessage.mockResolvedValue(
    sendResult({ sent: true, platform: "zoom" }),
  );

  const outcome = await run();

  expect(outcome.status).toBe("sent");
  expect(mocks.warning).not.toHaveBeenCalled();
  expect(mocks.persistDisclosureAttempt).toHaveBeenCalledWith(
    expect.objectContaining({ delivery: "sent", platform: "zoom" }),
  );
});
