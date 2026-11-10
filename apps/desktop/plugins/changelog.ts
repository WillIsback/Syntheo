import { readdirSync, readFileSync, watch } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

import { selectVersionLine } from "@syntheo/changelog/line";
import { processContent } from "@syntheo/changelog/process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const changelogDir = resolve(
  __dirname,
  "../../../packages/changelog/content/desktop",
);

const VIRTUAL_ID = "virtual:changelog";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

export type ChangelogEntry = {
  version: string;
  date: string | null;
  summary: string | null;
  content: string;
};

// Version installée : `X.Y.Z`, ou `X.Y.Z-N` pour une alpha.
const INSTALLED_VERSION = /^\d+\.\d+\.\d+(?:-\d+)?$/;
// Fichiers du journal : `X.Y.Z.md`.
const NOTE_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Chemin de la note d'une version, refusé hors du format `X.Y.Z` ou hors du
 * dossier du journal : la version peut venir de l'environnement du build.
 */
export function changelogFile(version: string): string {
  if (!NOTE_VERSION.test(version)) {
    throw new Error(`Version de journal invalide : « ${version} ».`);
  }
  const file = resolve(changelogDir, `${version}.md`);
  if (relative(changelogDir, file) !== `${version}.md`) {
    throw new Error(`Note hors du journal : « ${file} ».`);
  }
  return file;
}

function listVersions(): string[] {
  try {
    return readdirSync(changelogDir)
      .filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f))
      .map((f) => f.slice(0, -".md".length));
  } catch {
    return [];
  }
}

function highest(versions: string[]): string | null {
  return (
    [...versions].sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    )[0] ?? null
  );
}

// Journal cumulatif de la ligne de version installée (issue #536), résolu au
// build : seuls les fichiers de la ligne entrent dans le bundle, et l'onglet
// Journal fonctionne hors ligne.
export function buildEntries(): ChangelogEntry[] {
  const versions = listVersions();
  const current = process.env.VITE_APP_VERSION || highest(versions);
  if (!current) return [];
  if (!INSTALLED_VERSION.test(current)) {
    throw new Error(
      `VITE_APP_VERSION invalide : « ${current} » (attendu X.Y.Z ou X.Y.Z-N).`,
    );
  }
  return selectVersionLine(versions, current).map((version) => {
    const { content, date, summary } = processContent(
      readFileSync(changelogFile(version), "utf-8"),
    );
    return { version, date, summary, content };
  });
}

export function changelog(): Plugin {
  return {
    name: "changelog",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) {
        return `export const entries = ${JSON.stringify(buildEntries())};`;
      }
    },
    configureServer(server: ViteDevServer) {
      if (process.env.NODE_ENV === "test" || process.env.VITEST) {
        return;
      }

      try {
        watch(changelogDir, () => {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: "full-reload" });
          }
        });
      } catch {}
    },
  };
}
