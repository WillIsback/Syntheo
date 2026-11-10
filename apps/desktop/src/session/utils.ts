// Same timestamp as the Tantivy session document (search_index.rs): the note's
// creation date, in epoch milliseconds.
export function sessionSearchTimestamp(createdAt: string): number {
  if (!createdAt.trim()) {
    return 0;
  }

  const parsed = Date.parse(createdAt);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const numeric = Number(createdAt);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}
