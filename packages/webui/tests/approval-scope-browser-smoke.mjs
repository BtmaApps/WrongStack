import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const virtualId = 'virtual:approval-scope-smoke';
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { ConfirmDialog } from '/src/components/ConfirmDialog.tsx';
import { useUIStore } from '/src/stores/ui-store.ts';
import { useLocalPrefs } from '/src/stores/local-prefs.ts';
import { getWSClient } from '/src/lib/ws-client.ts';
import { useConfigStore } from '/src/stores/index.ts';
window.__sent = [];
const client = getWSClient(useConfigStore.getState().wsUrl);
client.send = message => { window.__sent.push(message); return true; };
useLocalPrefs.getState().set({ yolo: false, uiLocale: 'en' });
window.__show = () => useUIStore.getState().showConfirm({ id: 'scope-smoke', toolName: 'exec', input: { command: 'uv', args: Array.from({length: 100}, (_, i) => 'arg-' + i) }, suggestedPattern: 'uv run pytest', riskTier: 'standard' });
window.__show();
createRoot(document.getElementById('root')).render(React.createElement(ConfirmDialog));
`;
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'approval-scope-smoke',
      resolveId(id) {
        if (id === virtualId) return `\0${virtualId}.tsx`;
      },
      load(id) {
        if (id === `\0${virtualId}.tsx`) return source;
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__approval_smoke') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await vite.transformIndexHtml(
              req.url,
              '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/virtual:approval-scope-smoke"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const address = server.httpServer.address();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const results = [];
  for (const [width, height] of [
    [390, 300],
    [390, 844],
    [1280, 300],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:${address.port}/__approval_smoke`);
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    assert(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y + box.height <= height + 1,
    );
    for (const scope of ['always-exact', 'always-command', 'always-tool']) {
      const select = page.getByRole('combobox');
      await select.selectOption(scope);
      const button = page.getByTestId('confirm-remember');
      const footer = await button.boundingBox();
      assert(footer && footer.y >= 0 && footer.y + footer.height <= height);
      await button.click();
      const frame = await page.evaluate(() => window.__sent.at(-1));
      assert.equal(frame.type, 'tool.confirm_result');
      assert.equal(frame.payload.decision, scope);
      await page.evaluate(() => window.__show());
      await dialog.waitFor();
      assert.equal(await page.getByRole('combobox').inputValue(), 'always-exact');
    }
    results.push(`${width}x${height}: all scopes delivered, footer visible`);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, results }));
} finally {
  await browser.close();
  await server.close();
}
