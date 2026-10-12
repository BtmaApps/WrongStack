import * as http from 'node:http';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

// Regression (audit 2026-10-12, F450): the `loopback` network allowance
// approves `*.localhost` by NAME, and the approved-origin dispatcher then
// connected to whatever the resolver answered. A resolver mapping a
// `*.localhost` name to a LAN, link-local or metadata address was fetched,
// although the allowance promises it never covers those (the browser path
// already rejected it). DNS is faked at the resolver; the server is real.

const records = vi.hoisted(() => new Map<string, string[]>());
vi.mock('node:dns/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:dns/promises')>()),
  lookup: vi.fn(async (host: string) => {
    const list = records.get(host);
    if (!list) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
    return list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  }),
}));
delete process.env['WRONGSTACK_FETCH_ALLOW_PRIVATE'];
const { guardedFetch } = await import('../src/_fetch-guard.js');

let server: http.Server;
let port = 0;
beforeAll(async () => {
  server = http.createServer((_req, res) => res.end('reached'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function failureText(url: string, allowed: string[]): Promise<string> {
  try {
    await guardedFetch(url, 0, AbortSignal.timeout(3000), {}, { allowedPrivateOrigins: allowed });
    return 'fetched';
  } catch (err) {
    const cause = (err as { cause?: Error }).cause;
    return `${(err as Error).message} ${cause?.message ?? ''}`;
  }
}

it('refuses a *.localhost name that resolves outside loopback under the loopback allowance', async () => {
  records.set('lan.localhost', ['10.255.255.1']);
  records.set('mixed.localhost', ['127.0.0.1', '169.254.169.254']);
  expect(await failureText(`http://lan.localhost:${port}/`, ['loopback'])).toContain(
    'loopback allowance does not cover',
  );
  expect(await failureText(`http://mixed.localhost:${port}/`, ['loopback'])).toContain(
    'loopback allowance does not cover',
  );
});

it('still fetches a *.localhost name that resolves to loopback', async () => {
  records.set('app.localhost', ['127.0.0.1']);
  const res = await guardedFetch(
    `http://app.localhost:${port}/`,
    0,
    AbortSignal.timeout(3000),
    {},
    { allowedPrivateOrigins: ['loopback'] },
  );
  expect(await res.text()).toBe('reached');
});
