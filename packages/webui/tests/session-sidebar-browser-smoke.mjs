import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, '../../.temp_files/session-sidebar');
const id = 'virtual:session-sidebar-smoke';
// Real sidebar and stores, with retained data and no backend connection.
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { SidePanel } from '/src/components/SidePanel/index.tsx';
import { ThemeProvider, useTheme } from '/src/components/ThemeProvider.tsx';
import { i18n } from '/src/i18n/index.ts';
import { useUIStore, useConfigStore, useSessionStore, useHistoryStore } from '/src/stores/index.ts';
import { bindForegroundStores } from '/src/stores/session-store.ts';
import { sessionLane } from '/src/stores/session-lanes.ts';
import { useLocalPrefs } from '/src/stores/local-prefs.ts';
await i18n.changeLanguage('en');
await i18n.loadNamespaces(['activity', 'settings']);
useLocalPrefs.setState({ chromeLevel: 'full' });
useUIStore.setState({ activeActivity: 'chat', currentView: 'chat', sidebarOpen: true, sidebarWidth: 300 });
useConfigStore.setState({ wsConnected: false, autoConnect: false });
bindForegroundStores('sidebar-smoke');
useSessionStore.getState().setSession({ id: 'sidebar-smoke', startedAt: Date.now() - 90000, provider: 'test', model: 'test' });
sessionLane('sidebar-smoke').setTodos(Array.from({length: 8}, (_, i) => ({ id: 'todo-' + i, content: 'Inspect session sidebar section ' + (i + 1), status: i === 0 ? 'completed' : 'pending' })));
useHistoryStore.setState({ entries: Array.from({length: 8}, (_, i) => ({ id: 'history-' + i, title: 'Recorded session ' + (i + 1), provider: 'test', model: 'test', tokenTotal: 100, isCurrent: false })) });
function Harness() {
 const { setTheme } = useTheme();
 window.setSidebarSmokeTheme = setTheme;
 const view = useUIStore(s => s.currentView);
 const open = useUIStore(s => s.sidebarOpen);
 return React.createElement('div', { className: 'flex h-screen bg-background text-foreground' },
   React.createElement('div', { className: 'w-12 shrink-0' }),
   open && React.createElement(SidePanel),
   React.createElement('main', { className: 'flex-1 p-6', 'data-testid': 'current-view' }, view,
     React.createElement('button', { onClick: () => useUIStore.getState().setSidebarOpen(true) }, 'Open sidebar')));
}
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider, { defaultTheme: 'light' }, React.createElement(Harness)));
`;

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'session-sidebar-smoke',
      resolveId: (value) => (value === id ? '\0session-sidebar-smoke.tsx' : undefined),
      load: (value) => (value === '\0session-sidebar-smoke.tsx' ? source : undefined),
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__sidebar_smoke') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await vite.transformIndexHtml(
              req.url,
              '<html lang="en"><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/@id/virtual:session-sidebar-smoke"></script></body></html>',
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
  await mkdir(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 700 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__sidebar_smoke`);
  const story = page.getByRole('button', { name: 'Open session Story' });
  await expect(story).toBeVisible();
  const pinnedY = (await story.boundingBox()).y;
  await page.getByRole('button', { name: 'Quick settings', exact: true }).scrollIntoViewIfNeeded();
  assert.equal((await story.boundingBox()).y, pinnedY, 'Story moves with scroll');
  await story.click();
  await expect(page.getByRole('button', { name: 'Back to session' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to session' }).click();
  await expect(page.getByTestId('current-view')).toContainText('chat');
  const fold = page.getByRole('button', { name: 'Quick actions', exact: true });
  await fold.click();
  await expect(page.getByRole('button', { name: 'New session', exact: true })).toBeHidden();
  await fold.click();
  await expect(page.getByRole('button', { name: 'New session', exact: true })).toBeVisible();
  const order = () =>
    page
      .locator('[data-session-section]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.sessionSection));
  await page
    .getByRole('button', { name: 'Drag Quick actions' })
    .dragTo(page.locator('[data-session-section="stats"]'));
  assert.deepEqual((await order()).slice(0, 3), ['workspace', 'stats', 'actions']);
  await page
    .getByRole('button', { name: 'Drag Quick actions' })
    .dragTo(page.locator('[data-session-section="workspace"]'));
  assert.equal((await order())[0], 'actions');
  await page.getByRole('button', { name: 'Drag Session', exact: true }).focus();
  await page.keyboard.press('ArrowUp');
  assert.deepEqual((await order()).slice(0, 3), ['actions', 'stats', 'workspace']);
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Session', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  assert.deepEqual((await order()).slice(0, 3), ['actions', 'stats', 'workspace']);
  await page.screenshot({ path: path.join(out, 'desktop-light.png') });
  await page.evaluate(() => window.setSidebarSmokeTheme('dark'));
  await expect(page.locator('html')).toHaveClass(/dark/);
  // Let theme color transitions settle before capturing the rendered result.
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(out, 'desktop-dark.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Move Workspace up' }).tap();
  assert.deepEqual((await order()).slice(0, 3), ['actions', 'workspace', 'stats']);
  await page.screenshot({ path: path.join(out, 'mobile.png') });
  await story.tap();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).tap();
  await page.getByRole('button', { name: 'Back to session' }).tap();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('current-view')).toContainText('chat');
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    checks: [
      'fixed Story',
      'Story/session navigation',
      'collapse',
      'native drag in both directions',
      'keyboard reorder',
      'reload persistence',
      'mobile arrows and overlay',
    ],
    screenshots: ['desktop-light.png', 'desktop-dark.png', 'mobile.png'],
  };
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await server.close();
}
