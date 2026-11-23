import { useRef } from "react";

// Garde les dernières lignes reçues tant que la requête recharge, et rend
// `empty` quand elle est désactivée.
export function useHeldLiveQueryRows<T>(
  data: T[] | undefined,
  empty: T[],
  enabled: boolean,
): T[] {
  const previous = useRef(empty);
  if (data !== undefined) {
    previous.current = data;
  }
  if (!enabled) {
    previous.current = empty;
    return empty;
  }
  return data ?? previous.current;
}
