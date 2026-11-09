import { describe, expect, it } from "vitest";

import {
  buildSearchFolders,
  countNotesByFolder,
  rankUnifiedResults,
} from "./rank";
import type { FullTextHit, SearchCatalog, SearchNote } from "./types";

const notes: SearchNote[] = [
  {
    id: "hebdo",
    title: "Point hebdo Atlas",
    createdAt: "2026-11-02T09:00:00Z",
    folderPath: "Réunion produit Atlas",
  },
  {
    id: "atelier",
    title: "Atelier onboarding",
    createdAt: "2026-10-19T09:00:00Z",
    folderPath: "Réunion produit Atlas/Ateliers",
  },
  {
    id: "comite",
    title: "Comité de direction",
    createdAt: "2026-10-29T09:00:00Z",
    folderPath: "Comité",
  },
  {
    id: "atlas-ancien",
    title: "Atlas : lancement",
    createdAt: "2026-07-07T09:00:00Z",
    folderPath: "",
  },
];

const catalog: SearchCatalog = {
  notes,
  folders: buildSearchFolders(
    ["Comité", "Réunion produit Atlas", "Réunion produit Atlas/Ateliers"],
    notes,
  ),
  contacts: [
    { id: "h1", type: "human", name: "Marie Atlan" },
    { id: "o1", type: "organization", name: "Atlas Corp" },
  ],
};

const hit = (
  id: string,
  score: number,
  type: FullTextHit["type"] = "session",
): FullTextHit => ({ id, type, score, snippet: `… ${id} …` });

describe("rankUnifiedResults", () => {
  it("met en tête les dossiers dont le nom correspond, avec leur nombre de notes", () => {
    const results = rankUnifiedResults(catalog, "atlas", []);

    expect(results.folders.map((folder) => folder.path)).toEqual([
      "Réunion produit Atlas",
      // Le parent porte le mot : le sous-dossier vient après.
      "Réunion produit Atlas/Ateliers",
    ]);
    expect(results.folders[0].noteCount).toBe(2);
  });

  it("garde le dossier de chaque note", () => {
    const results = rankUnifiedResults(catalog, "atlas", []);

    expect(
      results.notes.map((note) => [note.id, note.folderPath, note.match]),
    ).toEqual([
      ["atlas-ancien", "", "title"],
      ["hebdo", "Réunion produit Atlas", "title"],
    ]);
  });

  it("ajoute après les titres les notes trouvées seulement dans le contenu", () => {
    const results = rankUnifiedResults(catalog, "atlas", [
      hit("comite", 4),
      hit("hebdo", 9),
      hit("supprimee", 12),
    ]);

    expect(results.notes.map((note) => note.id)).toEqual([
      "atlas-ancien",
      "hebdo",
      "comite",
    ]);
    expect(results.notes[2]).toMatchObject({
      match: "content",
      folderPath: "Comité",
      snippet: "… comite …",
    });
  });

  it("ne réordonne pas les titres quand l'index répond (pas de clignotement)", () => {
    const before = rankUnifiedResults(catalog, "atlas", []);
    const after = rankUnifiedResults(catalog, "atlas", [
      hit("hebdo", 1),
      hit("atlas-ancien", 0.1),
    ]);

    expect(after.notes.map((note) => note.id)).toEqual(
      before.notes.map((note) => note.id),
    );
  });

  it("ignore accents et casse", () => {
    const results = rankUnifiedResults(catalog, "COMITE", []);

    expect(results.folders.map((folder) => folder.path)).toEqual(["Comité"]);
    expect(results.notes.map((note) => note.id)).toEqual(["comite"]);
  });

  it("limite la recherche à un dossier, sous-dossiers compris, sans contacts", () => {
    const results = rankUnifiedResults(catalog, "", [], {
      folder: "Réunion produit Atlas",
    });

    expect(results.notes.map((note) => note.id)).toEqual(["hebdo", "atelier"]);
    expect(results.folders.map((folder) => folder.path)).toEqual([
      "Réunion produit Atlas/Ateliers",
    ]);
    expect(results.contacts).toEqual([]);
  });

  it("filtre aussi les résultats de l'index par dossier", () => {
    const results = rankUnifiedResults(
      catalog,
      "livraison",
      [hit("comite", 5), hit("atelier", 3)],
      { folder: "Réunion produit Atlas" },
    );

    expect(results.notes.map((note) => note.id)).toEqual(["atelier"]);
  });

  it("trouve les contacts par nom puis par l'index", () => {
    const results = rankUnifiedResults(catalog, "atl", [
      hit("o1", 2, "organization"),
    ]);

    expect(results.contacts.map((contact) => contact.id)).toEqual(["o1", "h1"]);
  });

  it("sans texte, liste les notes de la plus récente à la plus ancienne", () => {
    const results = rankUnifiedResults(catalog, "  ", []);

    expect(results.notes.map((note) => note.id)).toEqual([
      "hebdo",
      "comite",
      "atelier",
      "atlas-ancien",
    ]);
  });
});

describe("countNotesByFolder", () => {
  it("compte les notes des sous-dossiers dans leurs parents", () => {
    const counts = countNotesByFolder(notes);

    expect(counts.get("Réunion produit Atlas")).toBe(2);
    expect(counts.get("Réunion produit Atlas/Ateliers")).toBe(1);
    expect(counts.has("")).toBe(false);
  });
});
