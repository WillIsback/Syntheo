import { commands as detectCommands } from "@syntheo/plugin-detect";

/** Langues préférées du système, vide si elles sont illisibles. */
export async function loadSystemLanguages(): Promise<string[]> {
  try {
    const result = await detectCommands.getPreferredLanguages();
    return result.status === "ok" ? result.data : [];
  } catch {
    return [];
  }
}
