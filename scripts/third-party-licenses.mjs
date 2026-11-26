#!/usr/bin/env node
// Licences des composants tiers (issue 747), générées au build, jamais tenues à
// la main : crates Rust des deux espaces de travail livrés (application et
// module syntheo-speech, d'après Cargo.lock via `cargo metadata`), paquets npm
// de l'interface (pnpm-lock.yaml via `pnpm licenses list --prod`), ONNX
// Runtime et modèles de la transcription sur le poste (apps/speech). Le
// texte des licences vient des fichiers LICENSE, COPYING et NOTICE de chaque
// composant ; les textes identiques ne sont gardés qu'une fois.
//
// Usage : node scripts/third-party-licenses.mjs --check   (compte et contrôle)
//         node scripts/third-party-licenses.mjs --json    (écrit le JSON)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LICENSE_FILE =
  /^(?:licen[cs]e|copying|notice|unlicense)(?:[-._][\w.-]*)?$/i;
const MAX_TEXT_BYTES = 128 * 1024;
const MAX_FILES_PER_COMPONENT = 6;

/** Fichiers de licence d'un dossier, triés, bornés. */
export function readLicenseFiles(dir) {
  if (!dir || !existsSync(dir)) return [];
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
      const path = join(dir, name);
      try {
        if (!statSync(path).isFile() || statSync(path).size > MAX_TEXT_BYTES) {
          return [];
        }
        const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();
        return text ? [text] : [];
      } catch {
        return [];
      }
    });
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
      license: pkg.license ?? (pkg.license_file ? "voir le texte" : "inconnue"),
      url: pkg.repository ?? null,
      dir: resolve(pkg.manifest_path, ".."),
    }));
}

/** Paquets npm livrés, d'après `pnpm licenses list --prod --json`. */
export function packagesFromPnpm(report) {
  const out = [];
  for (const [license, entries] of Object.entries(report)) {
    for (const entry of entries) {
      if (entry.name.startsWith("@syntheo/")) continue;
      entry.versions.forEach((version, index) => {
        out.push({
          kind: "npm",
          name: entry.name,
          version,
          license: entry.license ?? license,
          url: entry.homepage ?? null,
          dir: entry.paths?.[index] ?? entry.paths?.[0] ?? null,
        });
      });
    }
  }
  return out;
}

/** ONNX Runtime et modèles de la transcription sur le poste. */
export function speechComponents(root = ROOT) {
  const chain = join(root, "apps/speech/supply-chain");
  const out = [];
  const ortTable = join(chain, "ort.tsv");
  if (existsSync(ortTable)) {
    const version = /@(\d+\.\d+\.\d+)\//.exec(
      readFileSync(ortTable, "utf8"),
    )?.[1];
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
  if (existsSync(models)) {
    const manifest = JSON.parse(readFileSync(models, "utf8"));
    for (const origin of manifest.source?.origin ?? []) {
      out.push({
        kind: "model",
        name: origin.split("/").filter(Boolean).pop(),
        version: `int8 (${String(manifest.source.revision ?? "").slice(0, 12)})`,
        license: manifest.license ?? "inconnue",
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
} = {}) {
  if (npmExecPath && /\.c?js$/i.test(npmExecPath) && exists(npmExecPath)) {
    return {
      file: execPath,
      args: [npmExecPath, ...PNPM_LICENSES_ARGS],
      shell: false,
    };
  }
  return {
    file: "pnpm",
    args: [...PNPM_LICENSES_ARGS],
    shell: platform === "win32",
  };
}

function pnpmLicenses() {
  const command = pnpmCommand();
  return JSON.parse(
    execFileSync(command.file, command.args, {
      cwd: join(ROOT, "apps/desktop"),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
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
  const pnpm = sources.pnpm ?? pnpmLicenses();

  const raw = [
    ...cratesFromMetadata(appMetadata, "desktop"),
    ...cratesFromMetadata(speechMetadata, "syntheo-speech"),
    ...packagesFromPnpm(pnpm),
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
      return { ...component, texts: indices };
    });

  const license = (name) =>
    existsSync(join(root, name))
      ? readFileSync(join(root, name), "utf8").trim()
      : "";
  return {
    syntheo: {
      license: "MIT",
      text: license("LICENSE"),
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
  const path = dir && join(dir, name);
  if (!path || !existsSync(path)) return [];
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();
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
