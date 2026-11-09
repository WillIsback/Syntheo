// Moteur de recherche commun à la palette `Ctrl+K` et aux mentions `@`
// (issue 501) : mêmes sources, même classement, des deux côtés.

export type SearchNote = {
  id: string;
  // Vide pour une note sans titre ; l'affichage choisit le libellé.
  title: string;
  createdAt: string;
  // Chemin du dossier de la note, vide si elle n'est pas rangée.
  folderPath: string;
};

export type SearchFolder = {
  path: string;
  name: string;
  // Notes du dossier, sous-dossiers compris.
  noteCount: number;
};

export type SearchContact = {
  id: string;
  type: "human" | "organization";
  name: string;
};

export type SearchCatalog = {
  // Du plus récent au plus ancien.
  notes: readonly SearchNote[];
  folders: readonly SearchFolder[];
  contacts: readonly SearchContact[];
};

// Résultat de l'index plein texte, ramené à ce dont le classement a besoin.
export type FullTextHit = {
  id: string;
  type: "session" | "human" | "organization";
  score: number;
  snippet: string | null;
};

// `title` : le titre contient le texte ; `content` : seul le contenu le
// contient (index plein texte) ; `all` : pas de texte, toutes les notes.
export type NoteMatchKind = "title" | "content" | "all";

export type NoteResult = SearchNote & {
  match: NoteMatchKind;
  snippet: string | null;
};

export type UnifiedSearchResults = {
  folders: SearchFolder[];
  notes: NoteResult[];
  contacts: SearchContact[];
};

export type UnifiedSearchOptions = {
  // Chemin du dossier qui limite la recherche (sous-dossiers compris).
  folder?: string | null;
};
