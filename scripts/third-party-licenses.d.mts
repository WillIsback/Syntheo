// Déclarations de scripts/third-party-licenses.mjs (issue 747), pour le
// plugin Vite de l'application.

export type ThirdPartyComponent = {
  kind: "crate" | "npm" | "native" | "model";
  name: string;
  version: string;
  license: string;
  url: string | null;
  /** Indices dans `texts`. */
  texts: number[];
};

export type ThirdPartyLicenses = {
  syntheo: {
    license: string;
    text: string;
    origin: { project: string; url: string; license: string; holder: string };
  };
  components: ThirdPartyComponent[];
  texts: string[];
};

export function buildThirdPartyLicenses(
  sources?: Record<string, unknown>,
): ThirdPartyLicenses;
export function checkThirdPartyLicenses(data: ThirdPartyLicenses): {
  crates: number;
  npm: number;
  native: number;
  models: number;
  texts: number;
};
