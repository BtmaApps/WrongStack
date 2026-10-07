import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/_concurrency.js';

describe('mapWithConcurrency', () => {
  it('returns empty array for empty input', async () => {
    const result = await mapWithConcurrency([], 3, async (x: number) => x * 2);
    expect(result).toEqual([]);
  });

  it('maps all items with default concurrency', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 3, async (x: number) => x * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('preserves order of results', async () => {
    const items = [10, 20, 30, 40, 50];
    const result = await mapWithConcurrency(items, 2, async (x: number) => {
      // Delay proportional to value to ensure ordering is order of input,
      // not order of completion
      await new Promise((r) => setTimeout(r, 5));
      return x / 10;
    });
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles limit=1 (serial execution)', async () => {
    let running = 0;
    let maxRunning = 0;
    const result = await mapWithConcurrency([1, 2, 3], 1, async (x: number) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return x;
    });
    expect(result).toEqual([1, 2, 3]);
    expect(maxRunning).toBe(1);
  });

  it('handles limit higher than items length', async () => {
    const result = await mapWithConcurrency(['a', 'b'], 10, async (x: string) => x.toUpperCase());
    expect(result).toEqual(['A', 'B']);
  });

  it('rejects on first error (fail-fast)', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5], 2, async (x: number) => {
        if (x === 3) throw new Error('boom');
        return x;
      }),
    ).rejects.toThrow('boom');
  });

  // A non-finite limit must never defeat the worker count: `Array.from({length: NaN})`
  // yields ZERO workers, `Promise.all([])` resolves, and the mapper is never
  // called — the caller silently gets an array of holes. `parsedLimit` above
  // substitutes `items.length` for a non-finite limit, so every item is still
  // mapped. This pins that guard against removal.
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -3],
  ])('still maps every item for a non-finite or sub-1 limit (%s)', async (_label, limit) => {
    const seen: number[] = [];
    const result = await mapWithConcurrency([1, 2, 3], limit, async (x: number) => {
      seen.push(x);
      return x * 2;
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(result).toEqual([2, 4, 6]);
    expect(result.every((v) => v !== undefined)).toBe(true);
  });

  it('starts no new item once one has failed', async () => {
    // A `replace` worker rewrites a file per item: items started after the
    // caller was rejected would modify files nobody reports.
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const started: number[] = [];
    const run = mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (i) => {
      started.push(i);
      if (i === 0) throw new Error('EBUSY');
      if (i === 1) await held;
      return i;
    });
    await expect(run).rejects.toThrow('EBUSY');
    release();
    for (let k = 0; k < 50; k++) await Promise.resolve();
    expect(started).toEqual([0, 1]);
  });
});
