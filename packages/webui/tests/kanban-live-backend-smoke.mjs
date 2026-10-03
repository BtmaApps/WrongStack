import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { build, stop as stopBuild } from 'esbuild';
import { createServer } from 'vite';

// Isolated real routes/session journal/IPC/SQLite. No app records or services are changed.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webRoot, '../..');
const initialHandles = new Set(process._getActiveHandles());
const backendRequire = createRequire(path.join(repoRoot, 'packages/webui-server/package.json'));
function backendPackagePath(name) {
  if (name === 'ws') {
    const manifestPath = backendRequire.resolve('ws/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return path.resolve(path.dirname(manifestPath), manifest.exports['.'].import);
  }
  if (!name.startsWith('@wrongstack/')) return backendRequire.resolve(name);
  const [, packageName, ...subpath] = name.split('/');
  const packageRoot = path.join(
    repoRoot,
    'packages/webui-server/node_modules/@wrongstack',
    packageName,
  );
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const entry = manifest.exports[subpath.length ? `./${subpath.join('/')}` : '.'];
  const target = typeof entry === 'string' ? entry : (entry?.import ?? entry?.default);
  assert.equal(typeof target, 'string', `Missing ESM backend export ${name}`);
  return path.resolve(packageRoot, target);
}
const loadBackend = (name) => import(pathToFileURL(backendPackagePath(name)).href);
const [{ Context }, { DefaultSessionStore }, kanban, { todoTool }, { protocolAdvertisement }] =
  await Promise.all([
    loadBackend('@wrongstack/core'),
    loadBackend('@wrongstack/core/storage'),
    loadBackend('@wrongstack/kanban'),
    loadBackend('@wrongstack/tools'),
    loadBackend('@wrongstack/webui-protocol'),
  ]);
const { WebSocketServer } = backendRequire('ws');
const fixtureRoot = await mkdtemp(path.join(repoRoot, '.temp_files/kanban-live-browser-'));
const output = path.join(repoRoot, '.reports/kanban-review/live');
const command = promisify(execFile);
const git = (...args) => command('git', args, { cwd: fixtureRoot, windowsHide: true });
process.env.WRONGSTACK_KANBAN_SERVER_IDLE_MS = '1000';
await mkdir(output, { recursive: true });
await writeFile(path.join(fixtureRoot, '.gitignore'), '.wrongstack/\nbackend.mjs\n');
await writeFile(path.join(fixtureRoot, 'work.ts'), 'export const answer = 1;\n');
await git('init');
await git('add', '.');
await git(
  '-c',
  'user.name=Kanban audit',
  '-c',
  'user.email=audit@example.invalid',
  '-c',
  'commit.gpgsign=false',
  'commit',
  '-m',
  'isolated live browser fixture',
);

// Bundle the actual route leaves so source edits are exercised without booting unrelated services.
const backend = await build({
  stdin: {
    contents: `
    export { handleKanbanRoute } from './packages/webui-server/src/server/kanban-routes.ts';
    export { handleWorklistMessage } from './packages/webui-server/src/server/handlers/worklist-handlers.ts';
    export { send } from './packages/webui-server/src/server/ws-utils.ts';
    export { verifyClient as verifyWsClient } from './packages/webui-server/src/server/ws-auth.ts';
  `,
    resolveDir: repoRoot,
    sourcefile: 'kanban-live-backend-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  write: false,
  plugins: [
    {
      name: 'backend-package-exports',
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('node:')) return undefined;
          return { path: pathToFileURL(backendPackagePath(args.path)).href, external: true };
        });
      },
    },
  ],
});
await writeFile(path.join(fixtureRoot, 'backend.mjs'), backend.outputFiles[0].text);
const { handleKanbanRoute, handleWorklistMessage, send, verifyWsClient } = await import(
  pathToFileURL(path.join(fixtureRoot, 'backend.mjs')).href
);
const sessions = new DefaultSessionStore({ dir: path.join(fixtureRoot, '.wrongstack/sessions') });
const writer = await sessions.create({
  id: '',
  title: 'Isolated Kanban browser proof',
  model: 'offline',
  provider: 'offline',
});
const signal = new AbortController().signal;
const context = new Context({
  systemPrompt: [],
  provider: { id: 'offline', capabilities: { maxContext: 4096 } },
  session: writer,
  signal,
  tokenCounter: { countTokens: (value) => Math.ceil(String(value).length / 4) },
  cwd: fixtureRoot,
  projectRoot: fixtureRoot,
  model: 'offline',
  agentId: 'fixture-worker',
  agentName: 'Fixture worker',
});
const board = await kanban.createBoard(fixtureRoot, {
  title: 'Live Kanban acceptance',
  lifecycle: { ...kanban.createManagedLifecyclePolicy(), autoAccept: false },
  completionGate: { enforcement: 'strict' },
});
context.currentKanbanBoardId = board.id;
await todoTool.execute(
  { todos: [{ id: 'live-todo', content: 'Live verification task', status: 'pending' }] },
  context,
  { signal },
);
const created = (await kanban.getBoard(fixtureRoot, board.id)).tasks[0];
assert.ok(
  created && context.todos[0]?.kanbanTaskId === created.id,
  'todo must bind to a real managed card',
);
const event = { sessionId: writer.id, actor: 'isolated-browser-fixture' };
await kanban.updateTask(
  fixtureRoot,
  board.id,
  created.id,
  {
    description: 'Verify the real session, todo, card and evidence chain.',
    dueDate: '2026-12-31T00:00:00Z',
    assignee: 'Fixture worker',
    labels: ['browser-proof'],
    childTaskIds: [],
    expectedFileChanges: [{ path: 'work.ts', operation: 'modify' }],
    successCriteria: [
      {
        id: 'file-check',
        type: 'file_exists',
        description: 'Work file exists',
        notes: 'work.ts',
        status: 'pending',
      },
    ],
  },
  event,
);
await kanban.assignTask(
  fixtureRoot,
  board.id,
  created.id,
  {
    agentId: 'fixture-worker',
    name: 'Fixture worker',
    status: 'running',
    leaseId: 'fixture-lease',
    attempt: 1,
    claimedAt: new Date().toISOString(),
    leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(),
  },
  event,
);
await kanban.heartbeatTaskAssignment(
  fixtureRoot,
  board.id,
  created.id,
  { expectedLeaseId: 'fixture-lease' },
  event,
);

let wsPort;
const virtualId = 'virtual:kanban-live-browser';
const source = () => `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { i18n } from '/src/i18n/index.ts';
import { KanbanView } from '/src/components/KanbanView.tsx';
import { TodosPanel } from '/src/components/TodosPanel.tsx';
import { ensureSessionLane, setActiveSessionLane } from '/src/stores/session-lanes.ts';
import { useSessionStore, useConfigStore } from '/src/stores/index.ts';
import { useKanbanStore } from '/src/stores/kanban-store.ts';
import { WS_HANDLERS } from '/src/hooks/ws-handlers.ts';
import { getWSClient } from '/src/lib/ws-client.ts';
await i18n.changeLanguage('en'); await i18n.loadNamespaces('activity');
const wsUrl = 'ws://127.0.0.1:${wsPort}/__kanban_ws';
useConfigStore.setState({ wsUrl });
ensureSessionLane(${JSON.stringify(writer.id)}); setActiveSessionLane(${JSON.stringify(writer.id)});
const client = getWSClient(wsUrl);
window.__received = [];
for (const [type, handler] of Object.entries(WS_HANDLERS)) {
  if (type.startsWith('kanban.') || type === 'todos.updated') client.on(type, (message) => { window.__received.push(message); handler(message); });
}
window.__send = (type, payload = {}) => client.send({ type, payload: { ...payload, sessionId: ${JSON.stringify(writer.id)} } });
window.__state = () => ({ board: useKanbanStore.getState().activeBoard, todos: useSessionStore.getState().todos, error: useKanbanStore.getState().error, recent: window.__received.slice(-5) });
const view = createRoot(document.getElementById('root'));
window.__show = (kind) => view.render(kind === 'todos' ? React.createElement(TodosPanel)
  : React.createElement('div', { style: { height: '100dvh', overflow: 'hidden' } }, React.createElement(KanbanView)));
await client.connect();
useKanbanStore.getState().setActiveBoardId(${JSON.stringify(board.id)});
window.__send('kanban.get', { boardId: ${JSON.stringify(board.id)} });
window.__show('board');
`;
const server = await createServer({
  root: webRoot,
  configFile: path.join(webRoot, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'kanban-live-browser',
      resolveId: (id) => (id === virtualId ? `\0${virtualId}.tsx` : undefined),
      load: (id) => (id === `\0${virtualId}.tsx` ? source() : undefined),
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url !== '/__kanban_live') return next();
          response.setHeader('Content-Type', 'text/html');
          response.end(
            await vite.transformIndexHtml(
              request.url,
              `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/${virtualId}"></script></body></html>`,
            ),
          );
        });
      },
    },
  ],
});
const routeErrors = [];
const messages = [];
const pendingRoutes = new Set();
const wss = new WebSocketServer({
  noServer: true,
  verifyClient: (info) =>
    verifyWsClient({
      origin: info.origin,
      url: info.req.url,
      hostHeader: info.req.headers.host,
      remoteAddress: info.req.socket.remoteAddress,
      cookieHeader: info.req.headers.cookie,
      wsHost: '127.0.0.1',
      expectedToken: 'isolated-fixture',
      requireToken: false,
    }),
});
server.httpServer.on('upgrade', (request, socket, head) => {
  if (request.url?.split('?')[0] !== '/__kanban_ws') return;
  wss.handleUpgrade(request, socket, head, (connection) =>
    wss.emit('connection', connection, request),
  );
});
const broadcast = (message) => {
  for (const client of wss.clients) send(client, message);
};
wss.on('connection', (socket) => {
  send(socket, {
    type: 'session.start',
    payload: { sessionId: writer.id, ...protocolAdvertisement() },
  });
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    messages.push(message.type);
    const request = (async () => {
      if (message.type.startsWith('kanban.')) {
        await handleKanbanRoute(socket, message, { projectRoot: fixtureRoot, context, broadcast });
        return;
      }
      if (
        message.type.startsWith('todo') ||
        message.type === 'tasks.get' ||
        message.type === 'plan.get'
      ) {
        await handleWorklistMessage(
          {
            context,
            send,
            broadcast,
            replaceTodos: (todos) => context.replaceTodos(todos),
            mutateTodos: async (todos) => {
              const result = await todoTool.execute({ todos }, context, { signal });
              return { todos: context.todos, warnings: result.kanban_warnings ?? [] };
            },
          },
          socket,
          message,
        );
      }
    })()
      .catch((error) => {
        routeErrors.push(error.stack);
        send(socket, { type: 'error', payload: { message: error.message } });
      })
      .finally(() => pendingRoutes.delete(request));
    pendingRoutes.add(request);
  });
});
let browser;
let page;
const browserErrors = [];
const consoleErrors = [];
try {
  await server.listen();
  wsPort = server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && consoleErrors.length < 10) consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${wsPort}/__kanban_live`);
  await expect(page.getByText(created.title, { exact: true }).last()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: `Select task: ${created.title}`, exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Execution', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Execution', exact: true }).click();
  for (const stage of ['todo', 'running']) {
    await page.getByLabel(/progress comment/i).fill(`Browser advances to ${stage}`);
    await page.getByRole('button', { name: `Advance to ${stage}`, exact: true }).click();
    await expect
      .poll(
        async () => (await kanban.getBoard(fixtureRoot, board.id)).tasks[0].lifecycle.currentStage,
      )
      .toBe(stage);
  }
  await writeFile(path.join(fixtureRoot, 'work.ts'), 'export const answer = 42;\n');
  await kanban.updateTaskAssignment(
    fixtureRoot,
    board.id,
    created.id,
    { status: 'completed', lastResult: 'Updated tracked file; ready for reviewer.' },
    { ...event, expectedLeaseId: 'fixture-lease' },
  );
  await page.evaluate(({ boardId }) => window.__send('kanban.get', { boardId }), {
    boardId: board.id,
  });
  await page.getByLabel(/progress comment/i).fill('Worker output is ready for review');
  await page.getByRole('button', { name: 'Advance to review', exact: true }).click();
  await expect
    .poll(async () => (await kanban.getBoard(fixtureRoot, board.id)).tasks[0].status)
    .toBe('review');
  await page.evaluate(() => window.__show('todos'));
  await expect(page.getByRole('heading', { name: 'Todos', exact: true })).toBeVisible();
  assert.equal(
    await page.evaluate(() => window.__state().todos[0].status),
    'in_progress',
    'Review must remain open work',
  );
  await page.evaluate(() => window.__show('board'));
  await page.getByRole('button', { name: `Select task: ${created.title}`, exact: true }).click();
  await page.getByRole('tab', { name: /^Evidence/ }).click();
  await page.getByRole('button', { name: 'Run verification', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await kanban.getBoard(fixtureRoot, board.id)).tasks[0].verificationReport?.verdict,
    )
    .toBe('passed');
  await expect(
    page.getByRole('button', { name: 'Re-run verification', exact: true }),
  ).toBeVisible();
  const verified = (await kanban.getBoard(fixtureRoot, board.id)).tasks[0];
  assert.equal(verified.status, 'review');
  assert.equal(verified.verificationReport.fileScope.scopeMatches, true);
  assert.match(verified.verificationReport.inputFingerprint, /^[a-f0-9]{64}$/);
  await expect(page.getByText('Persist at least one child task', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: path.join(output, 'review-evidence.png') });
  await page.getByRole('tab', { name: 'Execution', exact: true }).click();
  await page
    .getByLabel(/completed action/i)
    .fill('Reviewed file-scope evidence and accepted the implementation');
  await page.getByLabel(/progress comment/i).fill('Reviewer accepts the current verified contract');
  await page.getByRole('button', { name: 'Advance to done', exact: true }).click();
  await expect
    .poll(async () => (await kanban.getBoard(fixtureRoot, board.id)).tasks[0].status)
    .toBe('completed');
  const accepted = (await kanban.getBoard(fixtureRoot, board.id)).tasks[0];
  assert.equal(accepted.lifecycle.currentStage, 'done');
  assert.ok(
    accepted.lifecycle.history.some(
      (transition) => transition.to === 'done' && transition.action.includes('Reviewed'),
    ),
  );
  assert.equal(
    context.todos.length,
    0,
    'Accepted final todo should clear from the active worklist',
  );
  await page.screenshot({ path: path.join(output, 'accepted-done.png') });
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(routeErrors, []);
  await writeFile(
    path.join(fixtureRoot, 'result.json'),
    JSON.stringify(
      {
        ok: true,
        messages,
        boardId: board.id,
        taskId: created.id,
        sessionId: writer.id,
        screenshots: output,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      ok: true,
      fixtureRoot,
      transport: 'real browser WebSocket -> production routes -> IPC -> SQLite',
      sessionJournal: true,
      todoBoundToCard: true,
      reviewKeptOpen: true,
      verifiedFileScope: true,
      doneAcceptedWithAudit: true,
      completedTodoCleared: true,
      screenshots: output,
    }),
  );
} catch (error) {
  const state = await page?.evaluate(() => window.__state?.()).catch(() => null);
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await writeFile(
    path.join(fixtureRoot, 'failure.json'),
    JSON.stringify(
      { browserErrors, consoleErrors, routeErrors, messages, state, error: error.stack },
      null,
      2,
    ),
  );
  console.error(JSON.stringify({ browserErrors, consoleErrors, routeErrors, messages, state }));
  throw error;
} finally {
  await browser?.close();
  for (const socket of wss.clients) socket.terminate();
  await new Promise((resolve) => wss.close(resolve));
  await server.close();
  await Promise.allSettled([...pendingRoutes]);
  await stopBuild();
  await writer.close();
  await sessions.dispose();
  await context.drainAgentHooks();
  const connection = await kanban.getKanbanServerConnection(fixtureRoot).catch(() => null);
  if (connection)
    await connection
      .request('shutdown', { reason: 'isolated browser proof completed' })
      .catch(() => {});
  kanban.closeKanbanServerConnections();
  // Close only sockets created by this isolated host, including dependency pools.
  for (const handle of process._getActiveHandles()) {
    if (
      initialHandles.has(handle) ||
      handle === process.stdin ||
      handle === process.stdout ||
      handle === process.stderr
    )
      continue;
    if (handle.constructor.name === 'Socket' && typeof handle.destroy === 'function')
      handle.destroy();
  }
}
