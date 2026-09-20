import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearSearchCache, searchTool } from '../src/search.js';

/**
 * Direct regression tests for the search tool's cache lifecycle and the
 * num_results clamping contract:
 * - TTL expiry boundary (299_999ms still fresh, 300_001ms expired)
 * - cache hits re-slice the stored ranked list to the caller's num_results
 * - num_results clamping (MAX_RESULTS=50 floor at 1) and the positive-integer
 *   validation that guards the clamp's input
 *
 * DNS is mocked so guardedFetch's per-hop assertNotPrivate never performs a
 * real lookup for the engine hostnames.
 */

const dnsMock = vi.hoisted(() => ({ lookups: [] as string[] }));
vi.mock('node:dns/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:dns/promises')>()),
  lookup: vi.fn(async (host: string) => {
    dnsMock.lookups.push(host);
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

const makeOpts = () => ({ signal: new AbortController().signal });

/** 60 distinct DuckDuckGo-lite rows so clamping can be asserted exactly. */
function ddgFixture(count: number): string {
  const rows: string[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(`<tr>
  <td><a rel="nofollow" href="https://example.com/r${i}" class='result-link'>Result ${i}</a></td>
</tr>
<tr>
  <td>&nbsp;&nbsp;&nbsp;</td>
  <td class='result-snippet'>Snippet for result ${i}</td>
</tr>`);
  }
  return `<html><body>${rows.join('\n')}</body></html>`;
}

describe('search cache TTL and num_results clamping', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: number;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    __clearSearchCache();
    fetchCalls = 0;
    dnsMock.lookups.length = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCalls++;
      return new Response(ddgFixture(60), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as never as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('num_results clamping', () => {
    it('caps num_results at MAX_RESULTS (50) with a 60-result page', async () => {
      const out = await searchTool.execute(
        { query: 'clamp-high', num_results: 999 },
        {} as never,
        makeOpts(),
      );
      expect(out.results).toHaveLength(50);
    });

    it('honors an in-range num_results exactly', async () => {
      const out = await searchTool.execute(
        { query: 'clamp-exact', num_results: 5 },
        {} as never,
        makeOpts(),
      );
      expect(out.results).toHaveLength(5);
    });

    it('rejects num_results that is not a positive integer', async () => {
      await expect(
        searchTool.execute({ query: 'clamp-zero', num_results: 0 }, {} as never, makeOpts()),
      ).rejects.toThrow(/positive integer/);
    });

    it('re-slices a cache hit to the current call num_results', async () => {
      // The cache stores the full ranked list, so a later call with a larger
      // num_results must still see everything the engine returned.
      const small = await searchTool.execute(
        { query: 'cache-reslice', num_results: 5 },
        {} as never,
        makeOpts(),
      );
      expect(small.results).toHaveLength(5);
      expect(small.cached).toBe(false);

      const large = await searchTool.execute(
        { query: 'cache-reslice', num_results: 50 },
        {} as never,
        makeOpts(),
      );
      expect(large.cached).toBe(true);
      expect(large.results).toHaveLength(50);
      expect(fetchCalls).toBe(1);
    });
  });

  describe('cache TTL', () => {
    it('expires entries after the 5-minute TTL', async () => {
      vi.useFakeTimers();
      try {
        const first = await searchTool.execute({ query: 'ttl-boundary' }, {} as never, makeOpts());
        expect(first.cached).toBe(false);
        expect(fetchCalls).toBe(1);

        // 299_999ms after the write: still inside the TTL window.
        vi.setSystemTime(Date.now() + 299_999);
        const second = await searchTool.execute({ query: 'ttl-boundary' }, {} as never, makeOpts());
        expect(second.cached).toBe(true);
        expect(fetchCalls).toBe(1);

        // 300_001ms after the write: expired — a fresh fetch must happen.
        vi.setSystemTime(Date.now() + 2);
        const third = await searchTool.execute({ query: 'ttl-boundary' }, {} as never, makeOpts());
        expect(third.cached).toBe(false);
        expect(fetchCalls).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('treats an entry aged exactly CACHE_TTL_MS as expired', async () => {
      vi.useFakeTimers();
      try {
        await searchTool.execute({ query: 'ttl-exact' }, {} as never, makeOpts());
        vi.setSystemTime(Date.now() + 300_000);
        const out = await searchTool.execute({ query: 'ttl-exact' }, {} as never, makeOpts());
        expect(out.cached).toBe(false);
        expect(fetchCalls).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
