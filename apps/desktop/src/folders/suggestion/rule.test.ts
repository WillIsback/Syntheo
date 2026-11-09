import { describe, expect, it } from "vitest";

import { type SuggestionNote, suggestFolderAfterMeeting } from "./rule";

function filed(
  id: string,
  folderPath: string,
  {
    title = "",
    participants = [],
    createdAt = "2026-11-01T10:00:00Z",
  }: { title?: string; participants?: string[]; createdAt?: string } = {},
): SuggestionNote {
  return {
    id,
    title,
    folderPath,
    createdAt,
    participantIds: participants,
    templateId: "",
  };
}

function note({
  title = "",
  participants = [],
  templateId = "",
}: {
  title?: string;
  participants?: string[];
  templateId?: string;
}) {
  return { id: "new", title, participantIds: participants, templateId };
}

const NO_TEMPLATES = new Map<string, string>();

describe("suggestFolderAfterMeeting", () => {
  it("suggests the folder holding a note with the same normalized title", () => {
    expect(
      suggestFolderAfterMeeting({
        note: note({ title: "Point hebdo Atlas — 9 nov." }),
        filedNotes: [
          filed("a", "Clients/Atlas", { title: "Point HEBDO atlas 2 nov." }),
          filed("b", "Interne", { title: "Rétro" }),
        ],
        folderTemplates: NO_TEMPLATES,
      }),
    ).toEqual({ folderPath: "Clients/Atlas", reasons: ["title"], score: 2 });
  });

  it("suggests a folder when at least half of the participants are known there", () => {
    const filedNotes = [
      filed("a", "Projet", { participants: ["ana", "bob"] }),
      filed("b", "Projet", { participants: ["chloe"] }),
      filed("c", "Autre", { participants: ["dan"] }),
    ];
    expect(
      suggestFolderAfterMeeting({
        note: note({ participants: ["ana", "chloe", "dan", "eve"] }),
        filedNotes,
        folderTemplates: NO_TEMPLATES,
      }),
    ).toEqual({ folderPath: "Projet", reasons: ["participants"], score: 0.5 });
    // Un seul sur trois : sous la moitié.
    expect(
      suggestFolderAfterMeeting({
        note: note({ participants: ["ana", "eve", "fred"] }),
        filedNotes,
        folderTemplates: NO_TEMPLATES,
      }),
    ).toBeNull();
  });

  it("lets the note template strengthen the folder it is the sole default of", () => {
    const filedNotes = [
      filed("a", "Atlas", { participants: ["ana"], createdAt: "2026-11-02" }),
      filed("b", "Borée", { participants: ["ana"], createdAt: "2026-11-01" }),
    ];
    // Sans modèle, l'égalité va à la note la plus récente (Atlas).
    expect(
      suggestFolderAfterMeeting({
        note: note({ participants: ["ana"], templateId: "tpl" }),
        filedNotes,
        folderTemplates: NO_TEMPLATES,
      })?.folderPath,
    ).toBe("Atlas");
    expect(
      suggestFolderAfterMeeting({
        note: note({ participants: ["ana"], templateId: "tpl" }),
        filedNotes,
        folderTemplates: new Map([["Borée", "tpl"]]),
      }),
    ).toEqual({
      folderPath: "Borée",
      reasons: ["participants", "template"],
      score: 1.5,
    });
    // Modèle par défaut de deux dossiers : il ne départage rien.
    expect(
      suggestFolderAfterMeeting({
        note: note({ participants: ["ana"], templateId: "tpl" }),
        filedNotes,
        folderTemplates: new Map([
          ["Atlas", "tpl"],
          ["Borée", "tpl"],
        ]),
      })?.reasons,
    ).toEqual(["participants"]);
  });

  it("never makes a folder a candidate from its template alone", () => {
    expect(
      suggestFolderAfterMeeting({
        note: note({ title: "Atelier", templateId: "tpl" }),
        filedNotes: [filed("a", "Atlas", { title: "Revue" })],
        folderTemplates: new Map([["Atlas", "tpl"]]),
      }),
    ).toBeNull();
  });

  it("suggests nothing without a matching title or shared participants", () => {
    expect(
      suggestFolderAfterMeeting({
        note: note({ title: "Atelier", participants: ["zoe"] }),
        filedNotes: [
          filed("a", "Atlas", { title: "Revue", participants: ["ana"] }),
        ],
        folderTemplates: NO_TEMPLATES,
      }),
    ).toBeNull();
    // Titre vide une fois normalisé et aucun participant.
    expect(
      suggestFolderAfterMeeting({
        note: note({ title: "12/11" }),
        filedNotes: [filed("a", "Atlas", { title: "03/11" })],
        folderTemplates: NO_TEMPLATES,
      }),
    ).toBeNull();
  });

  it("ignores the note itself and unfiled notes", () => {
    expect(
      suggestFolderAfterMeeting({
        note: note({ title: "Revue" }),
        filedNotes: [
          { ...filed("new", "Atlas", { title: "Revue" }) },
          filed("b", "", { title: "Revue" }),
        ],
        folderTemplates: NO_TEMPLATES,
      }),
    ).toBeNull();
  });

  it("prefers the same title over shared participants", () => {
    expect(
      suggestFolderAfterMeeting({
        note: note({ title: "Revue", participants: ["ana"] }),
        filedNotes: [
          filed("a", "Atlas", { title: "Revue" }),
          filed("b", "Borée", { title: "Autre", participants: ["ana"] }),
        ],
        folderTemplates: NO_TEMPLATES,
      })?.folderPath,
    ).toBe("Atlas");
  });
});
