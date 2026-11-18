const MAX_FOLDER_PATH_LENGTH = 200;
const MAX_FOLDER_SEGMENT_LENGTH = 80;

export function normalizeFolderPath(path: string): string | null {
  const replaced = path.replace(/\\/g, "/").trim();
  if (!replaced) {
    return "";
  }

  if (replaced.startsWith("/")) {
    return null;
  }

  // Supprime les "/" de fin par une boucle linéaire : un regex /\/+$/u
  // évalué via replace() backtrack en temps quadratique sur les entrées
  // répétitives (ReDoS polynomial, cf. CodeQL js/polynomial-redos).
  let end = replaced.length;
  while (end > 0 && replaced[end - 1] === "/") {
    end -= 1;
  }

  const segments: string[] = [];
  for (const raw of replaced.slice(0, end).split("/")) {
    if (!raw || raw === "." || raw === "..") {
      return null;
    }
    if (raw.length > MAX_FOLDER_SEGMENT_LENGTH) {
      return null;
    }
    segments.push(raw);
  }

  if (segments.length === 0) {
    return "";
  }

  const normalized = segments.join("/");
  if (normalized.length > MAX_FOLDER_PATH_LENGTH) {
    return null;
  }

  return normalized;
}

export function folderDisplayName(path: string | null | undefined): string {
  const normalized = normalizeFolderPath(path ?? "");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? normalized;
}

export function collectFolderPaths(paths: Iterable<string>): string[] {
  const collected = new Set<string>();

  for (const path of paths) {
    const normalized = normalizeFolderPath(path);
    if (!normalized) {
      continue;
    }

    const segments = normalized.split("/");
    let acc = "";
    for (const segment of segments) {
      acc = acc ? `${acc}/${segment}` : segment;
      collected.add(acc);
    }
  }

  return [...collected].sort((left, right) => left.localeCompare(right));
}

export function folderPathMatchesFilter(
  folderPath: string | null | undefined,
  folderFilter: string | null,
): boolean {
  if (folderFilter === null) {
    return true;
  }

  const normalized = normalizeFolderPath(folderPath ?? "") ?? "";
  if (folderFilter === "") {
    return normalized === "";
  }

  return (
    normalized === folderFilter || normalized.startsWith(`${folderFilter}/`)
  );
}

export function childFolderPath(
  parentPath: string,
  name: string,
): string | null {
  const parent = normalizeFolderPath(parentPath);
  const child = normalizeFolderPath(name);
  if (!parent || !child) {
    return null;
  }

  return normalizeFolderPath(`${parent}/${child}`);
}

export function ancestorFolderPaths(folderPath: string): string[] {
  const normalized = normalizeFolderPath(folderPath);
  if (!normalized) {
    return [];
  }

  const segments = normalized.split("/");
  const ancestors: string[] = [];
  let acc = "";
  for (const segment of segments) {
    acc = acc ? `${acc}/${segment}` : segment;
    ancestors.push(acc);
  }
  return ancestors;
}

/** Chemin lisible pour l'interface : `Equipe/MCO` devient `Equipe › MCO`. */
export function folderPathLabel(path: string | null | undefined): string {
  const normalized = normalizeFolderPath(path ?? "");
  return normalized ? normalized.split("/").join(" › ") : "";
}

/** `candidate` est `ancestor` lui-même ou l'un de ses sous-dossiers. */
export function isSameOrDescendantFolder(
  candidate: string,
  ancestor: string,
): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

/** Dossier parent d'un chemin (`""` pour un dossier à la racine). */
export function parentFolderPath(path: string): string {
  const normalized = normalizeFolderPath(path) ?? "";
  const slash = normalized.lastIndexOf("/");
  return slash === -1 ? "" : normalized.slice(0, slash);
}

/**
 * Chemin d'un dossier déplacé sous `targetParent` (`""` : à la racine), en
 * gardant son nom. `null` si le déplacement est impossible : vers lui-même ou
 * l'un de ses sous-dossiers, ou chemin trop long.
 */
export function movedFolderPath(
  sourcePath: string,
  targetParent: string,
): string | null {
  const source = normalizeFolderPath(sourcePath);
  const target = normalizeFolderPath(targetParent);
  if (!source || target === null) {
    return null;
  }
  if (target && isSameOrDescendantFolder(target, source)) {
    return null;
  }
  const name = folderDisplayName(source);
  return target ? childFolderPath(target, name) : name;
}

/** Remplace le préfixe `fromPath` par `toPath` (dossier renommé ou déplacé). */
export function rebaseFolderPath(
  path: string,
  fromPath: string,
  toPath: string,
): string {
  if (path === fromPath) return toPath;
  if (path.startsWith(`${fromPath}/`)) {
    return `${toPath}${path.slice(fromPath.length)}`;
  }
  return path;
}
