import * as dnsPromises from 'node:dns/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTool, guardedFetch } from '../src/fetch.js';
import { mkSandbox, newSignal } from './fixtures.js';

/**
 * Direct regression tests for the fetch tool's SSRF-guard chain that the
 * mocked-fetch suites could not reach:
 * - embedded-credential rejection (userinfo in the request URL)
 * - per-hop redirect re-validation through DNS (a hostname that RESOLVES to
 *   a private address — the literal-IP redirect cases in fetch.test.ts never
 *   exercise the resolver branch of assertNotPrivate)
 * - the 20s tool timeout abort (TOOL_TIMEOUT, previously untested)
 * - default-guard canaries for http-block and binary refusal so this file
 *   stays a self-contained statement of the guard contract
 *
 * DNS is mocked so no test in this file ever performs a real lookup, and
 * `WRONGSTACK_FETCH_ALLOW_PRIVATE` is deleted so the default (strict) guard
 * is the one under test.
 */

// The guard reads this once at module load; ensure the strict default.
delete process.env['WRONGSTACK_FETCH_ALLOW_PRIVATE'];

// Per-hostname resolver fixtures. Defaults to a public IPv4 so any hostname
// not explicitly mapped passes assertNotPrivate deterministically.
const dnsRecords = vi.hoisted(() => new Map<string, string[]>());
vi.mock('node:dns/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:dns/promises')>()),
  lookup: vi.fn(async (host: string) => {
    const addresses = dnsRecords.get(host) ?? ['93.184.216.34'];
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  }),
}));

function mkResponse(opts: {
  body: string;
  status?: number;
  url?: string;
  contentType?: string;
}): Response {
  const bytes = new TextEncoder().encode(opts.body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return {
    status: opts.status ?? 200,
    ok: (opts.status ?? 200) < 400,
    url: opts.url ?? 'https://example.com/',
    headers: new Headers({ 'content-type': opts.contentType ?? 'text/plain' }),
    body: stream,
  } as never as Response;
}

function redirectResponse(url: string, location: string): Response {
  return {
    status: 302,
    ok: false,
    url,
    headers: new Headers({ location }),
    body: null,
  } as never as Response;
}

/** A fetch that never settles until the request's signal aborts. */
function hangingFetch(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('This operation was aborted', 'AbortError'));
      });
    })) as never as typeof fetch;
}

const originalFetch = globalThis.fetch;

describe('fetch guard regressions', () => {
  beforeEach(() => {
    dnsRecords.clear();
    // `restoreMocks: true` in the root vitest config strips factory-defined
    // mock implementations after each test — re-establish the resolver.
    vi.mocked(dnsPromises.lookup).mockImplementation(async (host: string) => {
      const addresses = dnsRecords.get(host) ?? ['93.184.216.34'];
      return addresses.map((address) => ({
        address,
        family: address.includes(':') ? 6 : 4,
      })) as never;
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('embedded-credential rejection', () => {
    it('rejects user:password@ URLs before any request is made', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as never as typeof fetch;
      const sb = await mkSandbox();
      try {
        await expect(
          fetchTool.execute({ url: 'https://user:secret@93.184.216.34/path' }, sb.ctx, {
            signal: newSignal(),
          }),
        ).rejects.toThrow(/embedded credentials/);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        await sb.cleanup();
      }
    });

    it('rejects a username-only URL as well', async () => {
      const sb = await mkSandbox();
      try {
        await expect(
          fetchTool.execute({ url: 'https://user@93.184.216.34/' }, sb.ctx, {
            signal: newSignal(),
          }),
        ).rejects.toThrow(/embedded credentials/);
      } finally {
        await sb.cleanup();
      }
    });
  });

  describe('redirect re-validation through DNS', () => {
    it('blocks a redirect whose hostname resolves to a private address', async () => {
      dnsRecords.set('public.example', ['93.184.216.34']);
      dnsRecords.set('internal.example', ['10.0.0.1']);
      const calls: string[] = [];
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const u = typeof input === 'string' ? input : input.toString();
        calls.push(u);
        if (u.startsWith('https://public.example')) {
          return redirectResponse(u, 'https://internal.example/private-endpoint');
        }
        // Must never be reached: hop 1 must be refused before this fetch.
        return mkResponse({ body: 'should not load', url: u });
      }) as never as typeof fetch;

      const sb = await mkSandbox();
      try {
        await expect(
          fetchTool.execute({ url: 'https://public.example/redirect' }, sb.ctx, {
            signal: newSignal(),
          }),
        ).rejects.toThrow(/resolved to private address 10\.0\.0\.1/);
        // Only the hop-0 request was issued; the private target was never fetched.
        expect(calls).toEqual(['https://public.example/redirect']);
      } finally {
        await sb.cleanup();
      }
    });

    it('blocks a redirect hostname resolving to cloud metadata via DNS', async () => {
      dnsRecords.set('metadata.example', ['169.254.169.254']);
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const u = typeof input === 'string' ? input : input.toString();
        return redirectResponse(u, 'https://metadata.example/latest/meta-data/');
      }) as never as typeof fetch;

      const sb = await mkSandbox();
      try {
        await expect(
          fetchTool.execute({ url: 'https://public.example/meta-redirect' }, sb.ctx, {
            signal: newSignal(),
          }),
        ).rejects.toThrow(/resolved to private address 169\.254\.169\.254/);
      } finally {
        await sb.cleanup();
      }
    });

    it('allows a redirect to a hostname that resolves publicly', async () => {
      dnsRecords.set('cdn.example', ['93.184.216.35']);
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const u = typeof input === 'string' ? input : input.toString();
        if (u.startsWith('https://public.example')) {
          return redirectResponse(u, 'https://cdn.example/final');
        }
        return mkResponse({ body: 'final content', url: u });
      }) as never as typeof fetch;

      const sb = await mkSandbox();
      try {
        const out = await fetchTool.execute(
          { url: 'https://public.example/public-redirect' },
          sb.ctx,
          { signal: newSignal() },
        );
        expect(out.status).toBe(200);
        expect(out.content).toContain('final content');
      } finally {
        await sb.cleanup();
      }
    });
  });

  describe('per-hop embedded-credential rejection', () => {
    it('blocks a redirect whose Location header carries user:pass credentials', async () => {
      const calls: string[] = [];
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const u = typeof input === 'string' ? input : input.toString();
        calls.push(u);
        return redirectResponse(u, 'https://user:secret@creds.example/private');
      }) as never as typeof fetch;

      const sb = await mkSandbox();
      try {
        await expect(
          fetchTool.execute({ url: 'https://public.example/creds-redirect' }, sb.ctx, {
            signal: newSignal(),
          }),
        ).rejects.toThrow(/redirect to URLs with embedded credentials/);
        // The credentialed target was never fetched.
        expect(calls).toEqual(['https://public.example/creds-redirect']);
      } finally {
        await sb.cleanup();
      }
    });

    it('blocks a redirect Location with a username only', async () => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const u = typeof input === 'string' ? input : input.toString();
        return redirectResponse(u, 'https://user@creds.example/');
      }) as never as typeof fetch;

      const sb = await mkSandbox();
      try {
        await expect(
          fetchTool.execute({ url: 'https://public.example/user-redirect' }, sb.ctx, {
            signal: newSignal(),
          }),
        ).rejects.toThrow(/embedded credentials/);
      } finally {
        await sb.cleanup();
      }
    });

    it('guards direct guardedFetch callers at hop 0 too', async () => {
      // search / read_url_content call guardedFetch without the fetch tool's
      // own input-URL gate — the guard itself must refuse credentials.
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as never as typeof fetch;
      await expect(
        guardedFetch('https://user:pass@93.184.216.34/', 5, newSignal()),
      ).rejects.toThrow(/embedded credentials/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('timeout abort', () => {
    it('aborts a hanging request at 20s with a TOOL_TIMEOUT error', async () => {
      globalThis.fetch = hangingFetch();
      const sb = await mkSandbox();
      try {
        vi.useFakeTimers();
        const pending = fetchTool.execute({ url: 'https://93.184.216.34/hang' }, sb.ctx, {
          signal: newSignal(),
        });
        const expectation = expect(pending).rejects.toThrow(/timed out after 20000ms/);
        await vi.advanceTimersByTimeAsync(20_000);
        await expectation;

        await expect(pending).rejects.toMatchObject({ code: 'TOOL_TIMEOUT' });
      } finally {
        vi.useRealTimers();
        await sb.cleanup();
      }
    });

    it('does not fire the timeout for a request that completes in time', async () => {
      globalThis.fetch = vi.fn(async () =>
        mkResponse({ body: 'quick', contentType: 'text/plain' }),
      ) as never as typeof fetch;
      const sb = await mkSandbox();
      try {
        vi.useFakeTimers();
        const out = await fetchTool.execute({ url: 'https://93.184.216.34/quick' }, sb.ctx, {
          signal: newSignal(),
        });
        expect(out.status).toBe(200);
        // Advancing past the deadline afterwards must not disturb the
        // settled call (no late rejection surfaces anywhere).
        await vi.advanceTimersByTimeAsync(25_000);
      } finally {
        vi.useRealTimers();
        await sb.cleanup();
      }
    });
  });

  describe('default-guard canaries', () => {
    it('still blocks http:// URLs outright', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as never as typeof fetch;
      const sb = await mkSandbox();
      try {
        await expect(
          fetchTool.execute({ url: 'http://93.184.216.34/' }, sb.ctx, { signal: newSignal() }),
        ).rejects.toThrow(/http:\/\/ blocked/);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        await sb.cleanup();
      }
    });

    it('still refuses binary content-types', async () => {
      globalThis.fetch = vi.fn(async () =>
        mkResponse({ body: 'x', contentType: 'application/octet-stream' }),
      ) as never as typeof fetch;
      const sb = await mkSandbox();
      try {
        await expect(
          fetchTool.execute({ url: 'https://93.184.216.34/bin' }, sb.ctx, {
            signal: newSignal(),
          }),
        ).rejects.toThrow(/binary/);
      } finally {
        await sb.cleanup();
      }
    });
  });
});
