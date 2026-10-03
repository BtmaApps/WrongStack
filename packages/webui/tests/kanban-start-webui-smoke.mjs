import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

// Manual smoke: full standalone startup, built App, real HTTP/WS/IPC/SQLite.
// No model requests, shared home writes or production process restarts.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureRoot = await mkdtemp(path.join(repo, '.temp_files/kanban-start-webui-'));
const state = path.join(fixtureRoot, '.isolated-home');
const screenshots = path.join(fixtureRoot, 'screenshots');
const initialHandles = new Set(process._getActiveHandles());
process.env.WRONGSTACK_HOME = state;
process.env.WRONGSTACK_KANBAN_SERVER_IDLE_MS = '1000';
const load = (pkg, entry = 'index.js') =>
  import(pathToFileURL(path.join(repo, 'packages', pkg, 'dist', entry)).href);
const kanban = await load('kanban');
const { buildChildEnv } = await load('core', 'utils/index.js');
const command = promisify(execFile);
const git = (...args) => command('git', args, { cwd: fixtureRoot, windowsHide: true });
await mkdir(path.join(state, 'profiles/default'), { recursive: true });
await mkdir(screenshots);
await writeFile(
  path.join(state, 'config.json'),
  JSON.stringify({ version: 1, activeProfile: 'default' }),
);
await writeFile(
  path.join(state, 'profiles/default/config.json'),
  JSON.stringify({
    version: 1,
    provider: 'wrongstack-setup',
    model: 'setup',
    uiLocale: 'en',
    yolo: false,
    features: { modelsRegistry: false, memory: false, mcp: false, plugins: false, skills: false },
  }),
);
await writeFile(
  path.join(fixtureRoot, '.gitignore'),
  '.wrongstack/\n.isolated-home/\nscreenshots/\n*.json\n*.log\n',
);
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
  'isolated full startup fixture',
);

let board, task, port, origin;
const event = { sessionId: 'isolated-startup-seed', actor: 'fixture-worker' };
let server;
let browser;
let page;
let backendOutput = '';
const browserErrors = [];
const stage = { current: 'startup' };
async function startServer() {
  const source = `import { startWebUI } from ${JSON.stringify(pathToFileURL(path.join(repo, 'packages/webui-server/dist/index.js')).href)};
process.on('message', message => { if (message === 'stop') process.emit('SIGTERM'); });
await startWebUI({httpPort:${port},wsHost:'127.0.0.1',accessToken:'isolated-startup-token',requireToken:true,distDir:${JSON.stringify(path.join(repo, 'packages/webui/dist'))},surface:'webui',open:false});`;
  server = spawn(process.execPath, ['--input-type=module', '-e', source], {
    cwd: fixtureRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: buildChildEnv({
      extra: { WRONGSTACK_HOME: state, WRONGSTACK_KANBAN_SERVER_IDLE_MS: '1000' },
    }),
  });
  server.stdout.on('data', (chunk) => {
    backendOutput = (backendOutput + chunk).slice(-80_000);
  });
  server.stderr.on('data', (chunk) => {
    backendOutput = (backendOutput + chunk).slice(-80_000);
  });
  server.on('error', (error) => {
    backendOutput += error.stack;
  });
  await expect
    .poll(
      async () => {
        assert.equal(server.exitCode, null, `Standalone backend exited: ${backendOutput}`);
        return fetch(origin, { headers: { 'x-ws-token': 'isolated-startup-token' } })
          .then((response) => response.ok)
          .catch(() => false);
      },
      { timeout: 60_000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
}
async function stopServer() {
  const owned = server;
  if (!owned || owned.exitCode !== null || owned.signalCode !== null) return;
  if (owned.connected) owned.send('stop');
  const stopped = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 10_000);
    owned.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (!stopped && owned.exitCode === null && owned.signalCode === null) {
    if (process.platform === 'win32')
      await command('taskkill', ['/pid', String(owned.pid), '/T', '/F'], { windowsHide: true });
    else owned.kill('SIGKILL');
  }
}
async function openBoard() {
  await expect(page.getByRole('status', { name: 'Connected', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: 'Kanban', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // Startup replays and persisted navigation can race the first paint. The
  // real button toggles Kanban/Chat, so settle the view before selecting data.
  const navigation = page.getByRole('button', { name: 'Kanban', exact: true });
  const boardInput = page.getByPlaceholder('New board', { exact: true });
  if (!(await boardInput.isVisible())) {
    await navigation.click();
    const opened = await boardInput.waitFor({ state: 'visible', timeout: 3000 }).then(
      () => true,
      () => false,
    );
    if (!opened) await navigation.click();
  }
  await expect(boardInput).toBeVisible();
  await page.getByText(board.title, { exact: true }).first().click();
  await expect(
    page.getByRole('button', { name: `Select task: ${task.title}`, exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: `Select task: ${task.title}`, exact: true }).click();
}
try {
  board = await kanban.createBoard(fixtureRoot, {
    title: 'Standalone Kanban proof',
    lifecycle: { ...kanban.createManagedLifecyclePolicy(), autoAccept: false },
    completionGate: { enforcement: 'strict' },
  });
  const createdTask = await kanban.addTask(
    fixtureRoot,
    board.id,
    {
      title: 'Standalone verified task',
      description: 'Verify full startup and persisted acceptance.',
      assignee: 'Fixture worker',
      dueDate: '2026-12-31T00:00:00Z',
      labels: ['startup-proof'],
      atomic: false,
      expectedFileChanges: [{ path: 'work.ts', operation: 'modify' }],
      successCriteria: [
        {
          id: 'work-file',
          type: 'file_exists',
          description: 'Work file exists',
          notes: 'work.ts',
          status: 'pending',
        },
      ],
    },
    event,
  );
  assert.ok(createdTask);
  task = createdTask.task;
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  await startServer();
  // Boot owns project metadata; capture the task baseline after that initialization.
  await kanban.assignTask(
    fixtureRoot,
    board.id,
    task.id,
    {
      agentId: 'fixture-worker',
      name: 'Fixture worker',
      status: 'running',
      leaseId: 'startup-lease',
      attempt: 1,
      claimedAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
    event,
  );
  await kanban.heartbeatTaskAssignment(
    fixtureRoot,
    board.id,
    task.id,
    {
      expectedLeaseId: 'startup-lease',
    },
    event,
  );
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket;
    window.__kanbanAuditMessages = [];
    window.WebSocket = class extends OriginalWebSocket {
      constructor(...args) {
        super(...args);
        window.__kanbanAuditSocket = this;
        this.addEventListener('message', (event) => {
          try {
            window.__kanbanAuditMessages.push(JSON.parse(event.data));
          } catch {}
          if (window.__kanbanAuditMessages.length > 1000) window.__kanbanAuditMessages.shift();
        });
      }
    };
  });
  await page.goto(`${origin}/?token=isolated-startup-token`);
  stage.current = 'open board';
  await openBoard();
  await page.getByRole('tab', { name: 'Execution', exact: true }).click();
  for (const next of ['todo', 'running']) {
    stage.current = `advance ${next}`;
    await page.getByLabel(/progress comment/i).fill(`Standalone UI advances to ${next}`);
    await page.getByRole('button', { name: `Advance to ${next}`, exact: true }).click();
    await expect
      .poll(
        async () => (await kanban.getBoard(fixtureRoot, board.id)).tasks[0].lifecycle.currentStage,
      )
      .toBe(next);
  }
  await writeFile(path.join(fixtureRoot, 'work.ts'), 'export const answer = 42;\n');
  await kanban.updateTaskAssignment(
    fixtureRoot,
    board.id,
    task.id,
    { status: 'completed', lastResult: 'Fixture worker completed tracked file.' },
    { ...event, expectedLeaseId: 'startup-lease' },
  );
  await page.evaluate(
    (boardId) =>
      window.__kanbanAuditSocket.send(JSON.stringify({ type: 'kanban.get', payload: { boardId } })),
    board.id,
  );
  await page.getByLabel(/progress comment/i).fill('Standalone reviewer checks worker output');
  await page.getByRole('button', { name: 'Advance to review', exact: true }).click();
  stage.current = 'verification';
  await page.getByRole('tab', { name: /^Evidence/ }).click();
  await page.getByRole('button', { name: 'Run verification', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await kanban.getBoard(fixtureRoot, board.id)).tasks[0].verificationReport?.verdict,
      { timeout: 20_000 },
    )
    .toBe('passed');
  const verified = (await kanban.getBoard(fixtureRoot, board.id)).tasks[0];
  assert.equal(verified.status, 'review');
  assert.equal(verified.verificationReport.fileScope.scopeMatches, true);
  assert.match(verified.verificationReport.inputFingerprint, /^[a-f0-9]{64}$/);
  await expect(
    page.getByRole('button', { name: 'Re-run verification', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'review.png') });
  stage.current = 'acceptance';
  await page.getByRole('tab', { name: 'Execution', exact: true }).click();
  await page.getByLabel(/completed action/i).fill('Accepted verified standalone work');
  await page.getByLabel(/progress comment/i).fill('Reviewer accepts current file evidence');
  await page.getByRole('button', { name: 'Advance to done', exact: true }).click();
  await expect
    .poll(async () => (await kanban.getBoard(fixtureRoot, board.id)).tasks[0].status)
    .toBe('completed');
  const accepted = (await kanban.getBoard(fixtureRoot, board.id)).tasks[0];
  assert.ok(
    accepted.lifecycle.history.some(
      (entry) => entry.to === 'done' && entry.action === 'Accepted verified standalone work',
    ),
  );
  await expect(page.getByText(/^completed$/i).first()).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'accepted.png') });
  stage.current = 'reload';
  await page.reload();
  await openBoard();
  await expect(page.getByText(/^completed$/i).first()).toBeVisible();
  stage.current = 'restart';
  await stopServer();
  await startServer();
  await page.reload();
  await openBoard();
  await expect(page.getByText(/^completed$/i).first()).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'after-restart.png') });
  const persisted = (await kanban.getBoard(fixtureRoot, board.id)).tasks[0];
  assert.deepEqual(persisted.verificationReport, accepted.verificationReport);
  assert.equal(
    persisted.verificationReport.inputFingerprint,
    accepted.verificationReport.inputFingerprint,
  );
  assert.deepEqual(persisted.lifecycle.history, accepted.lifecycle.history);
  assert.deepEqual(browserErrors, []);
  const result = {
    ok: true,
    fixtureRoot,
    boardId: board.id,
    taskId: task.id,
    fullStartWebUI: true,
    builtApp: true,
    authenticatedWebSocket: true,
    ipcSqlite: true,
    verifiedFileScope: true,
    manualAcceptance: true,
    reloadPersisted: true,
    backendRestartPersisted: true,
    paidModelRequests: false,
    screenshots,
  };
  await writeFile(path.join(fixtureRoot, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page?.screenshot({ path: path.join(screenshots, 'failure.png') }).catch(() => {});
  await writeFile(
    path.join(fixtureRoot, 'failure.json'),
    JSON.stringify(
      {
        stage,
        error: error.stack,
        browserErrors,
        body: await page
          ?.locator('body')
          .innerText()
          .catch(() => ''),
        messages: await page?.evaluate(() => window.__kanbanAuditMessages).catch(() => []),
      },
      null,
      2,
    ),
  );
  console.error(JSON.stringify({ fixtureRoot, stage, error: error.message, browserErrors }));
  throw error;
} finally {
  await browser?.close();
  await stopServer();
  await writeFile(path.join(fixtureRoot, 'backend.log'), backendOutput);
  const connection = await kanban.getKanbanServerConnection(fixtureRoot).catch(() => null);
  await connection
    ?.request('shutdown', { reason: 'isolated standalone smoke completed' })
    .catch(() => {});
  kanban.closeKanbanServerConnections();
  for (const handle of process._getActiveHandles()) {
    if (
      !initialHandles.has(handle) &&
      handle !== process.stdin &&
      handle !== process.stdout &&
      handle !== process.stderr &&
      handle.constructor.name === 'Socket' &&
      typeof handle.destroy === 'function'
    )
      handle.destroy();
  }
}
