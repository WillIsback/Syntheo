/// <reference types="vite/client" />

// Module virtuel du plugin Vite `plugins/changelog.ts` : journal de la ligne
// de version installée, de la plus récente à la plus ancienne (issue #536).
declare module "virtual:changelog" {
  export const entries: ReadonlyArray<{
    version: string;
    date: string | null;
    summary: string | null;
    content: string;
  }>;
}

// Module virtuel du plugin Vite `plugins/third-party-licenses.ts` : licences
// des composants tiers, générées au build (issue 747). `error` en
// développement si la génération a échoué.
declare module "virtual:third-party-licenses" {
  import type { ThirdPartyLicenses } from "../../../scripts/third-party-licenses.mjs";
  const data: ThirdPartyLicenses | { error: string };
  export default data;
}
