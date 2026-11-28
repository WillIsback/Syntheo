import { dirname } from "node:path";
import type { Plugin } from "vite";

import {
  buildThirdPartyLicenses,
  checkThirdPartyLicenses,
  cssPackageImports,
  findPackageDir,
  npmPackagesFromModules,
  shippedModuleIds,
} from "../../../scripts/third-party-licenses.mjs";

const VIRTUAL_ID = "virtual:third-party-licenses";
const RESOLVED_ID = "\0" + VIRTUAL_ID;
// Remplacé au rendu des chunks par les données, une fois le bundle connu.
const PLACEHOLDER = "__SYNTHEO_THIRD_PARTY_LICENSES__";
const PLACEHOLDER_LITERAL = new RegExp(`(["'\`])${PLACEHOLDER}\\1`);
const CSS_FILE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)$/;

/**
 * Page des licences (issue 747) : les données sont générées au build depuis
 * Cargo.lock, le bundle et la liste des modèles, puis servies par un module
 * virtuel chargé seulement à l'ouverture de la page.
 *
 * Build de production (issue 781) : la liste npm est celle des paquets dont
 * un module reste dans les chunks rendus après le tree-shaking (feuilles de
 * style comprises, et paquets qu'elles importent avec `@import`). Le module
 * virtuel porte un marqueur, remplacé dans renderChunk, quand tous les
 * chunks sont connus. Le build échoue si la liste est vide, incomplète ou si
 * un composant livré n'a aucun texte de licence. En développement, la liste
 * npm vient de `pnpm licenses list` et une erreur s'affiche dans la page.
 */
export function thirdPartyLicenses(): Plugin {
  let production = false;
  let root = process.cwd();
  // Dossiers des paquets importés par une feuille de style.
  const cssPackages = new Set<string>();
  return {
    name: "third-party-licenses",
    configResolved(config) {
      production = config.command === "build";
      root = config.root;
    },
    buildStart() {
      cssPackages.clear();
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      if (production) {
        return `export default JSON.parse(${JSON.stringify(PLACEHOLDER)});`;
      }
      try {
        const data = buildThirdPartyLicenses();
        checkThirdPartyLicenses(data, { texts: false });
        return `export default ${JSON.stringify(data)};`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `export default ${JSON.stringify({ error: message })};`;
      }
    },
    transform: {
      // Avant la compilation du CSS, qui inline les `@import`.
      order: "pre",
      handler(code, id) {
        if (!production || !CSS_FILE.test(id.split("?")[0])) return null;
        for (const name of cssPackageImports(code)) {
          const dir = findPackageDir(name, [dirname(id)]);
          if (!dir) {
            throw new Error(`paquet importé par ${id} introuvable : ${name}`);
          }
          cssPackages.add(dir);
        }
        return null;
      },
    },
    renderChunk(code, chunk, _options, meta) {
      if (!production || !(RESOLVED_ID in chunk.modules)) return null;
      const ids = shippedModuleIds(Object.values(meta.chunks));
      // Paquets des modules virtuels du bundler, résolus depuis Vite.
      const vite = findPackageDir("vite", [root]);
      const cssModules = Array.from(
        cssPackages,
        (dir) => `${dir}/package.json`,
      );
      const npm = npmPackagesFromModules(
        Array.from(ids).concat(cssModules),
        vite ? [root, vite] : [root],
      );
      const data = buildThirdPartyLicenses({ npm });
      checkThirdPartyLicenses(data);
      if (!PLACEHOLDER_LITERAL.test(code)) {
        throw new Error("marqueur de la page des licences introuvable");
      }
      // Fonction de remplacement : les `$` du JSON restent littéraux.
      const literal = JSON.stringify(JSON.stringify(data));
      return {
        code: code.replace(PLACEHOLDER_LITERAL, () => literal),
        map: null,
      };
    },
  };
}
