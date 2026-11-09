import { createContext, useCallback, useContext } from "react";

import { commands as tantivy } from "@syntheo/plugin-tantivy";

import { buildTantivyFilters } from "./filters";
import type {
  SearchEntityType,
  SearchFilters,
  SearchHit,
  SearchOptions,
} from "./types";
import { normalizeQuery } from "./utils";

export type { SearchFilters, SearchHit, SearchOptions } from "./types";

export type SearchFunction = (
  query: string,
  filters?: SearchFilters | null,
  options?: SearchOptions,
) => Promise<SearchHit[]>;

const SearchEngineContext = createContext<{
  search: SearchFunction;
} | null>(null);

export function SearchEngineProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const search = useCallback(
    async (
      query: string,
      filters: SearchFilters | null = null,
      options: SearchOptions = {},
    ): Promise<SearchHit[]> => {
      const normalizedQuery = normalizeQuery(query);
      const tantivyFilters = buildTantivyFilters(filters);

      try {
        const result = await tantivy.search({
          query: normalizedQuery,
          filters: tantivyFilters,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
          ...(options.snippets
            ? {
                options: {
                  fuzzy: null,
                  distance: null,
                  snippets: true,
                  snippet_max_chars: options.snippetMaxChars ?? null,
                  phrase_slop: null,
                },
              }
            : {}),
        });

        if (result.status === "error") {
          console.error("Search failed:", result.error);
          return [];
        }

        const hits = result.data.hits.map((hit) => ({
          score: hit.score,
          document: {
            id: hit.document.id,
            type: hit.document.doc_type as SearchEntityType,
            title: hit.document.title,
            content: hit.document.content,
            created_at: hit.document.created_at,
          },
          contentSnippet: hit.content_snippet?.fragment || null,
        }));
        return hits;
      } catch (error) {
        console.error("Search failed:", error);
        return [];
      }
    },
    [],
  );

  const value = {
    search,
  };

  return (
    <SearchEngineContext.Provider value={value}>
      {children}
    </SearchEngineContext.Provider>
  );
}

export function useSearchEngine() {
  const context = useContext(SearchEngineContext);
  if (!context) {
    throw new Error("useSearchEngine must be used within SearchEngineProvider");
  }
  return context;
}
