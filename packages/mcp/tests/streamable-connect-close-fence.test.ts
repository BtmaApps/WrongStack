import { vi } from 'vitest';
import { StreamableHTTPTransport } from '../src/transport-streamable.js';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
async function exercise(mode: 'normal' | 'close' | 'restart' | 'reject') {
  const transport = new StreamableHTTPTransport({ name: 'fixture', url: 'https://example.test' });
  const metadata = {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'fixture', version: '1' },
  };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: metadata }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  const raw = transport as unknown as { postRaw: (m: string, p: unknown) => Promise<unknown> };
  const entered = deferred<void>();
  const gate = deferred<unknown>();
  let catalogs = 0;
  vi.spyOn(raw, 'postRaw').mockImplementation(async (method) => {
    if (method !== 'tools/list') return { result: {} };
    if (++catalogs === 1 && mode !== 'normal') {
      entered.resolve();
      return gate.promise;
    }
    return { result: { tools: [{ name: 'new', inputSchema: {} }] } };
  });
  const connecting = transport.connect();
  const settled = connecting.then(
    () => ({ ok: true }),
    (error) => ({ ok: false, error }),
  );
  try {
    if (mode !== 'normal') {
      await entered.promise;
      await transport.close();
      if (mode === 'restart' || mode === 'reject') await transport.connect();
      if (mode === 'reject') gate.reject(new Error('stale failure'));
      else gate.resolve({ result: { tools: [{ name: 'old', inputSchema: {} }] } });
    }
    const outcome = await settled;
    return {
      state: transport.getState(),
      tools: transport.listTools().map((t) => t.name),
      outcome,
    };
  } finally {
    await transport.close();
    globalThis.fetch = oldFetch;
    vi.restoreAllMocks();
  }
}

import { expect, it } from 'vitest';

it('verifies close, replacement success, and stale rejection', async () => {
  const closed = await exercise('close');
  expect(closed.state).toBe('disconnected');
  expect(closed.tools).toEqual([]);
  expect(closed.outcome.ok).toBe(false);
  const replaced = await exercise('restart');
  expect(replaced.state).toBe('connected');
  expect(replaced.tools).toEqual(['new']);
  expect(replaced.outcome.ok).toBe(false);
  const rejected = await exercise('reject');
  expect(rejected.state).toBe('connected');
  expect(rejected.tools).toEqual(['new']);
  const control = await exercise('normal');
  expect(control.state).toBe('connected');
  expect(control.outcome.ok).toBe(true);
});
