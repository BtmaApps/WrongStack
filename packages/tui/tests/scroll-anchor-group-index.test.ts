import { describe, expect, it } from 'vitest';
import { EntryHeightCache } from '../src/height-cache.js';
import { anchorForGroupIndex, type ScrollGeometry } from '../src/scroll-anchor.js';

function geometry(heights: number[], viewportRows: number): ScrollGeometry {
  const cache = new EntryHeightCache();
  const ids = heights.map((_, i) => i + 1);
  cache.sync(ids);
  cache.recordMany(ids.map((id, i) => [id, heights[i] ?? 1] as const));
  return { cache, groupCount: ids.length, viewportRows, tailRows: 0 };
}

describe('anchorForGroupIndex', () => {
  it('puts the group start at the viewport top', () => {
    const geo = geometry([5, 5, 5, 5, 5, 5], 10);
    expect(anchorForGroupIndex(geo, 2)).toEqual({ index: 2, clip: 0 });
    expect(anchorForGroupIndex(geo, 0)).toEqual({ index: 0, clip: 0 });
  });

  it('re-pins groups too close to the bottom to reach the top', () => {
    const geo = geometry([5, 5, 5, 5, 5, 5], 10);
    expect(anchorForGroupIndex(geo, 5)).toBeNull();
  });

  it('rejects out-of-range indexes', () => {
    const geo = geometry([5, 5], 4);
    expect(anchorForGroupIndex(geo, -1)).toBeUndefined();
    expect(anchorForGroupIndex(geo, 2)).toBeUndefined();
  });
});
