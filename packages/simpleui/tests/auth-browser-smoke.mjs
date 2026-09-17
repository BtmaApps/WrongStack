import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/styles.css';
import { AuthPanel } from '/src/auth-panel.tsx';
import { dispatchSimplePanel } from '/src/lib/panel-events.ts';
const listeners = new Set();
window.__sent = [];
const emit = (type, payload) => listeners.forEach(fn => fn({type, payload}));
const socket = { onMessage: fn => { listeners.add(fn); return () => listeners.delete(fn); }, send: (type, payload) => {
  window.__sent.push({type, payload});
  queueMicrotask(() => {
    if (type === 'providers.saved') emit('providers.saved', { providers: [{id:'openai', apiKeys:[{label:'work', maskedKey:'sk-a…1234', isActive:true}]}] });
    if (type === 'auth.oauth.list') emit('auth.oauth.providers', {providers:[{id:'chatgpt',providerId:'openai-codex',label:'ChatGPT'}]});
    if (type === 'providers.list') emit('provider.catalog', {providers:[{id:'openai',name:'OpenAI',family:'openai',apiBase:'https://api.openai.com/v1'}]});
    if (type === 'provider.add') emit('key.operation_result', {success:true,message:'Auth profile saved',requestId:payload.requestId});
    if (type === 'auth.oauth.start') emit('auth.oauth.status', {kind:'chatgpt',phase:'awaiting_browser',authorizeUrl:'https://example.test/login'});
    if (type === 'key.delete') emit('key.operation_result', {success:false,message:'Disk full',requestId:payload.requestId});
    if (type === 'key.add') emit('key.operation_result', {success:true,message:'Key saved',requestId:payload.requestId});
  });
}};
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null, React.createElement('button', {onClick: () => dispatchSimplePanel('open-auth')}, 'Open credentials'), React.createElement(AuthPanel, {socketRef: {current:socket}})));
`;
const virtualId = 'virtual:auth-smoke';
const resolved = '\0auth-smoke.tsx';
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'auth-smoke',
      resolveId: (id) => (id === virtualId ? resolved : undefined),
      load: (id) => (id === resolved ? source : undefined),
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__auth_smoke') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await server.transformIndexHtml(
              req.url,
              '<div id="root"></div><script type="module" src="/@id/virtual:auth-smoke"></script>',
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
    [390, 300],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__auth_smoke`);
    await page.getByRole('button', { name: 'Open credentials' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('openai', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.__sent.some((m) => m.type === 'key.delete')),
      false,
    );
    await dialog.getByRole('button', { name: 'Confirm deletion' }).click();
    await dialog.getByRole('status').filter({ hasText: 'Disk full' }).waitFor();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.getByLabel('Provider or saved alias').fill('openai');
    await dialog.getByLabel('API key', { exact: true }).fill('test-browser-secret');
    await dialog.getByRole('button', { name: 'Save key' }).click();
    await dialog.getByRole('status').filter({ hasText: 'Key saved' }).waitFor();
    assert.equal(await dialog.getByLabel('API key', { exact: true }).inputValue(), '');
    await dialog.getByLabel('Auth profile alias', { exact: true }).fill('work-account');
    await dialog.getByLabel('Account API key', { exact: true }).fill('work-account-key');
    await dialog.getByRole('button', { name: 'Save auth profile' }).click();
    await dialog.getByRole('status').filter({ hasText: 'Auth profile saved' }).waitFor();
    assert.equal(await dialog.getByLabel('Account API key', { exact: true }).inputValue(), '');
    const created = await page.evaluate(() =>
      window.__sent.find((message) => message.type === 'provider.add'),
    );
    assert.equal(created.payload.id, 'work-account');
    assert.equal(created.payload.type, 'openai');
    assert.equal(created.payload.apiKey, 'work-account-key');
    await dialog.getByRole('button', { name: 'Sign in with ChatGPT' }).click();
    await dialog.getByRole('link', { name: 'Open sign-in page' }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const box = await dialog.boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y + box.height <= height + 1,
    );
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.ok(await page.evaluate(() => window.__sent.some((m) => m.type === 'auth.oauth.cancel')));
    assert.deepEqual(errors, []);
    console.log(`Auth panel browser smoke passed: ${width}x${height}`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
