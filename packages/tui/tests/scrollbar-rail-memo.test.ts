import { describe, expect, it } from 'vitest';
import type { CopyHit } from '../src/components/history/copy-geometry.js';
import { scrollbarPropsEqual } from '../src/components/history/scrollbar-rail.js';

const hit = (over: Partial<CopyHit> = {}): CopyHit => ({
  entryId: 1,
  startRow: 2,
  endRow: 5,
  iconCol: 80,
  ...over,
});

const base = { rows: 10, offset: 0, total: 40, copyHits: [hit()], copiedEntryId: null };

describe('scrollbarPropsEqual', () => {
  it('treats a rebuilt but identical hit array as equal', () => {
    expect(scrollbarPropsEqual(base, { ...base, copyHits: [hit()] })).toBe(true);
  });

  it('ignores hit fields the rail does not draw', () => {
    expect(scrollbarPropsEqual(base, { ...base, copyHits: [hit({ endRow: 9, iconCol: 3 })] })).toBe(
      true,
    );
  });

  it('repaints when a drawn field changes', () => {
    expect(scrollbarPropsEqual(base, { ...base, copyHits: [hit({ startRow: 3 })] })).toBe(false);
    expect(scrollbarPropsEqual(base, { ...base, copyHits: [hit({ entryId: 2 })] })).toBe(false);
    expect(scrollbarPropsEqual(base, { ...base, copyHits: [hit({ inspectCol: 79 })] })).toBe(false);
    expect(scrollbarPropsEqual(base, { ...base, copyHits: [] })).toBe(false);
  });

  it('repaints on geometry or copied-state changes', () => {
    expect(scrollbarPropsEqual(base, { ...base, offset: 1 })).toBe(false);
    expect(scrollbarPropsEqual(base, { ...base, total: 41 })).toBe(false);
    expect(scrollbarPropsEqual(base, { ...base, rows: 11 })).toBe(false);
    expect(scrollbarPropsEqual(base, { ...base, copiedEntryId: 1 })).toBe(false);
  });
});
