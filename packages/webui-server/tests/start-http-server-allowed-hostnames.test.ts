import type { Server } from 'node:http';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createHttpServer = vi.hoisted(() => vi.fn(() => ({}) as unknown as Server));

vi.mock('../src/server/http-server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/server/http-server.js')>()),
  createHttpServer,
}));

/**
 * Regression guard for the WS-001 CSRF / DNS-rebinding guard on the
 * standalone server.
 *
 * `createHttpServer` derives its `trustedHostnames` allow-list from
 * `opts.allowedHostnames` plus the `publicWsUrl` hostname and feeds it to
 * `httpRequestOriginOk` on every HTTP request. `startStaticServe` (the
 * CLI-embedded host) forwarded `allowedHostnames`; `startHttpServer` (the
 * standalone host) never even declared it, so an operator fronting the WebUI
 * with a tunnel or reverse proxy had their `Host`/`Origin` header rejected on
 * the standalone path while the embedded path accepted it.
 *
 * `createHttpServer` is intercepted so the assertion targets the option
 * threading itself — no port is bound and no timing is involved.
 */
describe('startHttpServer → createHttpServer option threading', () => {
  beforeEach(() => {
    createHttpServer.mockClear();
  });

  /** The full set of options startHttpServer requires — omit any and it throws. */
  const requiredOpts = {
    wsHost: '127.0.0.1',
    httpPort: 3456,
    wsToken: 'token',
    publicWsUrl: undefined,
    publicUrl: undefined,
    requireToken: false,
    globalRoot: '/tmp/.wrongstack',
    globalConfigPath: '/tmp/.wrongstack/config.json',
    projectRoot: '/tmp/project',
  } as const;

  const load = () => import('../src/server/server-runtime.js');

  it('forwards allowedHostnames so a tunnel hostname reaches the origin guard', async () => {
    const { startHttpServer } = await load();
    const allowedHostnames = ['tunnel.example.com', 'alt.example.org'];

    startHttpServer({ ...requiredOpts, allowedHostnames });

    expect(createHttpServer).toHaveBeenCalledTimes(1);
    const forwarded = createHttpServer.mock.calls[0]?.[0];
    expect(forwarded?.allowedHostnames).toEqual(allowedHostnames);
  });

  it('keeps allowedHostnames optional (loopback-only hosts are unchanged)', async () => {
    const { startHttpServer } = await load();

    startHttpServer({ ...requiredOpts });

    const forwarded = createHttpServer.mock.calls[0]?.[0];
    // Explicitly undefined rather than absent: the guard falls back to the
    // publicWsUrl hostname alone, which is the pre-existing loopback path.
    expect(forwarded?.allowedHostnames).toBeUndefined();
  });

  it('still threads the previously-forwarded options (no regression)', async () => {
    const { startHttpServer } = await load();
    const watcherMetrics = { watcherActive: true } as never;

    startHttpServer({ ...requiredOpts, watcherMetrics, distDir: '/tmp/dist' });

    const forwarded = createHttpServer.mock.calls[0]?.[0];
    expect(forwarded?.watcherMetrics).toBe(watcherMetrics);
    // distDir is resolved to an absolute path before it reaches the factory.
    expect(forwarded?.distDir).toBe(path.resolve('/tmp/dist'));
    expect(forwarded?.host).toBe('127.0.0.1');
  });
});
