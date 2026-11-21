import { updateSettingValue } from "~/settings/queries";
import { normalizeKeywordList, parseDictionaryTermsJson } from "~/stt/keywords";

const DICTIONARY_KEY = "personalization_dictionary_terms";

function dictionaryKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Ajoute les termes absents ; renvoie ceux qui ont été ajoutés. */
export async function saveDictionaryTerms(terms: string[]): Promise<string[]> {
  if (terms.length === 0) return [];
  let addedTerms: string[] = [];
  await updateSettingValue(DICTIONARY_KEY, (storedValue) => {
    const currentTerms = parseDictionaryTermsJson(storedValue);
    const currentKeys = new Set(currentTerms.map(dictionaryKey));
    addedTerms = normalizeKeywordList(terms).filter(
      (term) => !currentKeys.has(dictionaryKey(term)),
    );
    return JSON.stringify(
      normalizeKeywordList([...currentTerms, ...addedTerms]),
    );
  });
  return addedTerms;
}

/** Retire ces termes du dictionnaire (annulation depuis la carte du chat). */
export async function removeDictionaryTerms(terms: string[]): Promise<void> {
  if (terms.length === 0) return;
  const removed = new Set(terms.map(dictionaryKey));
  await updateSettingValue(DICTIONARY_KEY, (storedValue) =>
    JSON.stringify(
      parseDictionaryTermsJson(storedValue).filter(
        (term) => !removed.has(dictionaryKey(term)),
      ),
    ),
  );
}
