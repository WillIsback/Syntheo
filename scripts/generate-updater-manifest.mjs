#!/usr/bin/env node
// Manifeste de mise à jour intégrée (issue 591) : `latest.json`, lu par
// tauri-plugin-updater à l'adresse
// https://github.com/WillIsback/Syntheo/releases/latest/download/latest.json
//
// Formats couverts (décision du 2026-11-18) : AppImage et installeur NSIS.
// Pas de clé générique `linux-x86_64` / `windows-x86_64` : une installation
// .deb ou MSI y retomberait et installerait un paquet d'un autre format.
//
// Chaque installeur doit être accompagné de son `.sig` produit par
// `tauri signer sign --app-version <version>` : le script vérifie que la
// signature porte le nom du fichier et la version annoncée (le plugin, avec
// `requireSignedVersion`, refuse sinon la mise à jour).
//
// Usage : node scripts/generate-updater-manifest.mjs --version v0.7.3 \
//   --dist dist --notes notes.md --repo WillIsback/Syntheo [--out dist/latest.json]
// Contrôle (job publish) : node scripts/generate-updater-manifest.mjs check \
//   --version v0.7.3 --dist dist --repo WillIsback/Syntheo [--manifest dist/latest.json]

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Clé de plateforme → nom du fichier publié pour la version `v` (sans « v »). */
export const UPDATER_PLATFORMS = {
  "linux-x86_64-appimage": (v) => `Syntheo_${v}_amd64.AppImage`,
  "windows-x86_64-nsis": (v) => `Syntheo_${v}_x64-setup.exe`,
};

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function plainVersion(version) {
  const v = String(version ?? "").replace(/^v/, "");
  if (!SEMVER.test(v)) {
    throw new Error(`version invalide : « ${version} »`);
  }
  return v;
}

/**
 * Lit le commentaire de confiance d'une signature Tauri (`.sig` : base64 d'une
 * signature minisign). Renvoie ses champs (`timestamp`, `file`, `version`).
 */
export function signatureFields(signature) {
  const text = Buffer.from(String(signature).trim(), "base64").toString("utf8");
  const line = text
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("trusted comment: "));
  if (!line) {
    throw new Error("signature illisible : commentaire de confiance absent");
  }
  const fields = {};
  for (const part of line.slice("trusted comment: ".length).split("\t")) {
    const colon = part.indexOf(":");
    if (colon > 0) fields[part.slice(0, colon)] = part.slice(colon + 1);
  }
  return fields;
}

/**
 * Construit le manifeste. `readSignature(fileName)` renvoie le contenu du
 * `.sig` de l'installeur (ou lève une erreur s'il manque).
 */
export async function buildUpdaterManifest({
  version,
  notes,
  repo,
  pubDate = new Date(),
  readSignature,
}) {
  const v = plainVersion(version);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) {
    throw new Error(`dépôt invalide : « ${repo} »`);
  }
  const platforms = {};
  for (const [key, fileFor] of Object.entries(UPDATER_PLATFORMS)) {
    const fileName = fileFor(v);
    const signature = String(await readSignature(fileName)).trim();
    if (!signature) {
      throw new Error(`signature vide pour ${fileName}`);
    }
    const fields = signatureFields(signature);
    if (fields.file !== fileName) {
      throw new Error(
        `signature de ${fileName} faite pour « ${fields.file ?? "?"} »`,
      );
    }
    if (fields.version !== v) {
      throw new Error(
        `signature de ${fileName} liée à la version « ${fields.version ?? "aucune"} », manifeste en ${v} (signer avec --app-version ${v})`,
      );
    }
    platforms[key] = {
      signature,
      // URL versionnée, pas l'alias stable : l'URL et la signature désignent
      // toujours les mêmes octets.
      url: `https://github.com/${repo}/releases/download/v${v}/${encodeURIComponent(fileName)}`,
    };
  }
  return {
    version: v,
    notes: String(notes ?? "").trim(),
    pub_date: new Date(pubDate).toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms,
  };
}

/** Contrôle d'un manifeste publié contre le tag et le contenu de `dist/`. */
export function checkUpdaterManifest(manifest, { version, repo, files }) {
  const v = plainVersion(version);
  const errors = [];
  if (manifest.version !== v) {
    errors.push(`version ${manifest.version} ≠ tag ${v}`);
  }
  const keys = Object.keys(manifest.platforms ?? {}).sort();
  const expected = Object.keys(UPDATER_PLATFORMS).sort();
  if (keys.join(",") !== expected.join(",")) {
    errors.push(`plateformes [${keys}] ≠ [${expected}]`);
  }
  const prefix = `https://github.com/${repo}/releases/download/v${v}/`;
  for (const [key, entry] of Object.entries(manifest.platforms ?? {})) {
    if (!entry.url?.startsWith(prefix)) {
      errors.push(`${key} : URL hors de la release v${v} (${entry.url})`);
      continue;
    }
    const fileName = decodeURIComponent(entry.url.slice(prefix.length));
    if (!files.includes(fileName)) {
      errors.push(`${key} : ${fileName} absent de dist/`);
    }
    if (!entry.signature) {
      errors.push(`${key} : signature vide`);
    }
  }
  return errors;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(`argument inattendu : ${name ?? ""}`);
    }
    options[name.slice(2)] = value;
  }
  for (const required of ["version", "dist", "repo"]) {
    if (!options[required]) throw new Error(`--${required} est requis`);
  }
  return options;
}

async function check(options) {
  const dist = path.resolve(options.dist);
  const manifestPath = options.manifest ?? path.join(dist, "latest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const files = await readdir(dist);
  const errors = checkUpdaterManifest(manifest, {
    version: options.version,
    repo: options.repo,
    files,
  });
  const v = plainVersion(options.version);
  for (const fileFor of Object.values(UPDATER_PLATFORMS)) {
    const sig = `${fileFor(v)}.sig`;
    if (!files.includes(sig)) {
      errors.push(`${sig} absent`);
    } else if (!(await readFile(path.join(dist, sig), "utf8")).trim()) {
      errors.push(`${sig} vide`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`latest.json invalide : ${errors.join(" ; ")}`);
  }
  console.log(`latest.json conforme : ${manifest.version}`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "check") {
    await check(parseArgs(argv.slice(1)));
    return;
  }
  const options = parseArgs(argv);
  const dist = path.resolve(options.dist);
  const notes = options.notes ? await readFile(options.notes, "utf8") : "";
  const manifest = await buildUpdaterManifest({
    version: options.version,
    notes,
    repo: options.repo,
    readSignature: (fileName) =>
      readFile(path.join(dist, `${fileName}.sig`), "utf8"),
  });
  const out = options.out ?? path.join(dist, "latest.json");
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `latest.json : ${manifest.version}, ${Object.keys(manifest.platforms).join(", ")}`,
  );
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
