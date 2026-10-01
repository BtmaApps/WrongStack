import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createHttpServer = vi.hoisted(() => vi.fn(() => ({}) as unknown as Server));

vi.mock('../src/server/http-server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/server/http-server.js')>()),
  createHttpServer,
}));

/**
 * Regression guard for the standalone entry's frontend dist discovery.
 *
 * `startWebUI` → `startHttpServer` → `resolveWebuiDistDir` is the standalone
 * path (the `wstack --webui` entry). `@wrongstack/webui` is a sibling package
 * and deliberately NOT a declared dependency of `@wrongstack/webui-server`,
 * so `createRequire().resolve('@wrongstack/webui')` throws in a workspace
 * install.
 *
 * When that throw was caught, the only fallback was a hardcoded
 * pre-extraction layout guess: `path.resolve(dirname(fromUrl), '..', '..',
 * 'dist')`. For `packages/webui-server/dist/server/entry.js` that lands on
 * `packages/webui-server/dist` — this package's OWN dist, which exists but
 * has no index.html. The static handler then answered 404 "Not found" on `/`
 * and the server silently degraded to WS-only with no diagnostic anywhere.
 *
 * `createHttpServer` is intercepted so the assertion targets the resolved
 * distDir itself: no port is bound and no timing is involved.
 */
describe('startHttpServer → frontend dist discovery', () => {
  beforeEach(() => {
    createHttpServer.mockClear();
  });

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

  const resolvedDistDir = (): string => {
    const call = createHttpServer.mock.calls[0] as unknown as [{ distDir: string }] | undefined;
    if (!call?.[0]) throw new Error('createHttpServer was never called');
    return call[0].distDir;
  };

  const boot = async (extra: Record<string, unknown> = {}) => {
    const { startHttpServer } = await import('../src/server/server-runtime.js');
    await startHttpServer({ ...requiredOpts, ...extra } as never);
    return resolvedDistDir();
  };

  it("resolves the real webui dist instead of this package's own dist", async () => {
    const distDir = await boot();
    // The failure mode: the legacy guess resolves to packages/webui-server/dist,
    // which is this package and therefore never the frontend.
    expect(path.normalize(distDir)).not.toBe(
      path.normalize(path.resolve('packages', 'webui-server', 'dist')),
    );
  });

  it('points at a directory that actually contains index.html', async () => {
    const distDir = await boot();
    // Only assert when the frontend has been built in this checkout, so a CI
    // run without `pnpm --filter @wrongstack/webui build` still gets a clean run.
    if (!existsSync(path.resolve('packages', 'webui', 'dist', 'index.html'))) return;
    expect(existsSync(path.join(distDir, 'index.html'))).toBe(true);
    expect(path.normalize(distDir)).toBe(path.normalize(path.resolve('packages', 'webui', 'dist')));
  });

  it('still honors an explicit distDir override', async () => {
    const explicit = path.resolve('.', 'custom-frontend-dir');
    const distDir = await boot({ distDir: explicit });
    expect(path.normalize(distDir)).toBe(path.normalize(explicit));
  });
});
