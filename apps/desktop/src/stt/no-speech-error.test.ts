import { i18n } from "@lingui/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  isNoSpeechDetectedError,
  NoSpeechDetectedError,
} from "./no-speech-error";
import {
  isRecoveryNoSpeechError,
  isTerminalTranscriptionError,
} from "./run-batch-helpers";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

function activateFrench() {
  i18n.load("fr", frMessages);
  i18n.activate("fr");
}

afterEach(() => {
  i18n.activate("en");
});

const recovery = { recovery: {} } as Parameters<
  typeof isRecoveryNoSpeechError
>[0];

describe("NoSpeechDetectedError", () => {
  it("shows an English message by default", () => {
    expect(new NoSpeechDetectedError().message).toBe(
      "No speech was detected in the audio.",
    );
  });

  it("shows a French message once translated", () => {
    activateFrench();

    expect(new NoSpeechDetectedError().message).toBe(
      "Aucune parole n'a été détectée dans l'audio.",
    );
  });

  it("is still recognised once the message is translated", () => {
    activateFrench();
    const error = new NoSpeechDetectedError();

    expect(isNoSpeechDetectedError(error)).toBe(true);
    expect(isRecoveryNoSpeechError(recovery, error)).toBe(true);
    expect(isTerminalTranscriptionError(error)).toBe(true);
  });

  it("is recognised by its code when the class is lost", () => {
    const error = Object.assign(new Error("Aucune parole"), {
      code: "no_speech",
    });

    expect(isNoSpeechDetectedError(error)).toBe(true);
  });

  it("ignores other errors and recovery-less runs", () => {
    expect(isNoSpeechDetectedError(new Error("disk full"))).toBe(false);
    expect(
      isRecoveryNoSpeechError(undefined, new NoSpeechDetectedError()),
    ).toBe(false);
  });
});
