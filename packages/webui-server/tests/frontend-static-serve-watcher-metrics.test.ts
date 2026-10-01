import type { Server } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { startStaticServe } from '../src/server/frontend-static-serve.js';
import type { FileWatcherMetrics } from '../src/server/setup-events-watcher.js';

/**
 * Regression guard for the CLI-embedded WebUI.
 *
 * The standalone server constructs its HTTP server via `startHttpServer`,
 * which passes `watcherMetrics` into `createHttpServer`. The CLI host goes
 * through `startStaticServe` instead, and `startStaticServe` builds the
 * `createHttpServer` options object by hand — so any option it forgets is
 * silently undefined for every CLI-hosted WebUI. `watcherMetrics` was
 * forgotten, which left `/debug/watcher-metrics` permanently on its 503
 * branch and the Debug Dashboard permanently "unavailable".
 *
 * These tests assert the forwarding at the seam itself, so dropping the
 * option again fails here rather than in a running browser.
 */
describe('startStaticServe → createHttpServer wiring', () => {
  const metrics = (): FileWatcherMetrics => ({
    fileChangesDetected: 0,
    filesProcessed: 0,
    broadcastsSent: 0,
    debounceResets: 0,
    totalDebounceDelayMs: 0,
    activeProjects: 0,
    averageDebounceDelayMs: 0,
    watcherActive: false,
  });

  const stubServer = () => ({ close: vi.fn() }) as unknown as Server;

  it('forwards watcherMetrics verbatim to the constructed server', async () => {
    const createServer = vi.fn<typeof import('../src/server/http-server.js').createHttpServer>(() =>
      stubServer(),
    );
    const watcherMetrics = metrics();

    await startStaticServe(
      {
        host: '127.0.0.1',
        httpPort: 3456,
        globalRoot: '/tmp/.wrongstack',
        distDir: '/tmp/dist',
        watcherMetrics,
        // Never bind a real socket in a unit test.
        deferListen: true,
      },
      { createServer, resolveDist: () => '/tmp/dist' },
    );

    expect(createServer).toHaveBeenCalledTimes(1);
    const opts = createServer.mock.calls[0]?.[0];
    // Identity, not just shape: the route spreads this object live, so a copy
    // would freeze the values the status watcher keeps updating.
    expect(opts?.watcherMetrics).toBe(watcherMetrics);
  });

  // indexDir + executePackageOperation were the two remaining fields the
  // CLI-embedded path silently dropped. `createHttpServer` passes its whole
  // options object to `handleApiRoutes`, so indexDir reaching here is what
  // makes `/api/codemap/*` honour `meta.codebaseIndexDir` (see
  // api-router.gaps.test.ts, which pins the router side of the same chain).
  it('forwards indexDir and executePackageOperation so codemap routes and TechStack operations survive the CLI path', async () => {
    const createServer = vi.fn<typeof import('../src/server/http-server.js').createHttpServer>(() =>
      stubServer(),
    );
    const executePackageOperation = vi.fn();
    const indexDir = '/custom/.codebase-index';

    await startStaticServe(
      {
        host: '127.0.0.1',
        httpPort: 3456,
        globalRoot: '/tmp/.wrongstack',
        distDir: '/tmp/dist',
        projectRoot: '/tmp/project',
        indexDir,
        executePackageOperation,
        deferListen: true,
      },
      { createServer, resolveDist: () => '/tmp/dist' },
    );

    const opts = createServer.mock.calls[0]?.[0];
    expect(opts?.indexDir).toBe(indexDir);
    expect(opts?.executePackageOperation).toBe(executePackageOperation);
  });

  it('passes watcherMetrics: undefined (never omits the key) when the host supplies none', async () => {
    const createServer = vi.fn<typeof import('../src/server/http-server.js').createHttpServer>(() =>
      stubServer(),
    );

    await startStaticServe(
      {
        host: '127.0.0.1',
        httpPort: 3456,
        globalRoot: '/tmp/.wrongstack',
        distDir: '/tmp/dist',
        deferListen: true,
      },
      { createServer, resolveDist: () => '/tmp/dist' },
    );

    const opts = createServer.mock.calls[0]?.[0];
    // Documented degradation: an embedder that omits it keeps the 503 branch,
    // which is what made this bug invisible until someone compared the two
    // server constructors side by side.
    expect(opts?.watcherMetrics).toBeUndefined();
  });
});
