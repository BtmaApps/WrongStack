import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, '../../.temp_files/jev');
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { ThemeProvider } from '/src/components/ThemeProvider.tsx';
import { SettingsPanel } from '/src/components/SettingsPanel/index.tsx';
import { getWSClient } from '/src/lib/ws-client.ts';
import { useConfigStore, useUIStore } from '/src/stores/index.ts';
useUIStore.getState().setSettingsActiveTab('provider');
const client = getWSClient(useConfigStore.getState().wsUrl);
const listeners = new Set();
const originalOn = client.on.bind(client);
client.on = (type, fn) => { if (type !== 'jev.state') return originalOn(type, fn); listeners.add(fn); return () => listeners.delete(fn); };
let settings = { status: 'ready', keySource: 'config', route: 'typesafe', endpoint: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest', requestTimeoutMs: 4000, features: { brain: true, memoryTriage: true, topicShift: true, memoryRecall: true, compaction: true, kanbanVerify: true, modelTier: true, semanticLint: true, skillSuggestion: false, fleetDispatch: false } };
window.__jevSent = [];
client.send = (message) => {
  window.__jevSent.push(message);
  if (!message.type.startsWith('jev.')) return true;
  if (message.type === 'jev.set') { const { apiKey, ...patch } = message.payload.patch; settings = { ...settings, ...patch }; }
  queueMicrotask(() => listeners.forEach(fn => fn({ type: 'jev.state', payload: { requestId: message.payload.requestId, settings, message: message.type === 'jev.set' ? 'Saved' : undefined, activity: { scope: 'process', path: '/profile/logs/jev-123.jsonl', entries: [{ id: 'request-1', at: Date.now(), feature: 'memoryRecall', route: 'typesafe', model: 'jev-latest', durationMs: 128, outcome: 'answered', project: '/workspace/project', inputTokens: 142, outputTokens: 0, answers: { relevant: 0.91 } }] } } })));
  return true;
};
createRoot(document.getElementById('root')).render(React.createElement('main', { className: 'h-screen' }, React.createElement(ThemeProvider, null, React.createElement(SettingsPanel))));
`;
const id = 'virtual:jev-browser-smoke';
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'jev-browser-smoke',
      resolveId(value) {
        if (value === id) return '\0jev-smoke.tsx';
      },
      load(value) {
        if (value === '\0jev-smoke.tsx') return source;
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__jev_smoke') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await vite.transformIndexHtml(
              req.url,
              '<html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/@id/virtual:jev-browser-smoke"></script></body></html>',
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
  await mkdir(out, { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [390, 300],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__jev_smoke`);
    const jevTab = page.getByRole('tab', { name: 'Jev', exact: true });
    await jevTab.click();
    assert.equal(
      await jevTab.getAttribute('aria-selected'),
      'true',
      'Jev must remain selected after clicking its Settings tab',
    );
    const tabValues = await page
      .getByRole('tab')
      .evaluateAll((tabs) => tabs.map((tab) => tab.id.split('-trigger-')[1]));
    assert.equal(
      tabValues.indexOf('jev'),
      tabValues.indexOf('provider') + 1,
      'Jev must immediately follow Provider',
    );
    const save = page.getByRole('button', { name: /Save Jev settings|Jev ayarlarını kaydet/ });
    await save.waitFor({ timeout: 10000 }).catch(async (error) => {
      console.error(errors, await page.locator('body').innerText());
      throw error;
    });
    await page.locator('#jev-model').fill('jev-pinned');
    await page.locator('#jev-key').fill('smoke-secret');
    await save.click();
    await page.getByText('Saved', { exact: true }).waitFor();
    assert.equal(await page.locator('#jev-key').inputValue(), '');
    const sent = await page.evaluate(() => window.__jevSent.findLast((m) => m.type === 'jev.set'));
    assert.equal(sent.payload.patch.model, 'jev-pinned');
    await page.getByText(/memoryRecall · answered/).click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: path.join(out, `${width}x${height}-activity.png`) });
    await page
      .getByRole('heading', { name: 'TypeSafe / Jev', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${width}x${height}.png`) });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Jev browser smoke passed: 1280x900, 390x844, 390x300; Settings tab navigation/order, save, masked key, activity and horizontal overflow.',
  );
} finally {
  await browser.close();
  await server.close();
}
