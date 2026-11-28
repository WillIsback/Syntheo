#!/usr/bin/env node
// Licences des composants tiers (issue 747), générées au build, jamais tenues à
// la main : crates Rust des deux espaces de travail livrés (application et
// module syntheo-speech, d'après Cargo.lock via `cargo metadata`), paquets npm
// réellement présents dans le bundle de production (relevés par le plugin
// Vite dans les chunks rendus, issue 781), ONNX Runtime et modèles de la
// transcription sur le poste (apps/speech). Le texte des licences vient des
// fichiers LICENSE, COPYING et NOTICE de chaque composant ; les textes
// identiques ne sont gardés qu'une fois. Une licence non déclarée est déduite
// de son texte, sinon notée UNKNOWN_LICENSE, que l'interface traduit
// (issue 775). Un composant sans texte reçoit le texte SPDX officiel de sa
// licence, signalé comme référence (issue 776) : copies de license-list-data
// (SPDX, v3.28.0, via le crate spdx 0.13.4) dans scripts/spdx-licenses.
//
// Usage : node scripts/third-party-licenses.mjs --check   (crates, modèles)
//         node scripts/third-party-licenses.mjs --json    (écrit le JSON)
//         La liste npm se contrôle au build de production (`vite build`).

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
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LICENSE_FILE =
  /^(?:licen[cs]e|copying|notice|unlicense)(?:[-._][\w.-]*)?$/i;
const MAX_TEXT_BYTES = 128 * 1024;
const MAX_FILES_PER_COMPONENT = 6;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

/** Licence inconnue : marqueur stable des données, traduit par l'interface. */
export const UNKNOWN_LICENSE = "NOASSERTION";

/** Dépôt de Syntheo, affiché dans le bloc de sa licence (issue 775). */
export const SYNTHEO_REPOSITORY = "https://github.com/WillIsback/Syntheo";

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
 * Texte d'un fichier régulier d'au plus `maxBytes` octets, ou null. Le
 * contrôle et la lecture passent par le même descripteur (issue 780, CodeQL
 * js/file-system-race) : le chemin n'est ouvert qu'une fois.
 */
export function readTextFile(path, maxBytes = MAX_TEXT_BYTES) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch {
    return null;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    // Un octet de plus que la limite : un fichier qui grandit est refusé.
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length > maxBytes) return null;
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
      authors: authorNames(pkg.authors),
      dir: resolve(pkg.manifest_path, ".."),
    }));
}

/**
 * Paquets npm d'après `pnpm licenses list --prod --json`, en développement
 * seulement : la liste des paquets atteignables, plus large que le bundle.
 * Le build de production dérive la sienne des modules livrés
 * (npmPackagesFromModules, issue 781).
 */
export function packagesFromPnpm(report) {
  const out = [];
  for (const [license, entries] of Object.entries(report)) {
    for (const entry of entries) {
      if (entry.name.startsWith("@syntheo/")) continue;
      entry.versions.forEach((version, index) => {
        // pnpm range sous « Unknown » les paquets sans champ `license`.
        const declared = entry.license ?? license;
        out.push({
          kind: "npm",
          name: entry.name,
          version,
          license: declared && declared !== "Unknown" ? declared : null,
          url: entry.homepage ?? null,
          authors: [],
          dir: entry.paths?.[index] ?? entry.paths?.[0] ?? null,
        });
      });
    }
  }
  return out;
}

const CSS_FILE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)$/;

/**
 * Modules livrés d'après les chunks rendus (`meta.chunks` du hook
 * renderChunk) : ceux dont il reste du code après le tree-shaking, et les
 * feuilles de style, extraites du code JavaScript mais livrées (polices
 * comprises).
 */
export function shippedModuleIds(chunks) {
  const ids = new Set();
  for (const chunk of chunks) {
    for (const [id, module] of Object.entries(chunk.modules ?? {})) {
      if (module.renderedLength > 0 || CSS_FILE.test(id.split("?")[0])) {
        ids.add(id);
      }
    }
  }
  return ids;
}

/** Dossier du paquet npm qui contient le fichier `id`, ou null. */
export function packageDirFromModuleId(id) {
  const path = id.replace(/^\0/, "").split("?")[0].replace(/\\/g, "/");
  const marker = "/node_modules/";
  const at = path.lastIndexOf(marker);
  if (at < 0) return null;
  const parts = path.slice(at + marker.length).split("/");
  const size = parts[0].startsWith("@") ? 2 : 1;
  if (parts.length <= size) return null;
  return path.slice(0, at + marker.length) + parts.slice(0, size).join("/");
}

/**
 * Modules virtuels injectés par le bundler (`\0vite/preload-helper.js`,
 * `\0rolldown/runtime.js`) : du code de ce paquet, livré. Les assistants
 * d'Oxc (`\0@oxc-project+runtime@x/…`) sont embarqués dans le binaire de
 * Rolldown, sans paquet npm installé. Les autres modules virtuels (`\0virtual:`)
 * sont générés par Syntheo.
 */
const EMBEDDED_HELPERS = { "@oxc-project/runtime": "rolldown" };

/** Paquet d'un module virtuel du bundler, ou null (module de Syntheo). */
export function virtualModulePackage(id) {
  if (!id.startsWith("\0")) return null;
  const match = /^(@[\w.-]+[+/][\w.-]+|[\w.-]+)(?:@[^/]+)?\/./.exec(
    id.slice(1),
  );
  if (!match) return null;
  const name = match[1].replace("+", "/");
  return EMBEDDED_HELPERS[name] ?? name;
}

/**
 * Dossier réel du paquet `name`, résolu comme Node depuis chacun des
 * dossiers de `from` (node_modules des dossiers parents), ou null.
 */
export function findPackageDir(name, from) {
  for (const start of from) {
    let dir = resolve(start);
    for (;;) {
      const candidate = join(dir, "node_modules", name);
      if (isFile(join(candidate, "package.json")))
        return realpathSync(candidate);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Nom d'un auteur npm ou Cargo, sans adresse ni site. */
function authorName(author) {
  const raw = typeof author === "string" ? author : author?.name;
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/<[^>]*>/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
  return name || null;
}

export function authorNames(authors) {
  const list = Array.isArray(authors) ? authors : authors ? [authors] : [];
  return [...new Set(list.map(authorName).filter(Boolean))];
}

/** Licence déclarée par un package.json (champ moderne ou ancien). */
function manifestLicense(manifest) {
  const { license, licenses } = manifest;
  if (typeof license === "string" && license) return license;
  if (license && typeof license.type === "string") return license.type;
  if (Array.isArray(licenses)) {
    const types = licenses
      .map((item) => (typeof item === "string" ? item : item?.type))
      .filter((type) => typeof type === "string" && type);
    if (types.length > 0) return types.join(" OR ");
  }
  return null;
}

/** Adresse du projet : `homepage`, sinon le dépôt. */
function manifestUrl(manifest) {
  if (typeof manifest.homepage === "string" && manifest.homepage) {
    return manifest.homepage;
  }
  const repository =
    typeof manifest.repository === "string"
      ? manifest.repository
      : manifest.repository?.url;
  if (typeof repository !== "string" || !repository) return null;
  const url = repository.replace(/^git\+/, "").replace(/\.git$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return url.replace(/^github:/, "https://github.com/");
}

/**
 * Paquets npm livrés (issue 781) : les paquets qui contiennent les modules
 * de `ids` (voir shippedModuleIds), lus dans leur package.json. Les
 * paquets de l'espace de travail (hors node_modules) sont ceux de Syntheo.
 * `from` : dossiers depuis lesquels résoudre les paquets des modules
 * virtuels du bundler. Un module virtuel dont le paquet est introuvable lève
 * une erreur : la liste serait incomplète.
 */
export function npmPackagesFromModules(ids, from) {
  const dirs = new Set();
  for (const id of ids) {
    const dir = packageDirFromModuleId(id);
    if (dir) {
      dirs.add(dir);
      continue;
    }
    const name = virtualModulePackage(id);
    if (!name) continue;
    const found = findPackageDir(name, from);
    if (!found) {
      throw new Error(
        `paquet du module virtuel introuvable : ${name} (${JSON.stringify(id)})`,
      );
    }
    dirs.add(found);
  }
  return [...dirs].map((dir) => npmPackageFromDir(dir));
}

/** Composant npm d'un dossier de paquet. */
export function npmPackageFromDir(dir) {
  // Certains manifestes listent des milliers d'exports (date-fns : 200 Ko).
  const text = readTextFile(join(dir, "package.json"), MAX_MANIFEST_BYTES);
  if (text == null) throw new Error(`package.json illisible : ${dir}`);
  const manifest = JSON.parse(text);
  return {
    kind: "npm",
    name: manifest.name,
    version: manifest.version,
    license: manifestLicense(manifest),
    url: manifestUrl(manifest),
    authors: authorNames(manifest.author),
    dir,
  };
}

/**
 * Paquets npm importés par une feuille de style (`@import "tailwindcss"`) :
 * le CSS qu'ils fournissent est inliné à la compilation, sans module dans
 * le graphe du bundler.
 */
export function cssPackageImports(code) {
  const names = [];
  for (const [, specifier] of code.matchAll(
    /@import\s+(?:url\(\s*)?["']([^"']+)["']/g,
  )) {
    if (/^(?:[./~]|[a-z]+:)/i.test(specifier)) continue;
    const parts = specifier.split("/");
    const name = specifier.startsWith("@")
      ? parts.slice(0, 2).join("/")
      : parts[0];
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** Textes SPDX de référence (issue 776), copiés de license-list-data. */
const SPDX_DIR = join(ROOT, "scripts/spdx-licenses");

/**
 * Identifiants d'une expression SPDX, dans l'ordre : « (MIT OR Apache-2.0)
 * AND Unicode-3.0 » donne MIT, Apache-2.0, Unicode-3.0 ; les champs non
 * normalisés (« MIT/Apache-2.0 ») se découpent aussi.
 */
export function licenseIds(expression) {
  const ids = [];
  for (const token of String(expression ?? "").split(/[\s()/,]+/)) {
    if (!token || /^(?:and|or|with)$/i.test(token)) continue;
    if (!ids.includes(token)) ids.push(token);
  }
  return ids;
}

let spdxIndex = null;

/** Nom de fichier de chaque texte SPDX de référence, par identifiant en minuscules. */
function spdxFiles(dir) {
  if (spdxIndex?.dir === dir) return spdxIndex.files;
  const files = new Map();
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".txt")) files.set(name.slice(0, -4).toLowerCase(), name);
  }
  spdxIndex = { dir, files };
  return files;
}

/** Identifiant SPDX canonique d'un texte de référence connu, ou null. */
export function spdxReferenceId(id, dir = SPDX_DIR) {
  const files = spdxFiles(dir);
  const lower = id.toLowerCase().replace(/\+$/, "");
  const name =
    files.get(lower) ?? files.get(lower.replace(/-(?:only|or-later)$/, ""));
  return name ? name.slice(0, -4) : null;
}

/** Texte SPDX officiel de la licence `id`, ou null s'il n'est pas copié. */
export function spdxReferenceText(id, dir = SPDX_DIR) {
  const canonical = spdxReferenceId(id, dir);
  return canonical ? readTextFile(join(dir, `${canonical}.txt`)) : null;
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
 * tests ; par défaut, elles sont lues dans le dépôt. `sources.npm` : paquets
 * npm livrés, relevés dans le bundle par le plugin Vite (issue 781) ; à
 * défaut (développement), ceux de `pnpm licenses list --prod`.
 */
export function buildThirdPartyLicenses(sources = {}) {
  const root = sources.root ?? ROOT;
  const spdxDir = sources.spdxDir ?? SPDX_DIR;
  const target =
    sources.appMetadata && sources.speechMetadata ? null : hostTarget();
  const appMetadata =
    sources.appMetadata ?? cargoMetadata(join(root, "Cargo.toml"), target);
  const speechMetadata =
    sources.speechMetadata ??
    cargoMetadata(join(root, "apps/speech/Cargo.toml"), target);
  const npm =
    sources.npm ??
    packagesFromPnpm(sources.pnpm ?? pnpmJson(PNPM_LICENSES_ARGS));

  const raw = [
    ...cratesFromMetadata(appMetadata, "desktop"),
    ...cratesFromMetadata(speechMetadata, "syntheo-speech"),
    ...npm.filter((component) => !component.name.startsWith("@syntheo/")),
    ...(sources.speech ?? speechComponents(root)),
  ];
  const unique = new Map();
  for (const component of raw) {
    const key = `${component.kind}:${component.name}:${component.version}`;
    if (!unique.has(key)) unique.set(key, component);
  }

  const texts = [];
  const textIndex = new Map();
  const indexOf = (text) => {
    const hash = createHash("sha256").update(text).digest("hex");
    if (!textIndex.has(hash)) {
      textIndex.set(hash, texts.length);
      texts.push(text);
    }
    return textIndex.get(hash);
  };
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
      const license =
        component.license ?? licenseFromTexts(selected) ?? UNKNOWN_LICENSE;
      // Issue 776 : sans texte propre, le texte SPDX officiel de chaque
      // licence de l'expression, signalé comme référence ; une licence sans
      // texte copié reste dans `missing`.
      const references = [];
      const missing = [];
      if (selected.length === 0 && license !== UNKNOWN_LICENSE) {
        for (const id of licenseIds(license)) {
          const canonical = spdxReferenceId(id, spdxDir);
          const text = canonical
            ? readTextFile(join(spdxDir, `${canonical}.txt`))
            : null;
          if (text)
            references.push({ license: canonical, text: indexOf(text) });
          else missing.push(id);
        }
      }
      return {
        ...component,
        authors: component.authors ?? [],
        license,
        texts: selected.map(indexOf),
        references,
        ...(missing.length > 0 ? { missing } : {}),
      };
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

function readNamed(dir, name) {
  const text = dir ? readTextFile(join(dir, name)) : null;
  return text ? [text] : [];
}

/**
 * Contrôle du build : listes non vides, composants connus présents, et
 * aucun composant livré sans texte de licence, ni le sien ni un texte SPDX
 * de référence (issues 776 et 781). `npm: false` : liste npm non relevée
 * (contrôle des crates seul, `--check`). `texts: false` : textes non exigés
 * (développement, où la liste npm de pnpm déborde du bundle).
 */
export function checkThirdPartyLicenses(
  data,
  { npm = true, texts = true } = {},
) {
  const count = (kind) => data.components.filter((c) => c.kind === kind).length;
  const has = (kind, name) =>
    data.components.some((c) => c.kind === kind && c.name === name);
  const problems = [];
  if (count("crate") === 0) problems.push("aucune crate");
  if (npm && count("npm") === 0) problems.push("aucun paquet npm");
  if (!has("crate", "serde")) problems.push("crate serde absente");
  if (!has("crate", "tauri")) problems.push("crate tauri absente");
  if (npm && !has("npm", "react")) problems.push("paquet react absent");
  if (count("model") === 0) problems.push("aucun modèle");
  if (!data.syntheo.text) problems.push("LICENSE de Syntheo absent");
  const bare = data.components
    .filter((c) => c.texts.length === 0 && (c.references ?? []).length === 0)
    .map((c) => `${c.kind} ${c.name}@${c.version} (${c.license})`);
  if (texts && bare.length > 0) {
    problems.push(`sans texte de licence : ${bare.join(", ")}`);
  }
  if (problems.length > 0) {
    throw new Error(`Licences des composants tiers : ${problems.join(", ")}.`);
  }
  return {
    crates: count("crate"),
    npm: count("npm"),
    native: count("native"),
    models: count("model"),
    texts: data.texts.length,
    references: data.components.filter((c) => c.references.length > 0).length,
    missing: [
      ...new Set(data.components.flatMap((c) => c.missing ?? [])),
    ].sort(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // La liste npm se relève dans le bundle (plugin Vite, `vite build`) : ce
  // contrôle couvre les crates, les composants natifs et les modèles.
  const data = buildThirdPartyLicenses({ npm: [] });
  const summary = checkThirdPartyLicenses(data, { npm: false });
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(data));
  } else {
    console.log(
      `${summary.crates} crates, ${summary.native} composants natifs, ${summary.models} modèles, ${summary.texts} textes de licence, ${summary.references} composants avec un texte de référence.`,
    );
    if (summary.missing.length > 0) {
      console.log(
        `Textes de référence manquants : ${summary.missing.join(", ")}.`,
      );
    }
  }
}
