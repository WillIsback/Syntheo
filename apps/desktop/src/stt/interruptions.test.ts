import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatInterruption, formatInterruptions } from "./interruptions";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

const at = (hour: number, minute: number, second = 0) =>
  Date.UTC(2026, 9, 25, hour, minute, second);

it("formats an interruption as local HH:MM–HH:MM", () => {
  expect(
    formatInterruption(
      { startedAt: at(13, 32), endedAt: at(13, 35) },
      "Europe/Paris",
    ),
  ).toBe("14:32–14:35");
});

it("formats a gap within one minute as a few seconds", () => {
  expect(
    formatInterruption(
      { startedAt: at(18, 49, 19), endedAt: at(18, 49, 20) },
      "Europe/Paris",
    ),
  ).toBe("for a few seconds at 19:49");
});

describe("en français", () => {
  beforeEach(() => {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
  });

  afterEach(() => {
    i18n.activate("en");
  });

  it("coupure dans la même minute : quelques secondes", () => {
    expect(
      formatInterruptions(
        [{ startedAt: at(18, 49, 19), endedAt: at(18, 49, 20) }],
        "Europe/Paris",
      ),
    ).toBe("Transcription interrompue quelques secondes à 19:49");
  });

  it("coupure de moins de 60 s à cheval sur deux minutes : quelques secondes", () => {
    expect(
      formatInterruptions(
        [{ startedAt: at(18, 49, 50), endedAt: at(18, 50, 10) }],
        "Europe/Paris",
      ),
    ).toBe("Transcription interrompue quelques secondes à 19:49");
  });

  it("incomplete_capture_banner_lists_dated_gaps (texte)", () => {
    expect(
      formatInterruptions(
        [
          { startedAt: at(13, 32), endedAt: at(13, 35) },
          { startedAt: at(14, 1), endedAt: at(14, 2) },
        ],
        "Europe/Paris",
      ),
    ).toBe("Transcription interrompue 14:32–14:35, 15:01–15:02");
  });
});
