import { describe, expect, it } from "vitest";

import {
  interpretChatAsConsentResponse,
  type ParticipantConsent,
  sessionListeningPolicy,
} from "./meeting-consent";

const DISCLOSURE =
  "I'm using Syntheo to record and transcribe this meeting. https://github.com/WillIsback/Syntheo";

function consent(status: ParticipantConsent["status"]): ParticipantConsent {
  return {
    sessionId: "session-1",
    participantKey: "ada",
    status,
    source: "explicit_chat_reply",
    updatedAt: "2026-08-21T00:02:00.000Z",
  };
}

describe("meeting consent model", () => {
  it("stops listening only after an explicit decline", () => {
    expect(sessionListeningPolicy([])).toBe("continue");
    expect(sessionListeningPolicy([consent("declined")])).toBe("stop_declined");
  });

  it("keeps listening when participants consent or have not answered", () => {
    expect(sessionListeningPolicy([consent("consented")])).toBe("continue");
    expect(sessionListeningPolicy([consent("unknown")])).toBe("continue");
  });

  it("ignores the disclosure text itself when classifying chat replies", () => {
    expect(interpretChatAsConsentResponse(DISCLOSURE, DISCLOSURE)).toBeNull();
    expect(interpretChatAsConsentResponse("I do not consent", DISCLOSURE)).toBe(
      "declined",
    );
    expect(interpretChatAsConsentResponse("I consent", DISCLOSURE)).toBe(
      "consented",
    );
    expect(
      interpretChatAsConsentResponse("sounds good", DISCLOSURE),
    ).toBeNull();
  });
});
