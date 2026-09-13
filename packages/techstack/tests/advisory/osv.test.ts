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

    const result = await queryOsvBatch(purls);

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
});
