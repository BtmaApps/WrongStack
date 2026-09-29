import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSageService = vi.hoisted(() => vi.fn());
vi.mock('@wrongstack/sage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wrongstack/sage')>()),
  getSageService,
}));

import { InvalidSearchCursorError } from '@wrongstack/sage';
import { handleMemorySearchPage } from '../src/server/http-server/memory-search-page.js';

function response() {
  const res = { writeHead: vi.fn(), end: vi.fn() };
  return {
    res: res as unknown as Parameters<typeof handleMemorySearchPage>[0],
    status: () => res.writeHead.mock.calls[0]?.[0] as number,
    body: () => JSON.parse(String(res.end.mock.calls[0]?.[0])) as Record<string, unknown>,
  };
}

beforeEach(() => getSageService.mockReset());

describe('ranked SAGE HTTP search pages', () => {
  it('forces the WebUI non-session visibility policy on every request', async () => {
    const search = vi.fn(async () => ({
      hits: [{ id: 'project-1', text: 'cursor result' }],
      totalCandidates: 2,
      nextCursor: 'opaque-cursor',
      rankingApplied: 'hybrid',
      matchChannel: 'fts',
    }));
    getSageService.mockReturnValue({ unifiedSearchService: search });
    const out = response();
    await handleMemorySearchPage(
      out.res,
      new URL('http://x/api/memory/search-page?q=cursor&kind=fact&scope=project&limit=1'),
      () => ({}) as never,
    );
    expect(out.status()).toBe(200);
    expect(search).toHaveBeenCalledWith(
      { text: 'cursor', kinds: ['fact'], scopes: ['project'] },
      {
        limit: 1,
        ranking: 'hybrid',
        includeStatuses: ['active', 'stale'],
        excludeSessionScoped: true,
        suggest: 'never',
      },
    );
    expect(out.body()).toMatchObject({
      count: 1,
      totalCandidates: 2,
      nextCursor: 'opaque-cursor',
      matchChannel: 'fts',
    });
  });

  it.each([
    '?q=x&scope=session',
    '?q=x&status=deleted',
    '?q=x&audience=reviewer',
    '?q=x&tag=private',
    '?q=x&sessionId=other',
    '?q=x&cursor=',
  ])('rejects unsupported or unsafe filters before accessing the store: %s', async (search) => {
    const out = response();
    const getStore = vi.fn();
    await handleMemorySearchPage(
      out.res,
      new URL(`http://x/api/memory/search-page${search}`),
      getStore,
    );
    expect(out.status()).toBe(400);
    expect(getStore).not.toHaveBeenCalled();
  });

  it('reports malformed or mismatched backend cursors as 400, not an empty first page', async () => {
    getSageService.mockReturnValue({
      unifiedSearchService: vi.fn(async () => {
        throw new InvalidSearchCursorError('mismatch');
      }),
    });
    const out = response();
    await handleMemorySearchPage(
      out.res,
      new URL('http://x/api/memory/search-page?q=x&cursor=bogus'),
      () => ({}) as never,
    );
    expect(out.status()).toBe(400);
    expect(out.body()).toMatchObject({ code: 'INVALID_SEARCH_CURSOR' });
  });

  it('returns 503 when the SAGE service is unavailable', async () => {
    getSageService.mockReturnValue(undefined);
    const out = response();
    await handleMemorySearchPage(
      out.res,
      new URL('http://x/api/memory/search-page?q=x'),
      () => ({}) as never,
    );
    expect(out.status()).toBe(503);
  });
});
