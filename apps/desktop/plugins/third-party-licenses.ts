import type { Plugin } from "vite";

import {
  buildThirdPartyLicenses,
  checkThirdPartyLicenses,
} from "../../../scripts/third-party-licenses.mjs";

const VIRTUAL_ID = "virtual:third-party-licenses";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

/**
 * Page des licences (issue 747) : les données sont générées au build depuis
 * Cargo.lock, pnpm-lock.yaml et la liste des modèles, puis servies par un
 * module virtuel chargé seulement à l'ouverture de la page. Un build de
 * production échoue si la liste est vide ou incomplète ; en développement,
 * une erreur de génération s'affiche dans la page.
 */
export function thirdPartyLicenses(): Plugin {
  let production = false;
  return {
    name: "third-party-licenses",
    configResolved(config) {
      production = config.command === "build";
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      try {
        const data = buildThirdPartyLicenses();
        checkThirdPartyLicenses(data);
        return `export default ${JSON.stringify(data)};`;
      } catch (error) {
        if (production) throw error;
        const message = error instanceof Error ? error.message : String(error);
        return `export default ${JSON.stringify({ error: message })};`;
      }
    },
  };
}
