import type {
  FullTextHit,
  NoteResult,
  SearchCatalog,
  SearchContact,
  SearchFolder,
  SearchNote,
  UnifiedSearchOptions,
  UnifiedSearchResults,
} from "./types";

import { folderDisplayName, folderPathMatchesFilter } from "~/session/folders";

// Plafonds communs : la palette et les mentions montrent au plus autant de
// dossiers et de contacts ; les notes suivent le même ordre des deux côtés.
export const SEARCH_FOLDER_LIMIT = 3;
export const SEARCH_CONTACT_LIMIT = 3;

// Comparaison sans accents ni casse (« Réunion » trouve « reunion »).
export function normalizeSearchQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// 0 : commence par le texte, 1 : un mot commence par le texte, 2 : le
// contient ailleurs ; null : ne le contient pas.
function textTier(text: string, needle: string): number | null {
  const haystack = normalizeSearchQuery(text);
  if (!haystack.includes(needle)) return null;
  if (haystack.startsWith(needle)) return 0;
  if (haystack.includes(` ${needle}`) || haystack.includes(`/${needle}`)) {
    return 1;
  }
  return 2;
}

function isStrictlyInside(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}

function folderTier(folder: SearchFolder, needle: string): number | null {
  const nameTier = textTier(folder.name, needle);
  if (nameTier !== null) return nameTier;
  // Le chemin seul (un dossier parent porte le mot) passe après les noms.
  return textTier(folder.path, needle) === null ? null : 3;
}

function rankFolders(
  folders: readonly SearchFolder[],
  needle: string,
  scope: string | null,
): SearchFolder[] {
  const inScope = folders.filter(
    (folder) => scope === null || isStrictlyInside(folder.path, scope),
  );

  if (!needle) {
    // Sans texte : dans un dossier, ses sous-dossiers directs par nom ;
    // ailleurs, les dossiers les plus fournis.
    const candidates =
      scope === null
        ? [...inScope].sort(
            (a, b) =>
              b.noteCount - a.noteCount || a.path.localeCompare(b.path, "fr"),
          )
        : inScope
            .filter(
              (folder) => !folder.path.slice(scope.length + 1).includes("/"),
            )
            .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return candidates.slice(0, SEARCH_FOLDER_LIMIT);
  }

  return inScope
    .flatMap((folder) => {
      const tier = folderTier(folder, needle);
      return tier === null ? [] : [{ folder, tier }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.folder.noteCount - a.folder.noteCount ||
        a.folder.path.localeCompare(b.folder.path, "fr"),
    )
    .slice(0, SEARCH_FOLDER_LIMIT)
    .map(({ folder }) => folder);
}

function compareNewestFirst(a: SearchNote, b: SearchNote): number {
  const left = Date.parse(a.createdAt);
  const right = Date.parse(b.createdAt);
  if (Number.isNaN(left) || Number.isNaN(right)) return 0;
  return right - left;
}

// Les notes dont le titre correspond sont connues tout de suite (mémoire) ;
// celles trouvées seulement dans le contenu arrivent avec l'index plein texte
// et se rangent après. Les premières restent triées par date, pas par score :
// l'arrivée de l'index n'en change pas l'ordre (pas de clignotement).
function rankNotes(
  notes: readonly SearchNote[],
  needle: string,
  hits: readonly FullTextHit[],
  scope: string | null,
): NoteResult[] {
  const inScope =
    scope === null
      ? notes
      : notes.filter((note) => folderPathMatchesFilter(note.folderPath, scope));

  if (!needle) {
    return [...inScope]
      .sort(compareNewestFirst)
      .map((note) => ({ ...note, match: "all", snippet: null }));
  }

  const byId = new Map(inScope.map((note) => [note.id, note]));
  const titleMatches = inScope
    .flatMap((note) => {
      const tier = textTier(note.title, needle);
      return tier === null ? [] : [{ note, tier }];
    })
    .sort((a, b) => a.tier - b.tier || compareNewestFirst(a.note, b.note))
    .map(({ note }): NoteResult => ({
      ...note,
      match: "title",
      snippet: null,
    }));

  const seen = new Set(titleMatches.map((note) => note.id));
  const contentMatches = hits
    .filter((hit) => hit.type === "session")
    .slice()
    .sort((a, b) => b.score - a.score)
    .flatMap((hit): NoteResult[] => {
      const note = byId.get(hit.id);
      if (!note || seen.has(note.id)) return [];
      seen.add(note.id);
      return [{ ...note, match: "content", snippet: hit.snippet }];
    });

  return [...titleMatches, ...contentMatches];
}

function rankContacts(
  contacts: readonly SearchContact[],
  needle: string,
  hits: readonly FullTextHit[],
): SearchContact[] {
  if (!needle) {
    return contacts.slice(0, SEARCH_CONTACT_LIMIT);
  }

  const nameMatches = contacts
    .flatMap((contact) => {
      const tier = textTier(contact.name, needle);
      return tier === null ? [] : [{ contact, tier }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier || a.contact.name.localeCompare(b.contact.name, "fr"),
    )
    .map(({ contact }) => contact);

  const byKey = new Map(
    contacts.map((contact) => [`${contact.type}:${contact.id}`, contact]),
  );
  const seen = new Set(nameMatches.map((c) => `${c.type}:${c.id}`));
  const indexed = hits
    .filter((hit) => hit.type !== "session")
    .slice()
    .sort((a, b) => b.score - a.score)
    .flatMap((hit) => {
      const key = `${hit.type}:${hit.id}`;
      const contact = byKey.get(key);
      if (!contact || seen.has(key)) return [];
      seen.add(key);
      return [contact];
    });

  return [...nameMatches, ...indexed].slice(0, SEARCH_CONTACT_LIMIT);
}

/**
 * Classe les résultats d'une recherche : dossiers d'abord (nom puis chemin),
 * notes (titre puis contenu), contacts et organisations. Les résultats de
 * l'index sont croisés avec le catalogue : une note supprimée ou inconnue
 * n'apparaît pas, et chaque note porte son dossier. Avec un dossier en filtre,
 * seuls ses notes et sous-dossiers comptent, sans contacts.
 */
export function rankUnifiedResults(
  catalog: SearchCatalog,
  query: string,
  hits: readonly FullTextHit[],
  options: UnifiedSearchOptions = {},
): UnifiedSearchResults {
  const needle = normalizeSearchQuery(query);
  const scope = options.folder ?? null;
  return {
    folders: rankFolders(catalog.folders, needle, scope),
    notes: rankNotes(catalog.notes, needle, hits, scope),
    contacts:
      scope === null ? rankContacts(catalog.contacts, needle, hits) : [],
  };
}

/** Nombre de notes par dossier, sous-dossiers compris. */
export function countNotesByFolder(
  notes: readonly SearchNote[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    if (!note.folderPath) continue;
    const segments = note.folderPath.split("/");
    let path = "";
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment;
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
}

export function buildSearchFolders(
  paths: readonly string[],
  notes: readonly SearchNote[],
): SearchFolder[] {
  const counts = countNotesByFolder(notes);
  return paths.map((path) => ({
    path,
    name: folderDisplayName(path) || path,
    noteCount: counts.get(path) ?? 0,
  }));
}
