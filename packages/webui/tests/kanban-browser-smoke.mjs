import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// Real React components, stores, CSS and outbound client. The transport is
// recorded locally; this harness never changes the user's boards or sessions.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { i18n } from '/src/i18n/index.ts';
import { KanbanView } from '/src/components/KanbanView.tsx';
import { TodosPanel } from '/src/components/TodosPanel.tsx';
import { ensureSessionLane, setActiveSessionLane } from '/src/stores/session-lanes.ts';
import { useSessionStore, useConfigStore } from '/src/stores/index.ts';
import { useKanbanStore } from '/src/stores/kanban-store.ts';
import { getWSClient } from '/src/lib/ws-client.ts';
window.__sent = [];
await i18n.changeLanguage('en');
await i18n.loadNamespaces('activity');
const client = getWSClient(useConfigStore.getState().wsUrl);
client.send = (message) => { window.__sent.push(message); return true; };
const now = '2026-09-15T00:00:00.000Z';
const board = {
  id: 'smoke-board', title: 'Browser review board', createdAt: now, updatedAt: now,
  columns: [{ id: 'todo', title: 'To Do', order: 0 }, { id: 'done', title: 'Done', order: 1 }],
  tasks: [{ id: 'card', title: 'Review Kanban card', description: 'Check task details', status: 'ready', columnId: 'todo', order: 0, priority: 'medium', createdAt: now, updatedAt: now }]
};
useKanbanStore.setState({ boards: [{ ...board, columnCount: 2, taskCount: 1, completedTaskCount: 0 }], boardTotal: 1, activeBoardTotal: 1, activeBoardId: board.id, activeBoard: board });
window.__session = (id) => {
  ensureSessionLane(id);
  setActiveSessionLane(id);
  useSessionStore.getState().setTodos([{ id: 'todo', content: id + ' work', status: 'pending' }]);
};
window.__session('session-a');
const view = createRoot(document.getElementById('root'));
window.__show = (kind) => view.render(kind === 'todos'
  ? React.createElement(TodosPanel)
  : React.createElement('div', { style: { height: '100dvh', width: '100%', overflow: 'hidden' } }, React.createElement(KanbanView)));
window.__show('board');
`;
const virtualId = 'virtual:kanban-browser-smoke';
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'kanban-browser-smoke',
      resolveId: (id) => (id === virtualId ? `\0${virtualId}.tsx` : undefined),
      load: (id) => (id === `\0${virtualId}.tsx` ? source : undefined),
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__kanban_smoke') return next();
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
  const output = path.resolve(root, '../../.reports/kanban-review');
  await mkdir(output, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [390, 300],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/__kanban_smoke`);
    await expect(page.getByText('Review Kanban card', { exact: true }).last()).toBeVisible();
    for (const name of ['Tree', 'Contract Map', 'Verification', 'Focus', 'Board']) {
      await page.getByRole('button', { name, exact: true }).click();
    }
    await page.screenshot({ path: path.join(output, `board-${width}x${height}.png`) });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Board overflows viewport horizontally',
    );
    await page.getByRole('button', { name: 'Delete board', exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.__sent.filter((m) => m.type === 'kanban.delete').length),
      0,
    );
    await page.getByRole('button', { name: 'Confirm?', exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => window.__sent.find((m) => m.type === 'kanban.delete')?.payload.boardId,
      ),
      'smoke-board',
    );
    await page.evaluate(() => window.__show('todos'));
    await expect(page.getByText('session-a work', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: /session-a work/ })
      .first()
      .click();
    assert.equal(
      await page.evaluate(
        () => window.__sent.find((m) => m.type === 'todo.update')?.payload.sessionId,
      ),
      'session-a',
    );
    await page.evaluate(() => window.__session('session-b'));
    await expect(page.getByText('session-b work', { exact: true })).toBeVisible();
    await expect(page.getByText('session-a work', { exact: true })).toHaveCount(0);
    await page
      .getByRole('button', { name: /session-b work/ })
      .first()
      .click();
    assert.equal(
      await page.evaluate(
        () => window.__sent.filter((m) => m.type === 'todo.update').at(-1)?.payload.sessionId,
      ),
      'session-b',
    );
    await page.screenshot({ path: path.join(output, `todos-${width}x${height}.png`) });
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}x${height}: five views, deletion guard, todo action session isolation, no page errors`,
    );
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
