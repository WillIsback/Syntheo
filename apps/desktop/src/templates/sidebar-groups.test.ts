import { describe, expect, it } from "vitest";

import { type UserTemplate } from "./queries";
import { groupTemplatesForSidebar } from "./sidebar-groups";

function template(id: string, extra: Partial<UserTemplate> = {}): UserTemplate {
  return {
    id,
    title: id,
    description: "",
    pinned: false,
    sections: [],
    ...extra,
  } as unknown as UserTemplate;
}

const templates = [
  template("weekly", { title: "Point hebdo" }),
  template("retro", { title: "Rétrospective" }),
  template("one-on-one", { title: "Tête-à-tête", pinned: true, pinOrder: 1 }),
  template("kickoff", { title: "Lancement" }),
  template("review", { title: "Revue client" }),
];

const assignments = [
  { folderPath: "Clients/Atlas", templateId: "weekly" },
  { folderPath: "Bêta", templateId: "retro" },
  { folderPath: "Clients/Atlas/Équipe", templateId: "one-on-one" },
  { folderPath: "Gamma", templateId: "review" },
  { folderPath: "Bêta/Revue", templateId: "review" },
];

function titles(list: UserTemplate[]) {
  return list.map((item) => item.title);
}

// Issue 502 : Favoris, un groupe par dossier qui utilise un modèle, Généraux.
describe("groupTemplatesForSidebar", () => {
  it("groups favorites, then one group per folder, then general templates", () => {
    const groups = groupTemplatesForSidebar(templates, "", assignments);

    expect(titles(groups.favorites)).toEqual(["Tête-à-tête"]);
    expect(
      groups.folders.map((group) => [group.label, titles(group.templates)]),
    ).toEqual([
      ["Atlas", ["Point hebdo"]],
      ["Bêta", ["Rétrospective"]],
      ["Gamma, Revue", ["Revue client"]],
    ]);
    expect(titles(groups.general)).toEqual(["Lancement"]);
  });

  it("puts every template in general without folder templates", () => {
    const groups = groupTemplatesForSidebar(templates, "", []);
    expect(groups.folders).toEqual([]);
    expect(titles(groups.general)).toEqual([
      "Lancement",
      "Point hebdo",
      "Rétrospective",
      "Revue client",
    ]);
  });

  it("keeps the search on templates and finds them by folder name", () => {
    const byTitle = groupTemplatesForSidebar(templates, "lance", assignments);
    expect(byTitle.folders).toEqual([]);
    expect(titles(byTitle.general)).toEqual(["Lancement"]);

    const byFolder = groupTemplatesForSidebar(templates, "atlas", assignments);
    expect(
      byFolder.folders.map((group) => [group.label, titles(group.templates)]),
    ).toEqual([["Atlas", ["Point hebdo"]]]);
    expect(byFolder.general).toEqual([]);

    const none = groupTemplatesForSidebar(templates, "zzz", assignments);
    expect(none).toEqual({ favorites: [], folders: [], general: [] });
  });
});
