// @-mention Enter-contract browser smoke.
//
// Guards the real-browser event flow that jsdom cannot reproduce:
// FilePicker's window-capture keydown listener runs preventDefault() +
// pick() BEFORE the textarea's React bubble-phase handler, and React 18
// can flush the pick's setAtMention(null) between the two — so Enter
// must be gated on e.defaultPrevented (which survives that re-render),
// not on the atMention closure alone. The unit suite pins the handler
// contract; this smoke proves it against the real ChatInput, FilePicker
// window listener, and Chromium event pipeline.
//
// Cases (one page, sequential):
//   1. control: plain Enter (no mention) still submits the draft.
//   2. Enter with matches loaded selects the highlighted file — the
//      '@query' token is stripped, a reference chip is added — and does
//      NOT submit the draft.
//   3. Enter with zero matches ("No files match …") is a pure no-op:
//      no submit, no newline in the draft.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const webuiRoot = path.resolve(here, '..');

function harnessPlugin(source) {
  const virtualId = 'virtual:at-mention-browser-smoke';
  const resolvedId = `\0${virtualId}.tsx`;
  return {
    name: 'at-mention-browser-smoke',
    resolveId(id) {
      return id === virtualId ? resolvedId : undefined;
    },
    load(id) {
      return id === resolvedId ? source : undefined;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/__at_mention_smoke') return next();
        const html = await server.transformIndexHtml(
          req.url,
          '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/@id/virtual:at-mention-browser-smoke"></script></body></html>',
        );
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
  };
}

// Mounts the REAL ChatInput with a stubbed WS client singleton: sends are
// recorded, listFiles answers from a fixed file list (empty for the
// zero-match query), and files.list pushes go to FilePicker's subscriber.
// enhanceEnabled is forced off so a submit would unambiguously route to
// a recorded send frame.
const fixtureSource = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { ChatInput } from '/src/components/ChatInput.tsx';
import { getWSClient } from '/src/lib/ws-client.ts';
import { useConfigStore } from '/src/stores/index.ts';
import { useFileReferenceStore } from '/src/stores/file-reference-store.ts';
import { useLocalPrefs } from '/src/stores/local-prefs.ts';

useLocalPrefs.getState().set({ enhanceEnabled: false });
window.__sent = [];
window.__filesQueries = [];
const filesListSubscribers = new Set();
const wsClient = getWSClient(useConfigStore.getState().wsUrl);
Object.defineProperty(wsClient, 'isConnected', { get: () => true, configurable: true });
const originalOn = wsClient.on.bind(wsClient);
wsClient.on = (type, cb) => {
  if (type === 'files.list') {
    filesListSubscribers.add(cb);
    return () => filesListSubscribers.delete(cb);
  }
  return originalOn(type, cb);
};
wsClient.listFiles = (query, limit) => {
  window.__filesQueries.push(query);
  const files = query === 'zzz' ? [] : ['src/index.ts', 'src/app.tsx', 'docs/readme.md'];
  setTimeout(() => {
    for (const cb of Array.from(filesListSubscribers)) cb({ payload: { files } });
  }, 10);
};
wsClient.supportsCapability = () => true;
wsClient.onStatus = () => () => {};
wsClient.send = (message, options) => {
  window.__sent.push(message);
  return { requestId: 'browser-smoke-stub' };
};
createRoot(document.getElementById('root')).render(React.createElement(ChatInput));
window.__atMentionReady = true;
window.__dumpState = () => ({
  draft: document.querySelector('[data-chat-textarea]')?.value ?? null,
  refs: useFileReferenceStore.getState().refs,
  filesQueries: window.__filesQueries.slice(),
});
`;

async function start() {
  const server = await createServer({
    root: webuiRoot,
    configFile: path.join(webuiRoot, 'vite.config.ts'),
    plugins: [harnessPlugin(fixtureSource)],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
  return { server, url: `http://127.0.0.1:${address.port}/__at_mention_smoke` };
}

const browser = await chromium.launch({ headless: true });
try {
  const { server, url } = await start();
  // Pin the browser locale: headless Chromium inherits the host OS locale
  // and the app boots its UI language from the browser language; the
  // assertions below expect the English picker/chrome strings.
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const results = [];
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__atMentionReady === true);
    const ta = page.locator('[data-chat-textarea]');
    await ta.waitFor();
    const draft = () => page.evaluate(() => document.querySelector('[data-chat-textarea]').value);
    const sentHas = (needle) =>
      page.evaluate((n) => JSON.stringify(window.__sent).includes(n), needle);
    // Place the caret at the END of the draft — a plain click() targets the
    // element center, which can land mid-word and silently break mention
    // detection (the @ must be preceded by whitespace or start-of-text).
    const focusEnd = () =>
      ta.evaluate((el) => {
        el.setSelectionRange(el.value.length, el.value.length);
        el.focus();
      });

    // 1. Control: plain Enter still submits the draft. This also proves
    //    the harness can observe submits, so "not submitted" below is a
    //    meaningful negative.
    await ta.click();
    await ta.pressSequentially('hello world');
    await ta.press('Enter');
    await page.waitForFunction(() => JSON.stringify(window.__sent).includes('hello world'), null, {
      timeout: 5000,
    });
    results.push({ case: 'control: plain Enter submits', status: 'passed' });

    // 2. Enter with matches loaded: picks the highlighted file, strips the
    //    '@query' token, adds a reference chip (rendered under REFERENCES
    //    with the file BASENAME), and sends nothing.
    await focusEnd();
    await ta.pressSequentially('look at @in');
    await page.getByRole('button', { name: /src\/index\.ts/ }).waitFor({ timeout: 5000 });
    await ta.press('Enter');
    // The chip shows the basename "index.ts", not the full path.
    await page.getByText('index.ts').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(400); // a raced submit would surface here
    const draftAfterPick = await draft();
    if (draftAfterPick !== 'look at')
      throw new Error(`Enter did not select cleanly: draft=${JSON.stringify(draftAfterPick)}`);
    if (await sentHas('look at'))
      throw new Error('Enter submitted the draft while the @-mention picker was open');
    results.push({ case: 'Enter with matches selects without submitting', status: 'passed' });

    // 3. Enter with zero matches is a no-op: no submit, no newline. The
    //    leading space matters — after the pick the draft is 'look at', and
    //    an @ appended directly after 'at' is mid-word, not a mention.
    await focusEnd();
    await ta.pressSequentially(' @zzz');
    await page.waitForFunction(() => window.__filesQueries.includes('zzz'), null, {
      timeout: 5000,
    });
    await page.waitForTimeout(300);
    await ta.press('Enter');
    await page.waitForTimeout(400);
    const draftAfterZero = await draft();
    const state = await page.evaluate(() => window.__dumpState());
    if (draftAfterZero !== 'look at @zzz')
      throw new Error(
        `Enter with zero matches was not a no-op: draft=${JSON.stringify(draftAfterZero)}`,
      );
    if (await sentHas('look at'))
      throw new Error('Enter submitted the draft with zero file matches');
    if (!state.refs.some((ref) => ref.path === 'src/index.ts'))
      throw new Error('earlier pick reference disappeared');
    results.push({ case: 'Enter with zero matches is a no-op', status: 'passed' });

    if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
    process.stdout.write(`${JSON.stringify({ passed: true, results })}\n`);
  } finally {
    await page.close();
    await context.close();
    await server.close();
  }
} finally {
  await browser.close();
}
