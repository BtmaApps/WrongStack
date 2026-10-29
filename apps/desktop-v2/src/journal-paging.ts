import { entries } from './engine-values';

type Row = Record<string, unknown>;
/** Per category, the inclusive `until` of its next older page; absent once exhausted. */
export type JournalCursors = Record<string, string>;

/**
 * Merge one page per category. Each category keeps its own cursor so a sparse category cannot
 * push a dense one past entries it has not returned yet. The bound is inclusive, so entries are
 * de-duplicated by id; a category whose page adds nothing new (for example a host that ignores
 * the bound) is treated as exhausted instead of being requested again.
 */
export function mergeJournalPages(
  pages: readonly { kind: string; result: Record<string, unknown> }[],
  known: ReadonlySet<string>,
  pageSize: number,
): { added: Row[]; cursors: JournalCursors } {
  const seen = new Set(known);
  const added: Row[] = [];
  const cursors: JournalCursors = {};
  for (const { kind, result } of pages) {
    const rows = entries(result['entries']).filter((row) => row['category'] === kind);
    const fresh = rows.filter((row) => !seen.has(String(row['id'])));
    for (const row of fresh) seen.add(String(row['id']));
    added.push(...fresh);
    const oldest = rows
      .map((row) => String(row['timestamp']))
      .sort()
      .at(0);
    if (rows.length >= pageSize && fresh.length && oldest) cursors[kind] = oldest;
  }
  added.sort((a, b) => String(b['timestamp']).localeCompare(String(a['timestamp'])));
  return { added, cursors };
}
