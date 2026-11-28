// Déclarations de scripts/third-party-licenses.mjs (issue 747), pour le
// plugin Vite de l'application.

export type ThirdPartyComponent = {
  kind: "crate" | "npm" | "native" | "model";
  name: string;
  version: string;
  /** Expression SPDX, ou UNKNOWN_LICENSE (issue 775). */
  license: string;
  url: string | null;
  /** Auteurs déclarés (Cargo.toml, package.json), sans adresse (issue 776). */
  authors: string[];
  /** Indices dans `texts` : les fichiers de licence du composant. */
  texts: number[];
  /**
   * Textes SPDX officiels de sa licence, à défaut des siens (issue 776) :
   * identifiant SPDX et indice dans `texts`.
   */
  references: { license: string; text: number }[];
  /** Licences de l'expression sans texte de référence copié. */
  missing?: string[];
};

export type ThirdPartyLicenses = {
  syntheo: {
    license: string;
    /** Dépôt de Syntheo (issue 775). */
    repository: string;
    text: string;
    origin: { project: string; url: string; license: string; holder: string };
  };
  components: ThirdPartyComponent[];
  texts: string[];
};

/** Composant npm relevé dans le bundle, avant lecture de ses textes. */
export type NpmPackage = {
  kind: "npm";
  name: string;
  version: string;
  license: string | null;
  url: string | null;
  authors: string[];
  dir: string;
};

export const UNKNOWN_LICENSE: string;
export const SYNTHEO_REPOSITORY: string;

export function buildThirdPartyLicenses(sources?: {
  npm?: NpmPackage[];
  [key: string]: unknown;
}): ThirdPartyLicenses;
export function checkThirdPartyLicenses(
  data: ThirdPartyLicenses,
  options?: { npm?: boolean; texts?: boolean },
): {
  crates: number;
  npm: number;
  native: number;
  models: number;
  texts: number;
  references: number;
  missing: string[];
};
export function shippedModuleIds(
  chunks: Iterable<{ modules: Record<string, { renderedLength: number }> }>,
): Set<string>;
export function npmPackagesFromModules(
  ids: Iterable<string>,
  from: string[],
): NpmPackage[];
export function findPackageDir(name: string, from: string[]): string | null;
export function cssPackageImports(code: string): string[];
