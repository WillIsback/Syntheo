import { beforeEach, describe, expect, it } from "vitest";

import { migrateLegacyPanelLayout } from "@syntheo/ui/components/ui/resizable";

// Valeur réelle écrite par react-resizable-panels 2 pour `autoSaveId="main-chat"`
// (corps + chat à droite, panneaux sans id).
const LEGACY_MAIN_CHAT = JSON.stringify({
  '{"defaultSize":30,"maxSize":50,"minSize":20},{}': {
    expandToSizes: {},
    layout: [62.5, 37.5],
  },
});

describe("migrateLegacyPanelLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reprend la disposition v2 du chat sous la clé v4", () => {
    localStorage.setItem("react-resizable-panels:main-chat", LEGACY_MAIN_CHAT);

    migrateLegacyPanelLayout(localStorage, "main-chat", [
      "main-body",
      "right-chat",
    ]);

    expect(
      JSON.parse(
        localStorage.getItem(
          "react-resizable-panels:main-chat:main-body:right-chat",
        ) ?? "null",
      ),
    ).toEqual({ "main-body": 62.5, "right-chat": 37.5 });
    // L'ancienne clé reste, pour un éventuel retour arrière.
    expect(localStorage.getItem("react-resizable-panels:main-chat")).toBe(
      LEGACY_MAIN_CHAT,
    );
  });

  it("n'écrase pas une disposition v4 déjà enregistrée", () => {
    localStorage.setItem("react-resizable-panels:main-chat", LEGACY_MAIN_CHAT);
    const key = "react-resizable-panels:main-chat:main-body:right-chat";
    localStorage.setItem(key, '{"main-body":80,"right-chat":20}');

    migrateLegacyPanelLayout(localStorage, "main-chat", [
      "main-body",
      "right-chat",
    ]);

    expect(localStorage.getItem(key)).toBe('{"main-body":80,"right-chat":20}');
  });

  it("ignore une valeur corrompue ou sans disposition du bon nombre de panneaux", () => {
    localStorage.setItem("react-resizable-panels:main-chat", "{pas du json");
    migrateLegacyPanelLayout(localStorage, "main-chat", ["main-body"]);

    localStorage.setItem(
      "react-resizable-panels:standalone-note-chat",
      LEGACY_MAIN_CHAT,
    );
    migrateLegacyPanelLayout(localStorage, "standalone-note-chat", [
      "main-body",
    ]);

    expect(Object.keys(localStorage)).toEqual(
      expect.not.arrayContaining([
        "react-resizable-panels:main-chat:main-body",
        "react-resizable-panels:standalone-note-chat:main-body",
      ]),
    );
  });
});
