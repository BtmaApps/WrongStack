import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { i18n } from '/src/i18n/index.ts';
import { GoalView } from '/src/components/GoalView.tsx';
import { GoalPanel } from '/src/components/GoalPanel.tsx';
import { useGoalRunStore, useGoalStateStore, useConfigStore } from '/src/stores/index.ts';
import { getWSClient } from '/src/lib/ws-client.ts';
window.__sent = [];
await i18n.changeLanguage('en');
await i18n.loadNamespaces('activity');
const client = getWSClient(useConfigStore.getState().wsUrl);
client.send = (message) => { window.__sent.push(message); return true; };
useGoalRunStore.getState().setState({
  graphId: 'saved-goal', title: 'Resume browser proof', status: 'stopped',
  phases: [{ id: 'phase-1', name: 'Build', status: 'paused', percent: 30, tasks: [] }],
  graphs: [{ id: 'saved-goal', title: 'Resume browser proof', updatedAt: Date.now(), status: 'in_progress' }],
});
useGoalStateStore.getState().setGoal({ goal: 'Ship the mission', missionId: 'mission-1', goalState: 'active' });
useGoalStateStore.getState().setRefining('mission-1', true);
function App() {
  const goal = useGoalStateStore((state) => state.goal);
  const refining = useGoalStateStore((state) => state.refiningMissionId !== null);
  return React.createElement('div', { style: { height: '100dvh', display: 'flex', flexDirection: 'column' } },
    React.createElement('div', { style: { flex: 1, minHeight: 0 } }, React.createElement(GoalView, { onClose: () => {} })),
    React.createElement('div', { style: { maxHeight: 160, overflow: 'auto' } }, React.createElement(GoalPanel, { goal, refining })));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
`;
const virtualId = 'virtual:goal-browser-smoke';
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'goal-browser-smoke',
      resolveId: (id) => (id === virtualId ? `\0${virtualId}.tsx` : undefined),
      load: (id) => (id === `\0${virtualId}.tsx` ? source : undefined),
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__goal_smoke') return next();
          const html = await vite.transformIndexHtml(
            req.url,
            `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`,
          );
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const address = server.httpServer.address();
  const output = path.resolve(root, '../../.reports/goal-review');
  await mkdir(output, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [390, 300],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/__goal_smoke`);
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    await expect(page.getByText('Refining mission…', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => window.__sent.find((message) => message.type === 'goal.resume')?.payload.graphId,
      ),
      'saved-goal',
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, `goal-${width}x${height}.png`) });
    console.log(
      `PASS ${width}x${height}: saved-run resume, refining state, no overflow or page errors`,
    );
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
