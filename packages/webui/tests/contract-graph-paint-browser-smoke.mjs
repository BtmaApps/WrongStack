import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

// Run with: node packages/webui/tests/contract-graph-paint-browser-smoke.mjs
// jsdom cannot verify actual paint: real-chromium computed-style probe for
// (1) the color-mix() viz tints (exact KanbanContractGraphView nodeStyle()
// expressions), (2) the ws-dialog warm-ink shadow swap vs stock tiers,
// (3) the coarse ws-touch-target hit area at the REAL SessionTabBar close-X
// class sizes (16px fine / 24px coarse floor), and (4) the real
// SessionStoryView header render (operator-manual restyle) in light/dark at
// desktop + narrow width with focus and overflow checks.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Harness shims mirroring tests/components/session-story-view.test.tsx so the
// REAL components mount without a backend.
const wsStub = `
const handlers = new Map();
export const client = {
  supportsCapability: () => true,
  send: (m) => { window.__lastSend = m; return true; },
  on: (type, handler) => { handlers.set(type, handler); return () => handlers.delete(type); },
  off: (type) => handlers.delete(type),
};
window.__chronicleReply = (requestId, events) => handlers.get('chronicle.query_result')?.({
  type: 'chronicle.query_result',
  payload: { requestId, events, total: events.length, summary: {} },
});
window.__lastChronicleQuery = () => handlers.has('chronicle.query');
export default client;
`;
const storesStub = `
export const useActiveSessionId = () => 'probe-session';
export const useSessionStore = (selector) =>
  selector({ session: { id: 'probe-session', startedAt: Date.parse('2026-10-02T12:00:00Z') } });
export const useChatLanes = () => ({});
export const useFleetStore = (selector) => selector({});
export const useMailboxStore = (selector) => selector({});
export const useMemoryInjectorTraceStore = (selector) => selector({});
export const useUIStore = (selector) => selector({});
export const useConfigStore = (selector) => selector({});
`;
const shimPlugin = {
  name: 'paint-probe-shims',
  enforce: 'pre',
  resolveId(id) {
    if (id.endsWith('@/lib/ws-client')) return 'virtual:ws-client-stub';
    if (id.endsWith('@/stores')) return 'virtual:stores-stub';
    return null;
  },
  load(id) {
    if (id === 'virtual:ws-client-stub') return wsStub;
    if (id === 'virtual:stores-stub') return storesStub;
    if (id === 'virtual:story-mount') {
      return `import React from 'react';
import { createRoot } from 'react-dom/client';
import { SessionStoryView } from '/src/components/SessionStoryView.tsx';
import { i18n } from '/src/i18n/index.ts';
await i18n.changeLanguage('en');
await i18n.loadNamespaces(['activity', 'common']);
createRoot(document.getElementById('story-root')).render(React.createElement(SessionStoryView));
window.__storyMounted = true;`;
    }
    return null;
  },
};

const server = await createServer({
  root,
  server: { port: 0 },
  logLevel: 'error',
  plugins: [shimPlugin],
});
await server.listen();
const base = server.resolvedUrls.local[0];

const browser = await chromium.launch();
// Follow-up 1 recipe: hasTouch at context creation + emulateMedia pointer:coarse.
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, hasTouch: true });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(base);

const inject = `<!doctype html><html class="light"><body>
  <div id="paint">
    <div id="tint" style="background: color-mix(in srgb, var(--color-viz-1) 14%, transparent)"></div>
    <div id="glow" style="box-shadow: 0 0 12px 0 color-mix(in srgb, var(--color-viz-1) 9%, transparent)"></div>
    <div id="chip" style="background: linear-gradient(135deg, var(--color-viz-1), var(--color-viz-1-deep)); color: var(--color-viz-ink)">n</div>
    <div id="dialog" class="ws-dialog"></div>
    <div id="tier" class="shadow-lg"></div>
    <div id="stock" class="shadow-2xl"></div>
  </div>
  <div id="story-root"></div>
  <div id="clip" style="overflow: hidden; height: 28px; width: 200px">
    <button id="xbtn" class="ws-touch-target h-4 w-4 pointer-coarse:min-h-6 pointer-coarse:min-w-6" style="border: 0; padding: 0; background: #888"></button>
  </div>
</body></html>`;

await page.setContent(inject);
await page.addStyleTag({ url: `${base}src/index.css?direct` });
await page.waitForFunction(
  () => getComputedStyle(document.documentElement).getPropertyValue('--color-viz-1').trim() !== '',
);

// Mount the real SessionStoryView via the virtual mount module (react resolved
// by Vite; stores/ws shimmed by the plugin).
await page.evaluate((u) => import(u), `${base}@id/virtual:story-mount`);
await page.waitForSelector('[data-testid="session-story"]', { timeout: 20000 });

const readPaint = () =>
  page.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const parse = (c) => {
      const rgb = c
        .match(/rgba?\(([^)]+)\)/)?.[1]
        .split(',')
        .map(Number);
      if (rgb) return rgb;
      // Chromium serializes color-mix() as color(srgb r g b / a)
      const srgb = c
        .match(/color\(srgb ([^)]+)\)/)?.[1]
        .split(/[\s/]+/)
        .map(Number);
      return srgb ?? null;
    };
    const btn = document.querySelector('#xbtn');
    const r = btn.getBoundingClientRect();
    // Follow-up 1 constraint: the overflow ancestor clips vertical pseudo
    // expansion, so probe horizontally (pseudo extends -6px) and record the
    // button's own coarse floor size.
    const below = document.elementFromPoint(r.x + r.width + 2, r.y + r.height / 2);
    const belowClipped = document.elementFromPoint(r.x + r.width / 2, r.y + r.height + 6);
    return {
      tint: parse(cs('#tint').backgroundColor),
      glow: cs('#glow').boxShadow,
      chipBg: cs('#chip').backgroundImage,
      dialog: cs('#dialog').boxShadow,
      tier: cs('#tier').boxShadow,
      stock: cs('#stock').boxShadow,
      coarse: matchMedia('(pointer: coarse)').matches,
      hitBelow: below === btn,
      hitBelowClipped: belowClipped === btn,
      btnSize: { w: r.width, h: r.height },
    };
  });

const story = (width) =>
  page
    .evaluate(async (w) => {
      const root = document.getElementById('story-root').firstElementChild;
      const header = root?.querySelector('header');
      const cs = header ? getComputedStyle(header) : null;
      const h1 = header?.querySelector('h1');
      const doc = document.documentElement;
      const prevOverflow = doc.style.overflow;
      doc.style.overflow = 'hidden';
      const overflow = doc.scrollWidth - doc.clientWidth;
      doc.style.overflow = prevOverflow;
      // keyboard: focus the Back-to-session button
      const back = [...(header?.querySelectorAll('button') ?? [])].find((b) =>
        b.textContent.trim().startsWith('Back'),
      );
      back?.focus();
      return {
        width: w,
        headerBg: cs?.backgroundColor,
        headerBorderBottom: cs?.borderBottomWidth,
        headerRadius: cs?.borderRadius,
        headerGradient: cs?.backgroundImage.includes('gradient'),
        h1Size: h1 ? getComputedStyle(h1).fontSize : null,
        hasPill: Boolean(header?.querySelector('span')),
        backFocused: document.activeElement === back,
        horizontalOverflowPx: overflow,
        text: header?.textContent.slice(0, 120),
      };
    }, width)
    .then((r) => r);

const results = {};
for (const theme of ['light', 'dark']) {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
  results[theme] = { paint: await readPaint(), story: await story(1366) };
}
// Narrow viewport story check (390px) in dark.
await page.setViewportSize({ width: 390, height: 844 });
results.dark.narrowStory = await story(390);
await page.setViewportSize({ width: 1366, height: 900 });
await page.emulateMedia({ pointer: 'coarse' });
results.coarse = await readPaint();
await browser.close();
await server.close();

// --- assertions ---
for (const theme of ['light', 'dark']) {
  const { paint: r, story: s } = results[theme];
  assert.ok(
    r.tint && Math.abs(r.tint[3] - 0.14) < 0.01,
    `${theme}: tint alpha ${JSON.stringify(r.tint)}`,
  );
  assert.ok(/12px/.test(r.glow) && /0\.09\)/.test(r.glow), `${theme}: glow ${r.glow}`);
  assert.ok(r.chipBg.includes('linear-gradient'), `${theme}: chip gradient lost`);
  assert.ok(
    r.dialog.includes('64px') && /rgba\(18, 18, 16, 0\.4\)/.test(r.dialog),
    `${theme}: ws-dialog ${r.dialog}`,
  );
  assert.ok(/rgba\(18, 18, 16, 0\.1\)/.test(r.tier), `${theme}: shadow-lg tier ${r.tier}`);
  assert.ok(/rgba\(18, 18, 16, 0\.25\)/.test(r.stock), `${theme}: shadow-2xl tier`);
  // operator-manual header: opaque card, hairline border, no gradient, 2xl headline
  assert.ok(!s.headerGradient, `${theme}: hero gradient still present`);
  assert.ok(s.headerRadius === '0px', `${theme}: header radius not 0 (${s.headerRadius})`);
  assert.ok(s.h1Size === '24px', `${theme}: headline not text-2xl (${s.h1Size})`);
  assert.ok(s.hasPill, `${theme}: status pill missing`);
  assert.ok(s.backFocused, `${theme}: Back-to-session not keyboard-focusable`);
  assert.ok(
    s.horizontalOverflowPx <= 0,
    `${theme}: horizontal overflow ${s.horizontalOverflowPx}px`,
  );
}
assert.ok(
  results.dark.narrowStory.h1Size === '24px' && results.dark.narrowStory.horizontalOverflowPx <= 0,
  `narrow: ${JSON.stringify(results.dark.narrowStory)}`,
);
assert.ok(results.coarse.coarse, 'coarse emulation inactive');
assert.ok(
  results.coarse.hitBelow,
  `coarse horizontal pseudo probe missed (btn ${JSON.stringify(results.coarse.btnSize)})`,
);
assert.ok(
  results.coarse.btnSize.w >= 24 && results.coarse.btnSize.h >= 24,
  `coarse close-X below 24px floor: ${JSON.stringify(results.coarse.btnSize)}`,
);
assert.ok(
  !results.coarse.hitBelowClipped,
  'vertical expansion unexpectedly escaped the overflow clip',
);

console.log('PAINT PROBE OK');
console.log('story light:', JSON.stringify(results.light.story));
console.log('story dark narrow:', JSON.stringify(results.dark.narrowStory));
console.log(
  'coarse close-X size:',
  JSON.stringify(results.coarse.btnSize),
  '| hit-below:',
  results.coarse.hitBelow,
);
