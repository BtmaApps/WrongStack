import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// Run with: node packages/webui/tests/page-scroll-browser-smoke.mjs
// Real routed components + compiled CSS: jsdom cannot test scroll geometry.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const virtualId = 'virtual:page-scroll-browser-smoke';
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { i18n } from '/src/i18n/index.ts';
import { MainViewSlot } from '/src/components/MainViewSlot.tsx';
import { useChimeraHubStore } from '/src/stores/chimera-hub-store.ts';
import { getWSClient } from '/src/lib/ws-client.ts';
await i18n.changeLanguage('en');
await i18n.loadNamespaces(['activity', 'common']);
const client = getWSClient();
client.send = () => true;
const now = '2026-09-20T12:00:00.000Z';
const token = 'long-token-' + 'X'.repeat(140);
const report = {
  id: 'scroll-report', sessionId: 'scroll-session', reviewedAt: now,
  agentId: 'chimera', reviewerModel: 'test-model', source: 'chimera',
  reviewStatus: 'success', lifecycle: 'open', files: [],
  counts: { critical: 0, high: 24, medium: 0, low: 0 }, totalFindings: 24,
  unparseableCount: 0, cascadeDepth: 0,
  rawText: ('Raw report paragraph with words that wrap. '.repeat(10) + '\\n').repeat(30) + token,
};
const detail = {
  report,
  findings: Array.from({ length: 24 }, (_, i) => ({ finding: {
    id: 'finding-' + i, fingerprint: 'fp-' + i, severity: 'high', source: 'chimera',
    location: { file: 'src/scroll.ts', line: i + 1 }, title: 'Scroll finding ' + i,
    description: 'Finding description. '.repeat(25) + token,
    suggestedFix: 'Suggested fix: ' + token, createdAt: now, status: 'active',
    originReport: { reportId: report.id, sessionId: report.sessionId, agentId: 'chimera', reviewerModel: 'test-model' },
  }, events: [] })),
  events: Array.from({ length: 30 }, (_, i) => ({
    id: 'event-' + i, reportId: report.id, eventType: 'created',
    fromLifecycle: null, toLifecycle: 'open', actorId: 'chimera', actorKind: 'system',
    timestamp: now, reason: 'Journal reason ' + i + ' ' + 'Long journal note. '.repeat(10) + token,
  })),
};
useChimeraHubStore.setState({
  reports: Array.from({ length: 12 }, (_, i) => ({
    reportId: i === 0 ? report.id : 'report-' + i, sessionId: report.sessionId,
    reviewedAt: now, reviewerModel: 'test-model', source: 'chimera',
    reviewStatus: 'success', lifecycleStatus: 'open', counts: report.counts,
    totalFindings: 24, hasActionableFindings: true,
  })),
  selectedReportId: null, detail: null, loading: false, detailLoading: false, error: null,
  selectReport: (id) => useChimeraHubStore.setState({ selectedReportId: id, detail }),
});
// Feed the real PromptJournal subscription without a live backend.
const originalOn = client.on.bind(client);
client.on = (type, handler) => {
  if (type === 'prompts.journal') queueMicrotask(() => handler({ payload: {
    enabled: true,
    entries: Array.from({ length: 40 }, (_, i) => ({
      id: 'prompt-' + i, timestamp: now, category: 'raw_user', sessionId: 'scroll-session',
      content: 'Scroll prompt ' + i + ': ' + 'A lengthy user request. '.repeat(20),
      metadata: { tokenEstimate: 100 },
    })),
  } }));
  return originalOn(type, handler);
};
const view = new URLSearchParams(location.search).get('view') || 'chimera';
// Same bounded flex chain as App > ViewRouter > MainViewSlot. Include chrome
// so the page receives less than the full viewport, as in the application.
createRoot(document.getElementById('root')).render(
  React.createElement('div', { className: 'ws-app-root flex min-h-0 min-w-0 overflow-hidden' },
    React.createElement('main', { className: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' },
      React.createElement('div', { className: 'h-12 shrink-0' }, 'Workbench chrome'),
      React.createElement('div', { className: 'relative flex min-h-0 min-w-0 flex-1 flex-col' },
        React.createElement(MainViewSlot, { view, onCloseToChat: () => {} }),
      ),
    ),
  )
);
`;

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'page-scroll-browser-smoke',
      resolveId: (id) => (id === virtualId ? `\0${virtualId}.tsx` : undefined),
      load: (id) => (id === `\0${virtualId}.tsx` ? source : undefined),
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url?.split('?')[0] !== '/__page_scroll_smoke') return next();
          const html = await vite.transformIndexHtml(
            req.url,
            `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`,
          );
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        });
      },
    },
  ],
});

async function scrollOwner(locator) {
  const handle = await locator.elementHandle();
  assert(handle, 'Scroll anchor must exist');
  return (
    await handle.evaluateHandle((node) => {
      for (let el = node.parentElement; el; el = el.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
      }
      throw new Error('No scroll owner for ' + node.textContent?.slice(0, 60));
    })
  ).asElement();
}

async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  assert(
    await locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (
        r.height <= 0 ||
        r.width <= 0 ||
        r.top < -1 ||
        r.bottom > innerHeight + 1 ||
        r.left < -1 ||
        r.right > innerWidth + 1
      )
        return false;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const p = parent.getBoundingClientRect();
        if (
          /auto|scroll|hidden|clip/.test(style.overflowY) &&
          (r.top < p.top - 1 || r.bottom > p.bottom + 1)
        )
          return false;
      }
      return true;
    }),
    `Content is clipped: ${await locator.textContent()}`,
  );
}

async function wheelScrolls(page, anchor) {
  await reachable(anchor);
  const owner = await scrollOwner(anchor);
  assert(owner);
  await owner.evaluate((el) => {
    el.scrollTop = 0;
  });
  const dimensions = await owner.evaluate((el) => ({
    height: el.clientHeight,
    total: el.scrollHeight,
  }));
  assert(
    dimensions.height > 24 && dimensions.total > dimensions.height,
    JSON.stringify(dimensions),
  );
  const box = await owner.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(100, box.height / 2));
  await page.mouse.wheel(0, 300);
  await expect.poll(() => owner.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
}

let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/__page_scroll_smoke`;
  browser = await chromium.launch({ headless: true });
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 600],
    [390, 600],
    [320, 568],
  ]) {
    for (const view of ['chimera', 'prompts']) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(`${url}?view=${view}`);
        if (view === 'chimera') {
          await page.getByRole('button').filter({ hasText: 'scroll-repor' }).click();
          await wheelScrolls(
            page,
            page.getByRole('heading', { name: 'Findings (24)', exact: true }),
          );
          await reachable(page.getByRole('heading', { name: 'Scroll finding 23', exact: true }));
          const raw = page.getByRole('button', { name: 'Raw Report Markdown', exact: true });
          await raw.click();
          await reachable(raw);
          const pre = page.locator('pre').filter({ hasText: 'Raw report paragraph' });
          await expect(pre).toBeVisible();
          await pre.evaluate((el) => el.scrollIntoView({ block: 'end' }));
          assert(
            await pre.evaluate((el) => {
              const r = el.getBoundingClientRect();
              return r.bottom <= innerHeight + 1 && r.bottom > 0;
            }),
            'Raw report bottom must be reachable',
          );
          // Desktop journal is independent; stacked layouts intentionally share
          // the detail owner. Wheel proof above exercises that shared owner.
          const journal = page.getByRole('heading', { name: 'Activity Journal', exact: true });
          if (width >= 1024) await wheelScrolls(page, journal);
          await reachable(journal);
          await reachable(page.getByRole('button', { name: 'Append to Journal', exact: true }));
          await wheelScrolls(page, page.getByText('Reports (12)', { exact: true }));
          await reachable(page.getByRole('button').filter({ hasText: 'report-11' }));
        } else {
          const first = page.getByRole('button').filter({ hasText: 'Scroll prompt 39:' });
          const last = page.getByRole('button').filter({ hasText: 'Scroll prompt 0:' });
          await wheelScrolls(page, first);
          await reachable(last);
        }
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          'Document overflows horizontally',
        );
        assert.deepEqual(errors, [], 'No browser runtime errors');
        console.log(`PASS ${view} ${width}x${height}: wheel, tail reachability, overflow`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
