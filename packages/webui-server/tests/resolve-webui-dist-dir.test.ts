import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const createHttpServer = vi.hoisted(() => vi.fn(() => ({}) as never));

vi.mock('../src/server/http-server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/server/http-server.js')>()),
  createHttpServer,
}));

// Second branch: the pnpm-workspace resolver. Left real it would find the
// built frontend in this checkout and return it, so the guess is never reached.
// Only the resolver is stubbed — `warnFrontendUnavailable` stays real, because
// it is the implementation emitting the log line asserted below.
vi.mock('../src/server/frontend-static-serve.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/server/frontend-static-serve.js')>()),
  resolveDistDir: () => null,
}));

/**
 * Make the first two branches of `resolveWebuiDistDir` fail so the last-resort
 * legacy guess is reached.
 *
 * Stubbing `resolveDistDir` alone is not enough: under Vitest, `createRequire`
 * is handled by Vite's resolver, which resolves the specifier from the project
 * root rather than from `fromUrl` — so `@wrongstack/webui` still resolved to
 * the real `packages/webui`. Only that one specifier is intercepted; every
 * other id delegates to the real resolver so the rest of the graph works.
 */
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    default: actual,
    createRequire: (from: string | URL) => {
      const real = actual.createRequire(from);
      return {
        resolve: (id: string) => {
          if (id === '@wrongstack/webui') {
            throw Object.assign(new Error(`Cannot find module '${id}'`), {
              code: 'MODULE_NOT_FOUND',
            });
          }
          return real.resolve(id);
        },
      };
    },
  };
});

/**
 * Regression guard for the standalone host's LAST-RESORT frontend fallback.
 *
 * `startWebUI` → `startHttpServer` → `resolveWebuiDistDir`. When neither Node
 * resolution nor the pnpm-workspace layout finds `@wrongstack/webui`, it falls
 * back to the pre-extraction co-located guess. For the extracted package that
 * guess is WRONG: it lands on `packages/webui-server/dist` — this package's own
 * dist, which exists but has no `index.html`. The static handler then answered
 * 404 on every request and the host degraded to WS-only with no diagnostic.
 *
 * Driven through `startHttpServer` rather than by exporting the private
 * helper: the repo freezes "exports only tests reference" in
 * `architecture/test-only-exports.json` and fails on additions, so testing the
 * production entry point keeps the ratchet from growing.
 */
describe('standalone frontend dist last-resort fallback', () => {
  let root: string;
  let warn: MockInstance<typeof console.warn>;

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

  /** The path the legacy guess resolves to from this module's own location. */
  const legacyGuess = (): string => fileURLToPath(new URL('../dist', import.meta.url));

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ws-legacy-guess-'));
    mkdirSync(path.join(root, 'co-located'), { recursive: true });
    createHttpServer.mockClear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  const boot = async (extra: Record<string, unknown> = {}) => {
    const { startHttpServer } = await import('../src/server/server-runtime.js');
    await startHttpServer({ ...requiredOpts, ...extra } as never);
    const call = createHttpServer.mock.calls[0] as unknown as [{ distDir: string }] | undefined;
    if (!call?.[0]) throw new Error('createHttpServer was never called');
    return call[0].distDir;
  };

  const warning = (): Record<string, unknown> | undefined => {
    const line = warn.mock.calls
      .map(([l]) => String(l))
      .find((l) => l.includes('frontend_unavailable'));
    return line === undefined ? undefined : (JSON.parse(line) as Record<string, unknown>);
  };

  it('warns with the guess when the legacy path has no index.html', async () => {
    // The real repo state: packages/webui-server/dist exists but holds no
    // index.html, which is exactly the silent-404 condition under test.
    const distDir = await boot();
    expect(path.normalize(distDir)).toBe(path.normalize(legacyGuess()));

    const parsed = warning();
    expect(parsed).toBeDefined();
    expect(parsed).toMatchObject({ level: 'warn', event: 'webui.frontend_unavailable' });
    // The operator must be able to see WHICH path was tried...
    expect(String(parsed?.message)).toContain('no index.html');
    // ...along with the consequence and the fix.
    expect(String(parsed?.message)).toMatch(/WebSocket only/i);
    expect(String(parsed?.message)).toContain('pnpm --filter @wrongstack/webui build');
  });

  it('stays silent and serves the explicit dist when one is supplied', async () => {
    // The layout the fallback was originally preserved for: a caller that
    // passes an exact frontend directory must never reach the guess.
    const explicit = path.join(root, 'explicit-dist');
    mkdirSync(explicit, { recursive: true });
    writeFileSync(path.join(explicit, 'index.html'), '<!doctype html><div id="root"></div>');

    expect(path.normalize(await boot({ distDir: explicit }))).toBe(path.resolve(explicit));
    expect(warning()).toBeUndefined();
  });
});
