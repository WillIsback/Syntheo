import { lstatSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

// Validation des chemins reçus en argument par les scripts de vérification :
// le chemin doit exister, avoir le bon type et il est renvoyé résolu
// (absolu, liens symboliques suivis) pour que la suite du script ne lise que
// ce qui a été vérifié.

function requireValue(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`Missing or invalid ${label}`);
  }
}

export function existingFile(value, label) {
  requireValue(value, label);
  let resolved;
  try {
    resolved = realpathSync(value);
  } catch {
    throw new Error(`${label} does not exist: ${value}`);
  }
  if (!statSync(resolved).isFile()) {
    throw new Error(`${label} is not a file: ${value}`);
  }
  return resolved;
}

export function existingDirectory(value, label) {
  requireValue(value, label);
  let resolved;
  try {
    resolved = realpathSync(value);
  } catch {
    throw new Error(`${label} does not exist: ${value}`);
  }
  if (!statSync(resolved).isDirectory()) {
    throw new Error(`${label} is not a directory: ${value}`);
  }
  return resolved;
}

// Le fichier de sortie peut ne pas exister ; son dossier parent, si. S'il
// existe déjà, ce doit être un fichier ordinaire : on n'écrit jamais à travers
// un lien symbolique.
export function outputFile(value, label) {
  requireValue(value, label);
  const parent = existingDirectory(
    path.dirname(path.resolve(value)),
    `${label} directory`,
  );
  const target = path.join(parent, path.basename(path.resolve(value)));
  let metadata;
  try {
    metadata = lstatSync(target);
  } catch {
    return target;
  }
  if (!metadata.isFile()) {
    throw new Error(`${label} must be a regular file: ${value}`);
  }
  return target;
}
