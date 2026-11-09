import { describe, expect, it } from "vitest";

import {
  nearestFolderTemplate,
  resolveSummaryTemplate,
  resolveSummaryTemplateId,
} from "./resolution";

// Issue 502 : ordre de résolution du modèle d'une synthèse.
describe("resolveSummaryTemplate", () => {
  const all = {
    noteTemplateId: "note",
    folderTemplateId: "folder",
    globalTemplateId: "global",
  };

  it("prefers the template chosen on the note", () => {
    expect(resolveSummaryTemplate(all)).toEqual({
      templateId: "note",
      source: "note",
    });
  });

  it("then the folder template", () => {
    expect(resolveSummaryTemplate({ ...all, noteTemplateId: "" })).toEqual({
      templateId: "folder",
      source: "folder",
    });
  });

  it("then the global default", () => {
    expect(
      resolveSummaryTemplate({
        ...all,
        noteTemplateId: "",
        folderTemplateId: undefined,
      }),
    ).toEqual({ templateId: "global", source: "global" });
  });

  it("then Automatic (no template)", () => {
    expect(resolveSummaryTemplate({})).toEqual({
      templateId: undefined,
      source: "auto",
    });
    expect(
      resolveSummaryTemplateId({
        noteTemplateId: "",
        folderTemplateId: "",
        globalTemplateId: "",
      }),
    ).toBeUndefined();
  });

  it("lets the launch force a template or Automatic", () => {
    expect(
      resolveSummaryTemplateId({ ...all, requestedTemplateId: "picked" }),
    ).toBe("picked");
    expect(
      resolveSummaryTemplateId({ ...all, requestedTemplateId: null }),
    ).toBeUndefined();
    expect(resolveSummaryTemplateId({ ...all, requestedTemplateId: "" })).toBe(
      "note",
    );
  });
});

describe("nearestFolderTemplate", () => {
  const templates = new Map([
    ["Clients", "client-template"],
    ["Clients/Atlas/Hebdo", "weekly-template"],
  ]);

  it("uses the folder's own template", () => {
    expect(nearestFolderTemplate("Clients/Atlas/Hebdo", templates)).toEqual({
      folderPath: "Clients/Atlas/Hebdo",
      templateId: "weekly-template",
    });
  });

  it("inherits from the nearest parent folder", () => {
    expect(nearestFolderTemplate("Clients/Atlas", templates)).toEqual({
      folderPath: "Clients",
      templateId: "client-template",
    });
    expect(
      nearestFolderTemplate("Clients/Atlas/Hebdo/Archives", templates),
    ).toEqual({
      folderPath: "Clients/Atlas/Hebdo",
      templateId: "weekly-template",
    });
  });

  it("has no template outside a folder or without any template up the tree", () => {
    expect(nearestFolderTemplate("", templates)).toBeUndefined();
    expect(nearestFolderTemplate(null, templates)).toBeUndefined();
    expect(nearestFolderTemplate("Interne/RH", templates)).toBeUndefined();
  });
});
