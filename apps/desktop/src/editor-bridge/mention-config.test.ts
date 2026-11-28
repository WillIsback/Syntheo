import { describe, expect, it } from "vitest";

import { toMentionItems } from "./mention-config";

import { buildSearchFolders } from "~/search/unified/rank";

const ATLAS = "Réunion produit Atlas";

describe("toMentionItems", () => {
  // Issue 790 : comme dans la palette (issue 628), le parent distingue deux
  // sous-dossiers de même nom.
  it("affiche le parent d'un sous-dossier, pas celui d'un dossier racine", () => {
    const folders = buildSearchFolders(
      [`${ATLAS}/Ateliers`, "Equipe Projet/Ateliers", "Comité"],
      [],
    );

    const items = toMentionItems({ folders, notes: [], contacts: [] }, "");
    const byId = (id: string) => items.find((item) => item.id === id);

    expect(byId(`${ATLAS}/Ateliers`)).toMatchObject({
      label: "Ateliers",
      context: `${ATLAS} ›`,
      title: `${ATLAS} › Ateliers`,
    });
    expect(byId("Equipe Projet/Ateliers")).toMatchObject({
      label: "Ateliers",
      context: "Equipe Projet ›",
    });
    expect(byId("Comité")?.label).toBe("Comité");
    expect(byId("Comité")?.context).toBeUndefined();
  });
});
