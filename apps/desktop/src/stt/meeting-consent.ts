export const MEETING_DISCLOSURE_MESSAGE_VERSION = "syntheo-disclosure-v2";

type DisclosureDelivery = "sent" | "not_sent" | "cancelled";

export type DisclosurePlatform =
  | "slack_huddle"
  | "zoom"
  | "google_meet"
  | "teams"
  | "webex"
  | "browser"
  | "unknown";

export type DisclosureAttempt = {
  id: string;
  sessionId: string;
  attemptedAt: string;
  platform: DisclosurePlatform;
  surface: string;
  messageVersion: string;
  message: string;
  delivery: DisclosureDelivery;
  failureReason: string;
};

export type ParticipantConsentStatus = "unknown" | "consented" | "declined";

type ParticipantConsentSource =
  | "explicit_chat_reply"
  | "explicit_ui"
  | "unseen";

export type ParticipantConsent = {
  sessionId: string;
  participantKey: string;
  status: ParticipantConsentStatus;
  source: ParticipantConsentSource;
  updatedAt: string;
};

export type SessionListeningPolicy = "continue" | "stop_declined";

const DECLINE_PATTERN =
  /\b((i\s+)?(do\s+not|don't|does\s+not|doesn't)\s+consent|stop\s+recording)\b/i;
const CONSENT_PATTERN = /\b(i\s+consent|i\s+agree\s+to\s+(being\s+)?record)/i;

export function interpretChatAsConsentResponse(
  text: string,
  disclosureMessage: string,
): ParticipantConsentStatus | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  if (normalized === disclosureMessage.replace(/\s+/g, " ").trim()) {
    return null;
  }
  if (DECLINE_PATTERN.test(normalized)) {
    return "declined";
  }
  if (CONSENT_PATTERN.test(normalized)) {
    return "consented";
  }
  return null;
}

export function sessionListeningPolicy(
  consents: readonly ParticipantConsent[],
): SessionListeningPolicy {
  return consents.some((consent) => consent.status === "declined")
    ? "stop_declined"
    : "continue";
}
