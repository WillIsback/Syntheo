import { useCallback, useEffect, useMemo, useState } from "react";

import { useSearchCatalog } from "./catalog";
import { rankUnifiedResults } from "./rank";
import type {
  FullTextHit,
  UnifiedSearchOptions,
  UnifiedSearchResults,
} from "./types";

import { type SearchFunction, useSearchEngine } from "~/search/contexts/engine";

// Assez large pour qu'un filtre par dossier (appliqué après l'index) garde
// des résultats ; les extraits montrent où le texte apparaît.
const FULL_TEXT_LIMIT = 200;
const SNIPPET_MAX_CHARS = 120;
const FULL_TEXT_DEBOUNCE_MS = 150;

const NO_HITS: FullTextHit[] = [];

async function fetchFullTextHits(
  search: SearchFunction,
  query: string,
): Promise<FullTextHit[]> {
  if (!query.trim()) return NO_HITS;
  const hits = await search(query, null, {
    limit: FULL_TEXT_LIMIT,
    snippets: true,
    snippetMaxChars: SNIPPET_MAX_CHARS,
  });
  return hits.map((hit) => ({
    id: hit.document.id,
    type: hit.document.type,
    score: hit.score,
    snippet: hit.contentSnippet?.trim() || null,
  }));
}

/**
 * Recherche pour les mentions `@` : attend l'index plein texte puis classe
 * comme la palette.
 */
export function useUnifiedSearcher(): (
  query: string,
  options?: UnifiedSearchOptions,
) => Promise<UnifiedSearchResults> {
  const catalog = useSearchCatalog();
  const { search } = useSearchEngine();
  return useCallback(
    async (query, options) =>
      rankUnifiedResults(
        catalog,
        query,
        await fetchFullTextHits(search, query),
        options,
      ),
    [catalog, search],
  );
}

/**
 * Recherche pour la palette `Ctrl+K` : les titres répondent tout de suite,
 * l'index plein texte (contenu) arrive après une courte pause de frappe.
 */
export function useUnifiedSearch(
  query: string,
  options: UnifiedSearchOptions = {},
): UnifiedSearchResults & { fullTextPending: boolean } {
  const catalog = useSearchCatalog();
  const { search } = useSearchEngine();
  const [fullText, setFullText] = useState<{
    query: string;
    hits: FullTextHit[];
  }>({ query: "", hits: NO_HITS });
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      fetchFullTextHits(search, trimmed)
        .then((hits) => {
          if (!cancelled) setFullText({ query: trimmed, hits });
        })
        .catch(() => {
          if (!cancelled) setFullText({ query: trimmed, hits: NO_HITS });
        });
    }, FULL_TEXT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, trimmed]);

  // Pendant la frappe (un mot qu'on allonge ou raccourcit), les résultats
  // précédents restent en attendant les suivants ; ceux d'une recherche sans
  // rapport ne s'affichent jamais.
  const related =
    trimmed !== "" &&
    fullText.query !== "" &&
    (trimmed.startsWith(fullText.query) || fullText.query.startsWith(trimmed));
  const hits = related ? fullText.hits : NO_HITS;
  const folder = options.folder ?? null;
  const results = useMemo(
    () => rankUnifiedResults(catalog, query, hits, { folder }),
    [catalog, query, hits, folder],
  );

  return {
    ...results,
    fullTextPending: trimmed !== "" && fullText.query !== trimmed,
  };
}
