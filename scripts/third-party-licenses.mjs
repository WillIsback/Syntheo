#!/usr/bin/env node
// Licences des composants tiers (issue 747), générées au build, jamais tenues à
// la main : crates Rust des deux espaces de travail livrés (application et
// module syntheo-speech, d'après Cargo.lock via `cargo metadata`), paquets npm
// de l'interface (pnpm-lock.yaml via `pnpm licenses list --prod`, limités
// aux paquets réellement livrés d'après `pnpm list --prod`), ONNX
// Runtime et modèles de la transcription sur le poste (apps/speech). Le
// texte des licences vient des fichiers LICENSE, COPYING et NOTICE de chaque
// composant ; les textes identiques ne sont gardés qu'une fois. Une licence
// non déclarée est déduite de son texte, sinon notée UNKNOWN_LICENSE, que
// l'interface traduit (issue 775).
//
// Usage : node scripts/third-party-licenses.mjs --check   (compte et contrôle)
//         node scripts/third-party-licenses.mjs --json    (écrit le JSON)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LICENSE_FILE =
  /^(?:licen[cs]e|copying|notice|unlicense)(?:[-._][\w.-]*)?$/i;
const MAX_TEXT_BYTES = 128 * 1024;
const MAX_FILES_PER_COMPONENT = 6;

/** Licence inconnue : marqueur stable des données, traduit par l'interface. */
export const UNKNOWN_LICENSE = "NOASSERTION";

/** Dépôt de Syntheo, affiché dans le bloc de sa licence (issue 775). */
export const SYNTHEO_REPOSITORY = "https://github.com/WillIsback/Syntheo";

/**
 * Dépendances déclarées par un paquet livré mais absentes de son module
 * navigateur (issue 775) : outils de sa CLI, de son plugin de build ou de ses
 * macros, compilées au build. `pnpm licenses list --prod` les comptait comme
 * livrées (eslint, typescript, vite, terser via React Scan). Le contrôle du
 * build vérifie que le module d'entrée du paquet ne les importe pas.
 */
export const UNSHIPPED_DEPENDENCIES = {
  // Barre développeur : seul le module navigateur (bippy, preact,
  // react-grab) est livré ; react-doctor, unplugin et le reste servent à sa
  // CLI et à son plugin de build.
  "react-scan": [
    "react-doctor",
    "unplugin",
    "@babel/core",
    "@babel/types",
    "@rollup/pluginutils",
    "commander",
    "prompts",
    "picocolors",
  ],
  // Macros Lingui : compilées au build, jamais chargées par l'application.
  "@lingui/core": ["@lingui/babel-plugin-lingui-macro", "babel-plugin-macros"],
  "@lingui/react": ["@lingui/babel-plugin-lingui-macro", "babel-plugin-macros"],
  // Plugin Babel d'Emotion (et toute la chaîne @babel/*, babel-plugin-macros,
  // cosmiconfig, source-map) : transformation de build, jamais importée par
  // le module navigateur.
  "@emotion/react": ["@emotion/babel-plugin"],
  "@emotion/css": ["@emotion/babel-plugin"],
  // CLI de react-grab (ora, prompts, agent-install…) : outil en ligne de
  // commande, absent du module navigateur.
  "react-grab": ["@react-grab/cli"],
  // Chargeur d'icônes de Node (installation de paquets, résolution de
  // modules) : absent du module d'entrée d'@iconify/utils.
  "@iconify/utils": ["@antfu/install-pkg", "import-meta-resolve"],
  // Exécutables `katex` et `dsv2json` : seuls leurs scripts importent
  // commander.
  katex: ["commander"],
  "d3-dsv": ["commander"],
  // Composants « awesome » d'@lobehub/ui (sous-chemin `@lobehub/ui/awesome`)
  // : ni @lobehub/icons ni l'application ne les importent, son module
  // d'entrée non plus.
  "@lobehub/ui": ["@giscus/react", "@splinetool/runtime"],
};

/**
 * Paquets de déclarations TypeScript (`@types/*`) : des fichiers `.d.ts`
 * seulement, effacés à la compilation. checkTypesOnly le vérifie au build.
 */
export function isTypesOnlyPackage(name) {
  return name.startsWith("@types/");
}

const normalize = (text) => text.replace(/\s+/g, " ").toLowerCase();

// Phrases propres à chaque licence, toutes exigées. Prudent : un texte qui
// n'en contient pas toutes reste inconnu.
const LICENSE_PHRASES = [
  {
    id: "MIT",
    all: [
      "permission is hereby granted, free of charge, to any person obtaining a copy",
      "the above copyright notice and this permission notice shall be included",
      'the software is provided "as is", without warranty of any kind',
    ],
  },
  {
    id: "ISC",
    any: [
      "permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted",
      "permission to use, copy, modify, and distribute this software for any purpose with or without fee is hereby granted",
    ],
    all: [
      'the software is provided "as is" and the author disclaims all warranties',
    ],
  },
  {
    id: "Apache-2.0",
    all: ["apache license", "version 2.0, january 2004"],
  },
  {
    id: "BSD-3-Clause",
    all: [
      "redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met",
      "neither the name of",
    ],
    none: ["advertising materials"],
  },
  {
    id: "BSD-2-Clause",
    all: [
      "redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met",
      "redistributions in binary form must reproduce the above copyright notice",
    ],
    none: ["neither the name of", "advertising materials"],
  },
];

/** Identifiant SPDX d'un texte de licence connu, ou null. */
export function detectLicense(text) {
  const body = normalize(text);
  const found = LICENSE_PHRASES.find(
    (rule) =>
      rule.all.every((phrase) => body.includes(phrase)) &&
      (!rule.any || rule.any.some((phrase) => body.includes(phrase))) &&
      !(rule.none ?? []).some((phrase) => body.includes(phrase)),
  );
  return found?.id ?? null;
}

/**
 * Licence déduite des textes d'un composant : seulement si chacun est
 * reconnu et qu'ils désignent tous la même licence.
 */
export function licenseFromTexts(texts) {
  if (texts.length === 0) return null;
  const ids = new Set(texts.map(detectLicense));
  if (ids.size !== 1 || ids.has(null)) return null;
  return [...ids][0];
}

/** Fichiers de licence d'un dossier, triés, bornés. */
export function readLicenseFiles(dir) {
  if (!dir) return [];
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => LICENSE_FILE.test(name))
    .sort()
    .slice(0, MAX_FILES_PER_COMPONENT)
    .flatMap((name) => {
      const text = readTextFile(join(dir, name));
      return text ? [text] : [];
    });
}

/**
 * Texte d'un fichier régulier d'au plus MAX_TEXT_BYTES, ou null. Le contrôle
 * et la lecture passent par le même descripteur (issue 780, CodeQL
 * js/file-system-race) : le chemin n'est ouvert qu'une fois.
 */
export function readTextFile(path) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch {
    return null;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) return null;
    // Un octet de plus que la limite : un fichier qui grandit est refusé.
    const buffer = Buffer.alloc(MAX_TEXT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_TEXT_BYTES) return null;
    return buffer.toString("utf8", 0, length).replace(/\r\n/g, "\n").trim();
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * Crates livrées : la fermeture des dépendances normales (ni de dev, ni de
 * build) de `root`, hors membres de l'espace de travail. Les crates vendues
 * (`vendor/`) sont tierces même si elles viennent d'un chemin local.
 */
export function cratesFromMetadata(metadata, rootName) {
  const byId = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodes = new Map(
    (metadata.resolve?.nodes ?? []).map((node) => [node.id, node]),
  );
  const root = metadata.packages.find(
    (pkg) =>
      pkg.name === rootName && metadata.workspace_members.includes(pkg.id),
  );
  if (!root) throw new Error(`paquet racine introuvable : ${rootName}`);
  const seen = new Set();
  const queue = [root.id];
  while (queue.length > 0) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of nodes.get(id)?.deps ?? []) {
      const normal = (dep.dep_kinds ?? [{ kind: null }]).some(
        (kind) => kind.kind === null,
      );
      if (normal) queue.push(dep.pkg);
    }
  }
  return [...seen]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter(
      (pkg) =>
        pkg.source != null ||
        pkg.manifest_path.split(sep).join("/").includes("/vendor/"),
    )
    .map((pkg) => ({
      kind: "crate",
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? null,
      url: pkg.repository ?? null,
      dir: resolve(pkg.manifest_path, ".."),
    }));
}

/**
 * Dossiers des paquets livrés par `rootName`, d'après `pnpm list --prod
 * --json --depth Infinity` : la fermeture de ses dépendances, sans les arêtes
 * de `unshipped` ni les paquets `@types/*`. pnpm ne détaille qu'une fois chaque paquet (les suivantes
 * sont marquées `deduped`) : le graphe est indexé par dossier.
 */
export function shippedPackageDirs(
  projects,
  rootName,
  unshipped = UNSHIPPED_DEPENDENCIES,
) {
  const children = new Map();
  const names = new Map();
  const index = (path, name, deps) => {
    if (!path) return;
    names.set(path, name);
    const entries = Object.entries(deps ?? {});
    if (entries.length > 0 && !children.has(path)) {
      children.set(
        path,
        entries.map(([child, dep]) => ({ name: child, path: dep.path })),
      );
    }
    for (const [child, dep] of entries)
      index(dep.path, child, dep.dependencies);
  };
  for (const project of projects) {
    if (project.name) index(project.path, project.name, project.dependencies);
  }
  const root = projects.find((project) => project.name === rootName);
  if (!root) throw new Error(`projet npm introuvable : ${rootName}`);
  const seen = new Set();
  const queue = [root.path];
  while (queue.length > 0) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const skipped = unshipped[names.get(path)] ?? [];
    for (const child of children.get(path) ?? []) {
      if (
        child.path &&
        !skipped.includes(child.name) &&
        !isTypesOnlyPackage(child.name)
      )
        queue.push(child.path);
    }
  }
  return seen;
}

/**
 * Dossiers de l'arbre `pnpm list` : `projects`, ceux des projets de l'espace
 * de travail ; `all`, tous les dossiers, projets compris.
 */
export function pnpmTreeDirs(projects) {
  const workspace = new Set();
  const all = new Set();
  const visit = (deps) => {
    for (const dep of Object.values(deps ?? {})) {
      if (dep.path) all.add(dep.path);
      visit(dep.dependencies);
    }
  };
  for (const project of projects) {
    if (project.path) {
      workspace.add(project.path);
      all.add(project.path);
    }
    visit(project.dependencies);
  }
  return { workspace, all };
}

/**
 * Paquets npm livrés, d'après `pnpm licenses list --prod --json`, limités aux
 * dossiers de `shipped` quand il est fourni. Avec `tree` (pnpmTreeDirs), les
 * deux commandes doivent concorder, sans tolérance (issue 775) : un dossier
 * livré sans entrée de licence, ou une entrée hors de l'arbre, lève une
 * erreur au lieu d'être ignoré.
 */
export function packagesFromPnpm(report, shipped = null, tree = null) {
  const out = [];
  const reported = new Set();
  const strays = [];
  for (const [license, entries] of Object.entries(report)) {
    for (const entry of entries) {
      entry.versions.forEach((version, index) => {
        // Sans contrôle, un seul dossier vaut pour toutes les versions.
        const dir =
          entry.paths?.[index] ?? (tree ? null : entry.paths?.[0]) ?? null;
        if (dir) reported.add(dir);
        if (entry.name.startsWith("@syntheo/")) return;
        if (tree && !tree.all.has(dir)) {
          strays.push(`${entry.name}@${version} (${dir ?? "sans dossier"})`);
          return;
        }
        if (shipped && !shipped.has(dir)) return;
        // pnpm range sous « Unknown » les paquets sans champ `license`.
        const declared = entry.license ?? license;
        out.push({
          kind: "npm",
          name: entry.name,
          version,
          license: declared && declared !== "Unknown" ? declared : null,
          url: entry.homepage ?? null,
          dir,
        });
      });
    }
  }
  if (tree && shipped) {
    const unlisted = [...shipped].filter(
      (dir) => !tree.workspace.has(dir) && !reported.has(dir),
    );
    const problems = [
      ...(unlisted.length > 0
        ? [`livrés sans licence : ${unlisted.sort().join(", ")}`]
        : []),
      ...(strays.length > 0
        ? [`absents de pnpm list : ${strays.sort().join(", ")}`]
        : []),
    ];
    if (problems.length > 0) {
      throw new Error(
        `pnpm licenses list et pnpm list divergent : ${problems.join(" ; ")}.`,
      );
    }
  }
  return out;
}

const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](@?[\w.][^"'\s]*)["']/g;
const ENTRY_CONDITIONS = [
  "browser",
  "production",
  "import",
  "module",
  "default",
];

function exportTarget(target) {
  if (typeof target === "string")
    return /\.d\.[cm]?ts$/.test(target) ? null : target;
  if (!target || typeof target !== "object") return null;
  for (const condition of ENTRY_CONDITIONS) {
    const found = exportTarget(target[condition]);
    if (found) return found;
  }
  return null;
}

const SCRIPT_FILE = /\.[cm]?jsx?$/;
const RESOLVE_SUFFIXES = [
  "",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".json",
  "/index.js",
  "/index.mjs",
  "/index.cjs",
];
const MAX_ENTRY_FILES = 20000;

/**
 * Faux imports relatifs, par paquet : du texte que l'expression régulière
 * prend pour un import. Seuls ceux-ci sont tolérés ; tout autre import
 * introuvable lève une erreur.
 */
export const NOT_IMPORTS = {
  // Script `pack:bump` de son package.json, recopié dans un gabarit de
  // chaîne : « require('./package.json') ».
  "react-scan": ["./package.json"],
};

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Fichier désigné par un import relatif, comme un bundler le résout
 * (extension implicite, dossier et son index), ou erreur.
 */
function resolveRelative(path, from) {
  const found = RESOLVE_SUFFIXES.map((suffix) => path + suffix).find(isFile);
  if (!found) {
    throw new Error(
      `import introuvable : ${path} (depuis ${from ?? "package.json"})`,
    );
  }
  return found;
}

/**
 * Paquets importés par le module d'entrée d'un paquet (export « . », champ
 * `module` ou `main`) et par ses fichiers relatifs, dans son dossier. Lève
 * une erreur si un module manque, sort du paquet ou dépasse la borne
 * (issue 775) : un contrôle incomplet ne doit pas passer pour réussi.
 * `notImports` : spécifieurs à ignorer (voir NOT_IMPORTS).
 */
export function entryImports(dir, notImports = []) {
  const manifestText = readTextFile(join(dir, "package.json"));
  if (manifestText == null) {
    throw new Error(`package.json illisible : ${dir}`);
  }
  const manifest = JSON.parse(manifestText);
  const exported = manifest.exports;
  const entry =
    exportTarget(
      typeof exported === "object" && exported && "." in exported
        ? exported["."]
        : exported,
    ) ??
    manifest.module ??
    manifest.main ??
    "index.js";
  const imports = new Set();
  const seen = new Set();
  const queue = [{ file: resolveRelative(resolve(dir, entry), null) }];
  while (queue.length > 0) {
    const { file } = queue.pop();
    if (seen.has(file)) continue;
    if (relative(dir, file).startsWith("..")) {
      throw new Error(`import hors du paquet : ${file} (${dir})`);
    }
    seen.add(file);
    if (seen.size > MAX_ENTRY_FILES) {
      throw new Error(`plus de ${MAX_ENTRY_FILES} modules depuis ${dir}`);
    }
    if (!SCRIPT_FILE.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
      if (notImports.includes(specifier)) continue;
      if (specifier.startsWith(".")) {
        queue.push({
          file: resolveRelative(resolve(dirname(file), specifier), file),
        });
      } else if (!specifier.startsWith("node:")) {
        const parts = specifier.split("/");
        imports.add(
          specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0],
        );
      }
    }
  }
  return imports;
}

/**
 * Contrôle de l'exclusion des `@types/*` : aucun script dans leurs dossiers,
 * sinon ils pourraient être livrés.
 */
export function checkTypesOnly(dirs) {
  const scripts = [];
  const walk = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name !== "node_modules") walk(path);
      } else if (SCRIPT_FILE.test(item.name)) {
        scripts.push(path);
      }
    }
  };
  for (const dir of dirs) walk(dir);
  if (scripts.length > 0) {
    throw new Error(
      `Paquets @types écartés mais porteurs de scripts : ${scripts.join(", ")}.`,
    );
  }
}

/**
 * Contrôle de UNSHIPPED_DEPENDENCIES : le module d'entrée de chaque paquet
 * n'importe aucune des dépendances écartées. Sinon, la liste se tromperait.
 */
export function checkUnshippedDependencies(
  packageDirs,
  unshipped = UNSHIPPED_DEPENDENCIES,
) {
  const problems = [];
  for (const [name, dir] of packageDirs) {
    const imported = entryImports(dir, NOT_IMPORTS[name]);
    for (const dependency of unshipped[name] ?? []) {
      if (imported.has(dependency))
        problems.push(`${name} importe ${dependency}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Dépendances écartées de la liste des licences mais livrées : ${problems.join(", ")}.`,
    );
  }
}

/** Contenu d'un fichier, ou null s'il n'existe pas (une seule ouverture). */
function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/** ONNX Runtime et modèles de la transcription sur le poste. */
export function speechComponents(root = ROOT) {
  const chain = join(root, "apps/speech/supply-chain");
  const out = [];
  const ortTable = join(chain, "ort.tsv");
  const ortText = readOptional(ortTable);
  if (ortText != null) {
    const version = /@(\d+\.\d+\.\d+)\//.exec(ortText)?.[1];
    out.push({
      kind: "native",
      name: "ONNX Runtime",
      version: version ?? "inconnue",
      license: "MIT",
      url: "https://github.com/microsoft/onnxruntime",
      dir: join(chain, "notices/onnxruntime"),
      only: ["LICENSE"],
    });
  }
  const models = join(root, "apps/speech/models/models.json");
  const modelsText = readOptional(models);
  if (modelsText != null) {
    const manifest = JSON.parse(modelsText);
    for (const origin of manifest.source?.origin ?? []) {
      out.push({
        kind: "model",
        name: origin.split("/").filter(Boolean).pop(),
        version: `int8 (${String(manifest.source.revision ?? "").slice(0, 12)})`,
        license: manifest.license ?? null,
        url: origin,
        dir: join(chain, "notices/models"),
        only: [`LICENSE.${manifest.license}`],
      });
    }
  }
  return out;
}

/** Cible du build : celle du compilateur (les builds sont natives). */
function hostTarget() {
  const info = execFileSync("rustc", ["-vV"], { cwd: ROOT, encoding: "utf8" });
  const host = /^host: (\S+)$/m.exec(info)?.[1];
  if (!host) throw new Error("cible de rustc introuvable");
  return host;
}

function cargoMetadata(manifestPath, target) {
  return JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--locked",
        "--format-version",
        "1",
        "--filter-platform",
        target,
        "--manifest-path",
        manifestPath,
      ],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    ),
  );
}

const PNPM_LICENSES_ARGS = ["licenses", "list", "--prod", "--json"];
const PNPM_LIST_ARGS = ["list", "--prod", "--json", "--depth", "Infinity"];

/**
 * Commande qui lance `pnpm licenses list`. Sous Windows, `pnpm` est un script
 * `pnpm.cmd` qu'execFileSync ne lance pas sans shell (`spawnSync pnpm
 * ENOENT`, alpha 0.8.2-1). Pendant `pnpm build`, `npm_execpath` désigne le
 * script JavaScript de pnpm en cours : node le lance directement, sans shell,
 * sur toutes les plateformes. À défaut, `pnpm` passe par un shell sous
 * Windows seulement, avec des arguments constants. `cargo` et `rustc` sont des
 * exécutables (`.exe` sous Windows, proxys de rustup compris) : rien à faire.
 */
export function pnpmCommand({
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
  platform = process.platform,
  exists = existsSync,
  args = PNPM_LICENSES_ARGS,
} = {}) {
  if (npmExecPath && /\.c?js$/i.test(npmExecPath) && exists(npmExecPath)) {
    return {
      file: execPath,
      args: [npmExecPath, ...args],
      shell: false,
    };
  }
  return {
    file: "pnpm",
    args: [...args],
    shell: platform === "win32",
  };
}

function pnpmJson(args) {
  const command = pnpmCommand({ args });
  return JSON.parse(
    execFileSync(command.file, command.args, {
      cwd: join(ROOT, "apps/desktop"),
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      shell: command.shell,
    }),
  );
}

/**
 * Données de la page des licences. `sources` permet de les fournir dans les
 * tests ; par défaut, elles sont lues dans le dépôt.
 */
export function buildThirdPartyLicenses(sources = {}) {
  const root = sources.root ?? ROOT;
  const target =
    sources.appMetadata && sources.speechMetadata ? null : hostTarget();
  const appMetadata =
    sources.appMetadata ?? cargoMetadata(join(root, "Cargo.toml"), target);
  const speechMetadata =
    sources.speechMetadata ??
    cargoMetadata(join(root, "apps/speech/Cargo.toml"), target);
  const pnpm = sources.pnpm ?? pnpmJson(PNPM_LICENSES_ARGS);
  const pnpmTree =
    sources.pnpmTree ?? (sources.pnpm ? null : pnpmJson(PNPM_LIST_ARGS));
  const shipped = pnpmTree
    ? shippedPackageDirs(pnpmTree, "@syntheo/desktop")
    : null;
  if (pnpmTree && !sources.pnpmTree) {
    checkUnshippedDependencies(unshippedPackageDirs(pnpmTree));
    checkTypesOnly(typesPackageDirs(pnpmTree));
  }
  const tree = pnpmTree ? pnpmTreeDirs(pnpmTree) : null;

  const raw = [
    ...cratesFromMetadata(appMetadata, "desktop"),
    ...cratesFromMetadata(speechMetadata, "syntheo-speech"),
    ...packagesFromPnpm(pnpm, shipped, tree),
    ...(sources.speech ?? speechComponents(root)),
  ];
  const unique = new Map();
  for (const component of raw) {
    const key = `${component.kind}:${component.name}:${component.version}`;
    if (!unique.has(key)) unique.set(key, component);
  }

  const texts = [];
  const textIndex = new Map();
  const components = [...unique.values()]
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) ||
        a.name.localeCompare(b.name) ||
        a.version.localeCompare(b.version),
    )
    .map(({ dir, only, ...component }) => {
      // `only` : fichiers nommés (un dossier d'avis en contient d'autres).
      const selected = only
        ? only.flatMap((name) => readNamed(dir, name))
        : readLicenseFiles(dir);
      const indices = selected.map((text) => {
        const hash = createHash("sha256").update(text).digest("hex");
        if (!textIndex.has(hash)) {
          textIndex.set(hash, texts.length);
          texts.push(text);
        }
        return textIndex.get(hash);
      });
      const license =
        component.license ?? licenseFromTexts(selected) ?? UNKNOWN_LICENSE;
      return { ...component, license, texts: indices };
    });

  return {
    syntheo: {
      license: "MIT",
      repository: SYNTHEO_REPOSITORY,
      text: readTextFile(join(root, "LICENSE")) ?? "",
      origin: {
        project: "Anarlog",
        url: "https://github.com/fastrepl/anarlog",
        license: "MIT",
        holder: "Fastrepl, Inc.",
      },
    },
    components,
    texts,
  };
}

/** Dossier de chaque paquet de UNSHIPPED_DEPENDENCIES présent dans l'arbre. */
function unshippedPackageDirs(projects) {
  const found = new Map();
  const visit = (deps) => {
    for (const [name, dep] of Object.entries(deps ?? {})) {
      if (name in UNSHIPPED_DEPENDENCIES && dep.path && !found.has(dep.path)) {
        found.set(dep.path, name);
      }
      visit(dep.dependencies);
    }
  };
  for (const project of projects) visit(project.dependencies);
  return [...found].map(([path, name]) => [name, path]);
}

/** Dossiers des paquets `@types/*` de l'arbre. */
function typesPackageDirs(projects) {
  const found = new Set();
  const visit = (deps) => {
    for (const [name, dep] of Object.entries(deps ?? {})) {
      if (isTypesOnlyPackage(name) && dep.path) found.add(dep.path);
      visit(dep.dependencies);
    }
  };
  for (const project of projects) visit(project.dependencies);
  return found;
}

function readNamed(dir, name) {
  const text = dir ? readTextFile(join(dir, name)) : null;
  return text ? [text] : [];
}

/** Contrôle du build : listes non vides et composants connus présents. */
export function checkThirdPartyLicenses(data) {
  const count = (kind) => data.components.filter((c) => c.kind === kind).length;
  const has = (kind, name) =>
    data.components.some((c) => c.kind === kind && c.name === name);
  const problems = [];
  if (count("crate") === 0) problems.push("aucune crate");
  if (count("npm") === 0) problems.push("aucun paquet npm");
  if (!has("crate", "serde")) problems.push("crate serde absente");
  if (!has("crate", "tauri")) problems.push("crate tauri absente");
  if (!has("npm", "react")) problems.push("paquet react absent");
  if (count("model") === 0) problems.push("aucun modèle");
  if (!data.syntheo.text) problems.push("LICENSE de Syntheo absent");
  if (problems.length > 0) {
    throw new Error(`Licences des composants tiers : ${problems.join(", ")}.`);
  }
  return {
    crates: count("crate"),
    npm: count("npm"),
    native: count("native"),
    models: count("model"),
    texts: data.texts.length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = buildThirdPartyLicenses();
  const summary = checkThirdPartyLicenses(data);
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(data));
  } else {
    console.log(
      `${summary.crates} crates, ${summary.npm} paquets npm, ${summary.native} composants natifs, ${summary.models} modèles, ${summary.texts} textes de licence.`,
    );
  }
}
