/**
 * TechStack — OSV advisory client tests.
 *
 * Covers batch request construction, chunking, result parsing and severity
 * mapping. The HTTP layer is mocked — unit tests never reach api.osv.dev.
 *
 * @see packages/techstack/src/advisory/osv.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestWithRetry = vi.fn();

vi.mock('../../src/registry/http-fetch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/registry/http-fetch.js')>()),
  requestWithRetry: (...args: unknown[]) => requestWithRetry(...args),
}));

const { queryOsvBatch, queryOsvSingle } = await import('../../src/advisory/osv.js');

const ok = (results: unknown[]) => ({
  statusCode: 200,
  headers: {},
  body: JSON.stringify({ results }),
});

function sentQueries(call: number): string[] {
  const opts = requestWithRetry.mock.calls[call]?.[0] as { body: string };
  return (JSON.parse(opts.body) as { queries: Array<{ package: { purl: string } }> }).queries.map(
    (q) => q.package.purl,
  );
}

beforeEach(() => {
  requestWithRetry.mockReset();
});

describe('queryOsvBatch', () => {
  it('POSTs the PURLs to the querybatch endpoint', async () => {
    requestWithRetry.mockResolvedValue(ok([{}, {}]));
    const purls = ['pkg:npm/a@1.0.0', 'pkg:npm/b@2.0.0'];
    await queryOsvBatch(purls);

    expect(requestWithRetry).toHaveBeenCalledTimes(1);
    const opts = requestWithRetry.mock.calls[0]?.[0] as {
      hostname: string;
      path: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(opts).toMatchObject({ hostname: 'api.osv.dev', path: '/v1/querybatch', method: 'POST' });
    expect(opts.headers['Content-Length']).toBe(String(Buffer.byteLength(opts.body)));
    expect(sentQueries(0)).toEqual(purls);
  });

  it('chunks more than 500 PURLs into separate batches and maps results back by index', async () => {
    const purls = Array.from({ length: 501 }, (_, i) => `pkg:npm/p${i}@1.0.0`);
    requestWithRetry
      .mockResolvedValueOnce(ok(Array.from({ length: 500 }, () => ({}))))
      .mockResolvedValueOnce(ok([{ vulns: [{ id: 'OSV-LAST', summary: 'last one' }] }]));

    // Hydration is disabled: this test focuses on chunking, not the GET budget.
    const result = await queryOsvBatch(purls, { maxSeverityLookups: 0 });

    expect(requestWithRetry).toHaveBeenCalledTimes(2);
    expect(sentQueries(0)).toHaveLength(500);
    expect(sentQueries(1)).toEqual(['pkg:npm/p500@1.0.0']);
    expect(result.advisories.size).toBe(501);
    expect(result.advisories.get('pkg:npm/p0@1.0.0')).toEqual([]);
    expect(result.advisories.get('pkg:npm/p500@1.0.0')?.[0]?.id).toBe('OSV-LAST');
    expect(result.evidence).toMatchObject({
      kind: 'osv',
      detail: 'Queried 501 packages in 2 batch(es)',
    });
  });

  it('parses advisories and maps CVSS / database severities', async () => {
    requestWithRetry.mockResolvedValue(
      ok([
        {
          vulns: [
            {
              id: 'A',
              summary: 's',
              aliases: ['CVE-1'],
              severity: [{ type: 'CVSS_V3', score: '9.8' }],
            },
            { id: 'B', details: 'only details', database_specific: { severity: 'MODERATE' } },
            { id: 'C', affected: [{ database_specific: { severity: 'low' } }] },
            { id: 'D' },
          ],
        },
      ]),
    );

    const advisories = await queryOsvSingle('pkg:npm/x@1.0.0');

    expect(advisories).toEqual([
      { id: 'A', summary: 's', severity: 'critical', aliases: ['CVE-1'] },
      { id: 'B', summary: 'only details', severity: 'medium', aliases: [] },
      { id: 'C', summary: 'No summary available', severity: 'low', aliases: [] },
      { id: 'D', summary: 'No summary available', severity: 'info', aliases: [] },
    ]);
  });

  it('throws on a non-200 response', async () => {
    requestWithRetry.mockResolvedValue({ statusCode: 503, headers: {}, body: 'down' });
    await expect(queryOsvSingle('pkg:npm/x@1.0.0')).rejects.toThrow('OSV API returned 503: down');
  });

  it('throws on a malformed JSON body', async () => {
    requestWithRetry.mockResolvedValue({ statusCode: 200, headers: {}, body: '<html>' });
    await expect(queryOsvSingle('pkg:npm/x@1.0.0')).rejects.toThrow('Invalid JSON response');
  });

  it('makes no request for an empty PURL list', async () => {
    const result = await queryOsvBatch([]);
    expect(requestWithRetry).not.toHaveBeenCalled();
    expect(result.advisories.size).toBe(0);
  });

  // Regression (round r26): /v1/querybatch returns ID+modified stubs without
  // any severity signal, so every id is hydrated via GET /v1/vulns/{id} and
  // the full records feed real severities/summaries into the advisories.
  it('hydrates querybatch stubs via GET /v1/vulns/{id} and feeds real severities', async () => {
    requestWithRetry.mockImplementation(async (opts: { method?: string; path?: string }) => {
      if (opts.method === 'POST' && opts.path === '/v1/querybatch') {
        return ok([
          {
            vulns: [
              { id: 'HYDRA-VEC', modified: 'm' },
              { id: 'HYDRA-DB', modified: 'm' },
              { id: 'HYDRA-MISSING', modified: 'm' },
            ],
          },
        ]);
      }
      if (opts.method === 'GET' && opts.path === '/v1/vulns/HYDRA-VEC') {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({
            id: 'HYDRA-VEC',
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
          }),
        };
      }
      if (opts.method === 'GET' && opts.path === '/v1/vulns/HYDRA-DB') {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({
            id: 'HYDRA-DB',
            summary: 'db-backed summary',
            database_specific: { severity: 'HIGH' },
          }),
        };
      }
      return { statusCode: 404, headers: {}, body: 'not found' };
    });

    const result = await queryOsvBatch(['pkg:npm/hydra@1.0.0']);
    const advisories = result.advisories.get('pkg:npm/hydra@1.0.0') ?? [];
    const byId = new Map(advisories.map((a) => [a.id, a]));
    expect(byId.get('HYDRA-VEC')?.severity, 'CVSS vector base 9.8 -> critical').toBe('critical');
    expect(byId.get('HYDRA-DB')?.severity, 'database_specific HIGH -> high').toBe('high');
    expect(byId.get('HYDRA-DB')?.summary).toBe('db-backed summary');
    expect(byId.get('HYDRA-MISSING')?.severity, '404 degrades to the stub mapping').toBe('info');
    const getPaths = requestWithRetry.mock.calls
      .map(([opts]) => opts as { method?: string; path?: string })
      .filter((opts) => opts.method === 'GET')
      .map((opts) => opts.path);
    expect(getPaths).toEqual([
      '/v1/vulns/HYDRA-VEC',
      '/v1/vulns/HYDRA-DB',
      '/v1/vulns/HYDRA-MISSING',
    ]);
  });

  it('caches hydrations across calls (no repeated GETs for the same id)', async () => {
    requestWithRetry.mockImplementation(async (opts: { method?: string; path?: string }) => {
      if (opts.method === 'POST' && opts.path === '/v1/querybatch') {
        return ok([{ vulns: [{ id: 'HYDRA-CACHE', modified: 'm' }] }]);
      }
      if (opts.method === 'GET' && opts.path === '/v1/vulns/HYDRA-CACHE') {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({
            id: 'HYDRA-CACHE',
            severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N' }],
          }),
        };
      }
      throw new Error(`unexpected HTTP call ${opts.method} ${opts.path}`);
    });

    const countGets = () =>
      requestWithRetry.mock.calls.filter(([opts]) => (opts as { method?: string }).method === 'GET')
        .length;

    await queryOsvBatch(['pkg:npm/cache@1.0.0']);
    expect(countGets()).toBe(1);
    await queryOsvBatch(['pkg:npm/cache@1.0.0']);
    expect(countGets()).toBe(1);
    const advisories = (await queryOsvBatch(['pkg:npm/cache@1.0.0'])).advisories.get(
      'pkg:npm/cache@1.0.0',
    );
    expect(advisories?.[0]?.severity, '7.5 vector served from cache').toBe('high');
  });

  it('respects maxSeverityLookups: 0 (hydration disabled)', async () => {
    requestWithRetry.mockImplementation(async (opts: { method?: string; path?: string }) => {
      if (opts.method === 'POST' && opts.path === '/v1/querybatch') {
        return ok([{ vulns: [{ id: 'HYDRA-OFF', modified: 'm' }] }]);
      }
      throw new Error(`unexpected HTTP call ${opts.method} ${opts.path}`);
    });

    const result = await queryOsvBatch(['pkg:npm/nohydra@1.0.0'], { maxSeverityLookups: 0 });
    const getPaths = requestWithRetry.mock.calls
      .map(([opts]) => opts as { method?: string; path?: string })
      .filter((opts) => opts.method === 'GET')
      .map((opts) => opts.path);
    expect(getPaths).toEqual([]);
    const advisories = result.advisories.get('pkg:npm/nohydra@1.0.0') ?? [];
    expect(advisories[0]?.severity).toBe('info');
  });
});
