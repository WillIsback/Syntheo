export function parseSessionTagNames(
  value: string | null | undefined,
): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const names = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== "string") {
        continue;
      }
      const name = entry.trim();
      if (name) {
        names.add(name);
      }
    }

    return [...names].sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}
