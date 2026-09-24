// Full-app browser smoke for SimpleUI — boots the REAL component tree
// (main.tsx → App → SimpleUiSession, grouped facade included) in headless
// Chromium against an in-process Vite dev server, with the socket module
// (`src/lib/ws.ts`) swapped for the scripted fake in tests/app-smoke-fake-ws.js
// via resolve.alias — the same mechanism the package's own vite.config.ts
// uses for its shiki shim.
//
// Follows the tests/auth-browser-smoke.mjs pattern (vite + @playwright/test),
// with two differences forced by the full app graph:
//   1. The Vite ROOT is the REPO ROOT (not packages/simpleui) so that
//      workspace dependencies never load through /@fs/ escape URLs, which
//      fail on this Windows host for files outside the server root even
//      when they exist on disk.
//   2. Workspace packages resolve from SOURCE via the same alias strategy
//      as the root vitest.config.ts (coreAliases helper + explicit maps) —
//      the published dist/ chunk graphs are never exercised here.
//
// Run manually:  cd packages/simpleui && node tests/app-browser-smoke.mjs
//
// Asserts boot, session.start reflection, the send path, and the command
// palette cycle — with a hard zero-pageerror gate.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { coreAliases } from '../../../scripts/vitest-core-aliases.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fakeWs = path.resolve(repoRoot, 'packages/simpleui/tests/app-smoke-fake-ws.js');

const server = await createServer({
  root: repoRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, fs: { allow: [repoRoot] } },
  // Mirror packages/simpleui/vite.config.ts (the config file itself is
  // root-relative and cannot be reused with a repo-root server):
  css: { postcss: {} },
  resolve: {
    alias: [
      {
        find: /^shiki$/,
        replacement: path.resolve(repoRoot, 'packages/simpleui/src/lib/shiki-shim.ts'),
      },
      // Swap the socket module for the scripted fake. Exact string entries
      // (rollup-alias semantics: full-match on the specifier) cover both
      // import forms in the app graph: sibling './ws.js' from within lib/
      // and '../lib/ws.js' from hooks/. Type-only imports are erased.
      { find: './ws.js', replacement: fakeWs },
      { find: '../lib/ws.js', replacement: fakeWs },
      // Source-resolution strategy copied from the root vitest.config.ts —
      // see the alias comments there for why each entry exists. String-form
      // find keys keep vitest's exact prefix-matching semantics (no regex
      // conversion: absolute Windows replacement paths must stay literal).
      // The coreAliases helper already sorts its keys longest-first.
      ...Object.entries({
        ...coreAliases(path.resolve(repoRoot, 'packages/core')),
        '@wrongstack/tools': path.resolve(repoRoot, 'packages/tools/src'),
        '@wrongstack/kanban': path.resolve(repoRoot, 'packages/kanban/src'),
        '@wrongstack/webui-server': path.resolve(repoRoot, 'packages/webui-server/src'),
        // Not aliased in root vitest (its Node workers resolve dist fine);
        // the browser graph here must stay under the vite root, so resolve
        // the protocol package from source too.
        '@wrongstack/webui-protocol': path.resolve(repoRoot, 'packages/webui-protocol/src'),
      }).map(([key, value]) => ({ find: key, replacement: value })),
    ],
  },
  plugins: [
    react(),
    {
      name: 'app-smoke',
      configureServer(srv) {
        srv.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__app_smoke') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await srv.transformIndexHtml(
              req.url,
              '<div id="root"></div><script type="module" src="/packages/simpleui/src/main.tsx"></script>',
            ),
          );
        });
      },
    },
  ],
});

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__app_smoke`);

    // 1. Boot: session.start is pushed by the fake backend on open; the
    //    workspace heading reflects the project name.
    try {
      await page.getByRole('heading', { level: 1 }).filter({ hasText: 'BROWSER SMOKE' }).waitFor();
    } catch (error) {
      // Failure diagnostics: dump what actually rendered instead of a blind
      // timeout — body text and sent frames.
      console.error('BOOT FAILED — body text:');
      console.error((await page.evaluate(() => document.body.innerText)).slice(0, 2000));
      console.error(
        'BOOT FAILED — sent frames:',
        JSON.stringify(await page.evaluate(() => window.__sent)),
      );
      throw error;
    }

    // 2. Send path: composer → user_message frame → transcript reflection.
    // exact: true — plain getByLabel does substring matching and also catches
    // the "Add message to queue"/"Send message" buttons (strict-mode 3-match).
    const composer = page.getByLabel('Message', { exact: true });
    await composer.waitFor();
    await composer.fill('Ship the browser smoke note');
    await composer.press('Enter');
    await page.getByText('Smoke acknowledged.').waitFor();
    assert.ok(
      await page.evaluate(() => window.__sent.some((m) => m.type === 'user_message')),
      'user_message frame must be sent',
    );

    // 3. Command palette cycle on the real dialog container.
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog');
    await palette.waitFor();
    await palette.getByText('New session').waitFor();
    await page.keyboard.press('Escape');
    await palette.waitFor({ state: 'detached' });

    // 4. No horizontal overflow at this viewport.
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
    );

    assert.deepEqual(errors, []);
    console.log(`App browser smoke passed: ${width}x${height}`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
