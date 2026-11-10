type Semver = readonly [major: number, minor: number, patch: number];

/**
 * Lit `X.Y.Z`, avec un suffixe éventuel (`0.7.1-3` pour une alpha) qui est
 * ignoré : une préversion compte comme sa version de base.
 */
function parseVersion(version: string): Semver | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(
    version.trim(),
  );
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a: Semver, b: Semver): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Versions du journal à afficher pour la version installée `current`, de la
 * plus récente à la plus ancienne : les patchs `X.Y.z` jusqu'à `current`
 * (`X.Y.0` compris), puis `X.0.0` si `X ≥ 1` et `Y > 0`. La ligne repart de
 * zéro à chaque minor ou major ; les versions absentes sont simplement sautées
 * et les versions futures ignorées.
 */
export function selectVersionLine(
  versions: readonly string[],
  current: string,
): string[] {
  const installed = parseVersion(current);
  if (!installed) return [];
  const [major, minor] = installed;

  const selected = new Map<string, { version: string; semver: Semver }>();
  for (const version of versions) {
    const semver = parseVersion(version);
    if (!semver) continue;
    const inLine =
      (semver[0] === major &&
        semver[1] === minor &&
        compare(semver, installed) <= 0) ||
      (major >= 1 &&
        minor > 0 &&
        semver[0] === major &&
        semver[1] === 0 &&
        semver[2] === 0);
    const key = semver.join(".");
    // Deux fichiers pour la même base (`0.7.1` et `0.7.1-3`) : la version
    // sans suffixe l'emporte.
    if (inLine && (!selected.has(key) || version === key)) {
      selected.set(key, { version, semver });
    }
  }

  return Array.from(selected.values())
    .sort((a, b) => compare(b.semver, a.semver))
    .map((entry) => entry.version);
}
