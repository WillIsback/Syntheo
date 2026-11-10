import { i18n } from "@lingui/core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { messages as frMessages } from "~/i18n/locales/fr/messages";
import {
  normalizeSearchText,
  resolveSettingsIndex,
  searchSettings,
  type SettingsSearchResult,
} from "~/settings/search";
import {
  SETTINGS_SEARCH_INDEX,
  type SettingsSearchEntry,
} from "~/settings/search-index";
import type { SettingsTab } from "~/store/zustand/tabs";

function entry(
  overrides: Partial<Omit<SettingsSearchResult, "id">> & { id: string },
): SettingsSearchResult {
  return {
    page: "app",
    pageLabel: "Profil",
    label: overrides.id,
    section: null,
    keywords: "",
    breadcrumb: "Profil",
    ...overrides,
  } as SettingsSearchResult;
}

describe("normalizeSearchText", () => {
  it("met en minuscules et retire les accents", () => {
    expect(normalizeSearchText("Démarrer à l'Écran")).toBe(
      "demarrer a l'ecran",
    );
    expect(normalizeSearchText("  Thème  ")).toBe("theme");
  });
});

describe("searchSettings", () => {
  const entries = [
    entry({ id: "a", label: "Détection du microphone" }),
    entry({ id: "b", label: "Thème", keywords: "sombre, clair, couleur" }),
    entry({ id: "c", label: "Microphone", section: "Audio" }),
    entry({ id: "d", label: "Palette", pageLabel: "Apparence" }),
  ];

  it("ignore les accents et la casse", () => {
    expect(searchSettings(entries, "THEME").map((e) => e.id)).toEqual(["b"]);
    expect(searchSettings(entries, "détéction").map((e) => e.id)).toEqual([
      "a",
    ]);
  });

  it("cherche aussi dans la section, la page et les mots-clés", () => {
    expect(searchSettings(entries, "sombre").map((e) => e.id)).toEqual(["b"]);
    expect(searchSettings(entries, "audio").map((e) => e.id)).toEqual(["c"]);
    expect(searchSettings(entries, "apparence").map((e) => e.id)).toEqual([
      "d",
    ]);
  });

  it("exige chaque mot tapé, sans recherche floue", () => {
    expect(searchSettings(entries, "micro audio").map((e) => e.id)).toEqual([
      "c",
    ]);
    expect(searchSettings(entries, "micor")).toEqual([]);
  });

  it("classe : libellé qui commence, puis qui contient, puis le reste", () => {
    const ranked = [
      entry({ id: "keyword", label: "Périphérique", keywords: "micro" }),
      entry({ id: "contains", label: "Détection du micro" }),
      entry({ id: "starts", label: "Micro" }),
    ];

    expect(searchSettings(ranked, "micro").map((e) => e.id)).toEqual([
      "starts",
      "contains",
      "keyword",
    ]);
  });

  it("renvoie tout l'index, dans l'ordre, pour une recherche vide", () => {
    expect(searchSettings(entries, "  ").map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});

describe("index des paramètres en français", () => {
  afterEach(() => {
    i18n.activate("en");
  });

  function frenchIndex(platform: "windows" | "macos" | null = "windows") {
    i18n.load("fr", frMessages);
    i18n.activate("fr");
    const pageLabels = new Map<SettingsTab, string>([
      ["app", "Profil"],
      ["meetings", "Réunions"],
      ["appearance", "Apparence"],
      ["notifications", "Notifications"],
      ["permissions", "Permissions"],
      ["dictation", "Dictée"],
    ]);
    return resolveSettingsIndex(i18n, {
      pageLabels,
      platform,
    });
  }

  it.each([
    ["micro", "meetings-microphone"],
    ["sombre", "theme"],
    ["demarrage", "autostart"],
    ["allumer le PC", "autostart"],
    ["PDF", "export-location"],
    ["téléchargements", "export-location"],
    ["langue", "main-language"],
  ])("« %s » trouve %s avec les mots de Mme Martin", (query, id) => {
    const ids = searchSettings(frenchIndex(), query).map((e) => e.id);
    expect(ids).toContain(id);
  });

  it("place les réglages Réunions › Audio en tête pour « micro »", () => {
    const [first] = searchSettings(frenchIndex(), "micro");
    expect(first?.label).toBe("Microphone");
    expect(first?.breadcrumb).toBe("Réunions › Audio");
  });

  it("masque les réglages propres à une autre plateforme", () => {
    const ids = (platform: "windows" | "macos") =>
      frenchIndex(platform).map((e) => e.id);
    expect(ids("windows")).not.toContain("show-app-in-dock");
    expect(ids("macos")).toContain("show-app-in-dock");
  });
});

// Un résultat ne doit jamais mener nulle part : chaque id de l'index est posé
// (data-setting-id ou prop settingId) dans un fichier de la page annoncée.
const PAGE_SOURCES: Record<SettingsTab, string[]> = {
  app: ["general/"],
  meetings: ["general/"],
  audio: ["general/"],
  appearance: ["appearance/"],
  notifications: ["general/notification.tsx"],
  permissions: ["general/permissions.tsx"],
  privacy: ["privacy/"],
  developers: ["developers/"],
  dictation: ["dictation.tsx", "dictation-shortcut.tsx"],
  dictionary: ["dictionary/"],
  transcription: ["ai/stt/"],
  intelligence: ["ai/llm/"],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

describe("cohérence de l'index", () => {
  const settingsDir = join(process.cwd(), "src/settings");
  const declared = new Map<string, string[]>();
  for (const file of sourceFiles(settingsDir)) {
    const source = readFileSync(file, "utf8");
    const pattern =
      /(?:data-setting-id|settingId)(?:=\{?|:\s*)["']([a-z0-9-]+)["']/g;
    for (const match of source.matchAll(pattern)) {
      const id = match[1]!;
      declared.set(id, [
        ...(declared.get(id) ?? []),
        relative(settingsDir, file),
      ]);
    }
  }

  it("couvre plusieurs dizaines de réglages, sans doublon", () => {
    const ids = SETTINGS_SEARCH_INDEX.map((e) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SETTINGS_SEARCH_INDEX.map((e) => [e.id, e.page] as const))(
    "%s existe dans la page %s",
    (id, page) => {
      const files = declared.get(id) ?? [];
      expect(files).toHaveLength(1);
      expect(
        PAGE_SOURCES[page].some((prefix) => files[0]!.startsWith(prefix)),
      ).toBe(true);
    },
  );

  it("n'a de repli que vers un réglage de la même page", () => {
    const index: readonly SettingsSearchEntry[] = SETTINGS_SEARCH_INDEX;
    for (const item of index) {
      if (!item.fallback) continue;
      const parent = index.find((e) => e.id === item.fallback);
      expect(parent?.page).toBe(item.page);
    }
  });
});
