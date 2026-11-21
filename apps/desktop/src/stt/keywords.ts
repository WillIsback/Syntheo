export function normalizeKeywordList(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const word of words) {
    const normalized = word.trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase();
    if (normalized.length < 2 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function parseDictionaryTermsText(value: string): string[] {
  return normalizeKeywordList(
    value
      .split(/[\n,]/)
      .map((term) => term.trim())
      .filter(Boolean),
  );
}

export function parseDictionaryTermsJson(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeKeywordList(
      value.filter((term): term is string => typeof term === "string"),
    );
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? normalizeKeywordList(
          parsed.filter((term): term is string => typeof term === "string"),
        )
      : [];
  } catch {
    return [];
  }
}

// Termes du dictionnaire ajoutés par le chat (issue 643) : un terme est un nom
// propre ou un sigle, jamais une phrase. Il entre dans les prompts de synthèse
// et part vers le serveur de transcription.
export const MAX_DICTIONARY_TERM_LENGTH = 40;
export const MAX_DICTIONARY_TERMS_PER_CALL = 10;

// Caractères qui construisent un lien, une image, du code ou du HTML en
// Markdown (« C# » ou « Yahoo! » restent permis) ; adresse web. Les retours à
// la ligne et caractères de contrôle sont refusés à part.
const UNSAFE_TERM = /[`[\]()<>{}|\\]|:\/\/|www\.|^[a-z][a-z0-9+.-]*:/i;

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
}

export function isSafeDictionaryTerm(term: string): boolean {
  const normalized = term.trim().replace(/ +/g, " ");
  return (
    normalized.length >= 2 &&
    normalized.length <= MAX_DICTIONARY_TERM_LENGTH &&
    !hasControlCharacter(normalized) &&
    !UNSAFE_TERM.test(normalized)
  );
}

/** Termes acceptés (normalisés, dédoublonnés) et termes refusés. */
export function partitionDictionaryTerms(terms: string[]): {
  accepted: string[];
  rejected: string[];
} {
  const rejected = terms.filter((term) => !isSafeDictionaryTerm(term));
  const accepted = normalizeKeywordList(terms.filter(isSafeDictionaryTerm));
  return { accepted, rejected };
}
