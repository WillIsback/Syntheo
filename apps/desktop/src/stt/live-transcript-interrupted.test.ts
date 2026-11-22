import { i18n } from "@lingui/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  getLiveTranscriptPausedMessage,
  getLiveTranscriptResumedMessage,
} from "./live-transcript-interrupted";

import { messages as frMessages } from "~/i18n/locales/fr/messages";

function activateFrench() {
  i18n.load("fr", frMessages);
  i18n.activate("fr");
}

afterEach(() => {
  i18n.activate("en");
});

describe("getLiveTranscriptPausedMessage", () => {
  // Revue de l'issue 684 : la preuve refusée du module local n'est pas une
  // clé d'API, et un refus définitif n'annonce pas de reconnexion.
  it("explains an on-device module that could not be authenticated", () => {
    const message = getLiveTranscriptPausedMessage({
      degraded: { type: "on_device_authentication_failed" },
      sttProvider: "nvidia",
      online: false,
    });
    expect(message).toMatch(
      /the transcription module of this computer could not be authenticated/,
    );
    expect(message).not.toMatch(/API key|Reconnecting/);
    activateFrench();
    expect(
      getLiveTranscriptPausedMessage({
        degraded: { type: "on_device_authentication_failed" },
        sttProvider: "nvidia",
        online: true,
      }),
    ).toMatch(
      /le module de transcription de ce poste n'a pas pu être authentifié/,
    );
  });

  it("only reconnects the on-device module after a failed launch", () => {
    expect(
      getLiveTranscriptPausedMessage({
        degraded: {
          type: "on_device_unavailable",
          reason: "disabled",
          permanent: true,
        },
        sttProvider: null,
        online: true,
      }),
    ).not.toMatch(/Reconnecting/);
    expect(
      getLiveTranscriptPausedMessage({
        degraded: {
          type: "on_device_unavailable",
          reason: "failed_to_start",
          permanent: false,
        },
        sttProvider: null,
        online: true,
      }),
    ).toMatch(/did not start.*Reconnecting/);
  });

  // QA de 0.8.0-2 : exécution refusée par le système, raison nommée, sans
  // reconnexion.
  it("names a blocked execution of the on-device program", () => {
    const message = getLiveTranscriptPausedMessage({
      degraded: {
        type: "on_device_unavailable",
        reason: "execution_blocked",
        permanent: true,
      },
      sttProvider: null,
      online: true,
    });
    expect(message).toMatch(/does not allow the transcription program to run/);
    expect(message).not.toMatch(/Reconnecting/);
  });

  it("names the provider when it reports an outage", () => {
    expect(
      getLiveTranscriptPausedMessage({
        degraded: { type: "stream_error", message: "nvidia: overloaded" },
        sttProvider: "nvidia",
        online: true,
      }),
    ).toMatch(/: NVIDIA NeMo-Speech\.cpp is having an outage\./);
  });

  it("reports unreachable direct providers", () => {
    expect(
      getLiveTranscriptPausedMessage({
        degraded: { type: "connection_timeout" },
        sttProvider: "openai",
        online: true,
      }),
    ).toMatch(/Syntheo cannot reach OpenAI-compatible/);
  });

  it("live_interrupted_notice_mentions_no_saved_audio", () => {
    const message = getLiveTranscriptPausedMessage({
      degraded: null,
      sttProvider: "custom",
      online: true,
    });
    expect(message).not.toMatch(/being saved|filled in from the recording/);
    expect(message).toContain("No audio is saved to disk");
    expect(message).toMatch(/Reconnecting…$/);
  });

  // Issue 621 : une coupure courte est rejouée ; tant que la reconnexion est
  // en cours, la perte n'est pas affirmée.
  it("does not claim the passage is lost while reconnecting", () => {
    const message = getLiveTranscriptPausedMessage({
      degraded: { type: "connection_timeout" },
      sttProvider: "nvidia",
      online: true,
    });
    expect(message).toContain(
      "if the outage lasts, this passage will be missing from the transcription",
    );
    expect(message).not.toMatch(
      /No audio is kept: this passage will be missing/,
    );
  });

  it("keeps the firm wording when the server rejects the settings", () => {
    for (const degraded of [
      { type: "authentication_failed" as const, provider: "nvidia" },
      {
        type: "provider_configuration" as const,
        provider: "nvidia",
        message: "bad",
      },
    ]) {
      expect(
        getLiveTranscriptPausedMessage({
          degraded: degraded as Parameters<
            typeof getLiveTranscriptPausedMessage
          >[0]["degraded"],
          sttProvider: "nvidia",
          online: true,
        }),
      ).toContain(
        "No audio is kept: this passage will be missing from the transcription.",
      );
    }
  });

  it("ne promet pas de reconnexion quand le serveur refuse la clé", () => {
    // Le listener ne réessaie pas après un refus d'authentification ou de
    // configuration : annoncer « Reconnexion… » serait faux.
    const message = getLiveTranscriptPausedMessage({
      degraded: { type: "authentication_failed", provider: "nvidia" },
      sttProvider: "nvidia",
      online: true,
    });
    expect(message).not.toMatch(/Reconnecting/);
    expect(message).toMatch(/Check the transcription server settings\.$/);
  });
});

describe("messages en français", () => {
  it("parle de « transcription » et non de « transcript »", () => {
    activateFrench();

    const paused = getLiveTranscriptPausedMessage({
      degraded: { type: "stream_error", message: "nvidia: overloaded" },
      sttProvider: "nvidia",
      online: true,
    });

    expect(paused).toBe(
      "Transcription en direct en pause : NVIDIA NeMo-Speech.cpp subit une panne. Aucun audio n'est enregistré sur le disque : si la coupure dure, ce passage manquera à la transcription. Reconnexion…",
    );
    expect(paused).not.toMatch(/transcript\b/i);
    expect(getLiveTranscriptResumedMessage()).toBe(
      "Transcription en direct reprise.",
    );
  });

  it("traduit la cause par défaut", () => {
    activateFrench();

    expect(
      getLiveTranscriptPausedMessage({
        degraded: null,
        sttProvider: null,
        online: false,
      }),
    ).toMatch(/^Transcription en direct en pause : vous êtes hors ligne\./);
  });
});
