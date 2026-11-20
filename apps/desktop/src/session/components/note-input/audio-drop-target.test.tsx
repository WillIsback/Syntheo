import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioDropTarget } from "./audio-drop-target";

import { messages as englishMessages } from "~/i18n/locales/en/messages";
import { messages as frenchMessages } from "~/i18n/locales/fr/messages";

// Issue 626 : le bandeau de dépôt passe par les catalogues compilés, et la
// liste des formats suit la langue de l'interface.
vi.unmock("@lingui/react");
vi.unmock("@lingui/react/macro");

function renderBanner(locale: "en" | "fr") {
  act(() => {
    i18n.load({ en: englishMessages, fr: frenchMessages });
    i18n.activate(locale);
  });
  render(
    <I18nProvider i18n={i18n}>
      <AudioDropTarget isActive targetProps={{}}>
        <p>Note</p>
      </AudioDropTarget>
    </I18nProvider>,
  );
  return Array.from(
    screen.getByRole("status").querySelectorAll("p"),
    (line) => line.textContent,
  );
}

describe("AudioDropTarget", () => {
  afterEach(() => {
    cleanup();
    act(() => i18n.activate("en"));
  });

  it("lists the formats with the English conjunction", () => {
    expect(renderBanner("en")).toEqual([
      "Drop to upload and transcribe audio",
      "WAV, MP3, OGG, MP4, M4A, FLAC, WEBM, or AAC audio",
    ]);
  });

  it("is in French in a French interface", () => {
    expect(renderBanner("fr")).toEqual([
      "Déposez pour importer et transcrire l'audio",
      "Audio WAV, MP3, OGG, MP4, M4A, FLAC, WEBM ou AAC",
    ]);
  });
});
