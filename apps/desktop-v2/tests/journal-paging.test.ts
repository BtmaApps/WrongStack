import { describe, expect, it } from 'vitest';
import { mergeJournalPages } from '../src/journal-paging';

const row = (id: string, kind: string, timestamp: string) => ({ id, category: kind, timestamp });
const page = (kind: string, rows: ReturnType<typeof row>[]) => ({
  kind,
  result: { entries: rows },
});

describe('prompt journal paging', () => {
  it('keeps one cursor per category so a sparse category cannot skip a dense one', () => {
    const raw = [
      row('r1', 'raw_user', '2026-10-28T10:00Z'),
      row('r2', 'raw_user', '2026-10-29T10:00Z'),
    ];
    const refined = [
      row('f1', 'refined_user', '2025-01-01T00:00Z'),
      row('f2', 'refined_user', '2026-10-29T11:00Z'),
    ];
    const merged = mergeJournalPages(
      [page('raw_user', raw), page('refined_user', refined)],
      new Set(),
      2,
    );
    expect(merged.added.map((item) => item.id)).toEqual(['f2', 'r2', 'r1', 'f1']);
    // Each full category continues from its own oldest entry, not the overall oldest.
    expect(merged.cursors).toEqual({
      raw_user: '2026-10-28T10:00Z',
      refined_user: '2025-01-01T00:00Z',
    });
  });
  it('de-duplicates the inclusive bound and stops a category that returns nothing new', () => {
    const known = new Set(['r1', 'r2']);
    const older = mergeJournalPages(
      [
        page('raw_user', [
          row('r0', 'raw_user', '2026-10-28T10:00Z'),
          row('r1', 'raw_user', '2026-10-28T10:00Z'),
        ]),
      ],
      known,
      2,
    );
    expect(older.added.map((item) => item.id)).toEqual(['r0']);
    expect(older.cursors).toEqual({ raw_user: '2026-10-28T10:00Z' });
    // A host that ignores `until` repeats entries already held: no cursor, no loop.
    const repeated = mergeJournalPages(
      [
        page('raw_user', [
          row('r1', 'raw_user', '2026-10-28T10:00Z'),
          row('r2', 'raw_user', '2026-10-29T10:00Z'),
        ]),
      ],
      known,
      2,
    );
    expect(repeated).toEqual({ added: [], cursors: {} });
  });
  it('leaves no cursor for a page that is not full', () => {
    expect(
      mergeJournalPages(
        [page('raw_user', [row('a', 'raw_user', '2026-01-01T00:00Z')])],
        new Set(),
        2,
      ).cursors,
    ).toEqual({});
  });
});
