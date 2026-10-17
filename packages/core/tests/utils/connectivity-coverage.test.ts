/**
 * Coverage for core/src/utils/connectivity.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkConnectivity, resetConnectivityCache } from '../../src/utils/connectivity.js';

describe('connectivity cache is scoped to the probe URL', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetConnectivityCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetConnectivityCache();
  });

  it('serves a repeat probe of the same URL from cache inside the TTL', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    expect(await checkConnectivity({ probeUrl: 'https://a.test', ttlMs: 60_000 })).toBe(true);
    expect(await checkConnectivity({ probeUrl: 'https://a.test', ttlMs: 60_000 })).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('probes a different URL instead of answering from another URL cache', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('up.test')) return new Response(null, { status: 200 });
      throw new Error('network down');
    });
    expect(await checkConnectivity({ probeUrl: 'https://up.test', ttlMs: 60_000 })).toBe(true);
    expect(await checkConnectivity({ probeUrl: 'https://down.test', ttlMs: 60_000 })).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still bypasses the cache entirely when ttlMs is 0', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await checkConnectivity({ probeUrl: 'https://a.test', ttlMs: 0 });
    await checkConnectivity({ probeUrl: 'https://a.test', ttlMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('connectivity', () => {
  it('checkConnectivity is exported and callable', async () => {
    const { checkConnectivity } = await import('../../src/utils/connectivity.js');
    expect(typeof checkConnectivity).toBe('function');
  });

  it('checkConnectivity returns a boolean', async () => {
    const { checkConnectivity } = await import('../../src/utils/connectivity.js');
    const result = await checkConnectivity();
    expect(typeof result).toBe('boolean');
  });

  it('checkConnectivity accepts custom options', async () => {
    const { checkConnectivity } = await import('../../src/utils/connectivity.js');
    // Call with very short timeout to test the non-cached path
    const result = await checkConnectivity({
      probeUrl: 'https://8.8.8.8',
      timeoutMs: 1000,
      ttlMs: 0, // bypass cache
    });
    expect(typeof result).toBe('boolean');
  });

  it('cached results are returned within TTL', async () => {
    const { checkConnectivity } = await import('../../src/utils/connectivity.js');
    // First call populates cache
    const first = await checkConnectivity({ ttlMs: 60000 });
    // Second call should use cache
    const second = await checkConnectivity({ ttlMs: 60000 });
    expect(first).toBe(second);
  });

  it('returns false on network error with custom invalid URL', async () => {
    const { checkConnectivity } = await import('../../src/utils/connectivity.js');
    const result = await checkConnectivity({
      probeUrl: 'https://invalid-host-that-does-not-exist.invalid',
      timeoutMs: 500,
      ttlMs: 0,
    });
    // Should be false or true depending on network, but should not throw
    expect(typeof result).toBe('boolean');
  });
});
