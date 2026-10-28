import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

async function startTaskPeer() {
  const methods = [],
    tasks = new Map();
  let failPolls = false,
    inputNext = false;
  const answers = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(request.method === 'DELETE' ? 200 : 405);
      response.end();
      return;
    }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    methods.push(message.method);
    if (message.id === undefined) {
      response.writeHead(202);
      response.end();
      return;
    }
    let result;
    if (message.method === 'server/discover')
      result = {
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        capabilities: { tools: {}, extensions: { 'io.modelcontextprotocol/tasks': {} } },
      };
    else if (message.method === 'tools/list')
      result = {
        resultType: 'complete',
        tools: [
          {
            name: 'build',
            description: 'Start the isolated native task fixture.',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };
    else if (message.method === 'tools/call') {
      const createdAt = new Date().toISOString();
      const task = {
        taskId: `remote-native-task-not-a-public-receipt-${tasks.size + 1}`,
        status: 'working',
        createdAt,
        lastUpdatedAt: createdAt,
        ttlMs: null,
        pollIntervalMs: 100,
      };
      tasks.set(task.taskId, task);
      if (inputNext) {
        task.inputRequests = {
          branch: {
            method: 'elicitation/create',
            params: {
              message: 'Choose the branch for the native MCP task.',
              requestedSchema: {
                type: 'object',
                properties: { branch: { type: 'string', title: 'Build branch', minLength: 1 } },
                required: ['branch'],
              },
            },
          },
        };
        inputNext = false;
      }
      result = { resultType: 'task', ...task };
    } else if (message.method === 'tasks/get') {
      if (failPolls) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32000, message: 'Controlled temporary observation failure' },
          }),
        );
        return;
      }
      const task = tasks.get(message.params.taskId);
      if (task.inputRequests) task.status = 'input_required';
      result = { resultType: 'complete', ...task };
    } else if (message.method === 'tasks/update') {
      answers.push(message.params.inputResponses);
      const task = tasks.get(message.params.taskId);
      delete task.inputRequests;
      Object.assign(task, {
        status: 'completed',
        lastUpdatedAt: new Date().toISOString(),
        result: { content: [{ type: 'text', text: 'Native task input accepted' }] },
      });
      result = { resultType: 'complete' };
    } else if (message.method === 'tasks/cancel') {
      Object.assign(tasks.get(message.params.taskId), {
        status: 'cancelled',
        lastUpdatedAt: new Date().toISOString(),
      });
      result = { resultType: 'complete' };
    } else result = { resultType: 'complete' };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    methods,
    answers,
    requireInputNext: () => {
      inputNext = true;
    },
    failPolls: (value) => {
      failPolls = value;
    },
    completeLatest: () =>
      Object.assign([...tasks.values()].at(-1), {
        status: 'completed',
        lastUpdatedAt: new Date().toISOString(),
        result: {
          resultType: 'complete',
          content: [{ type: 'text', text: 'Native recovered task result' }],
        },
      }),
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

export async function exerciseNativeMcpTasks({
  page,
  rpc,
  waitFor,
  project,
  artifactDir,
  configPath,
  sessionIds,
}) {
  const peer = await startTaskPeer();
  const offsets = new Map();
  const call = async (id, type, payload = {}, replies = ['mcp.operation_result']) => {
    const scope = id === '@profile' ? 'profile' : 'engine',
      requestId = crypto.randomUUID();
    await rpc(`${scope}.send`, {
      ...(scope === 'engine' ? { id } : {}),
      message: { type, payload: { ...payload, requestId } },
    });
    return waitFor(
      async () => {
        const batch = await rpc(`${scope}.events`, {
          ...(scope === 'engine' ? { id } : {}),
          offset: offsets.get(id) ?? 0,
        });
        offsets.set(id, batch.offset);
        const frame = batch.events.find(
          (row) =>
            row.payload?.requestId === requestId &&
            (replies.includes(row.type) || row.type === 'error'),
        );
        if (!frame) return null;
        assert.notEqual(frame.payload.success, false, frame.payload.message);
        assert.notEqual(frame.type, 'error', frame.payload.message);
        return frame.payload;
      },
      `MCP task fixture ${type}`,
      60000,
    );
  };
  const openTasks = async () => {
    await page
      .getByRole('navigation', { name: 'Agent workspace views' })
      .getByRole('button', { name: 'Tools', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Session tools', exact: true })
      .getByRole('button')
      .filter({ hasText: 'MCP tasks' })
      .click();
    await page.getByRole('region', { name: 'Session MCP tasks', exact: true }).waitFor();
  };
  const panel = () => page.getByRole('region', { name: 'Session MCP tasks', exact: true });
  const select = async (title) => {
    await page.locator('.tree-session').filter({ hasText: title }).click();
  };
  const approveVisible = async () => {
    const allow = page
      .locator('.approval-card')
      .getByRole('button', { name: 'Allow once', exact: true })
      .first();
    if ((await allow.count()) && (await allow.isVisible()) && (await allow.isEnabled()))
      await allow.click();
  };
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    await writeFile(
      configPath,
      JSON.stringify({
        ...config,
        autonomy: { ...config.autonomy, defaultMode: 'off', enhance: false },
        maxIterations: 3,
        extensions: {
          ...config.extensions,
          'wstack-chimera': { enabled: false },
          'wstack-auto-review': { enabled: false },
        },
      }),
    );
    await call('@profile', 'mcp.add', {
      name: 'native_tasks',
      transport: 'streamable-http',
      url: peer.url,
      enabled: true,
      allowPrivateNetworks: true,
      permission: 'confirm',
    });
    const owner = await rpc('session.open', {
      projectId: project.id,
      kind: 'agent',
      title: 'MCP task owner',
    });
    sessionIds.push(owner.id);
    const identity = await waitFor(
      async () => {
        const value = await rpc('engine.identity', { id: owner.id });
        return value.sessionId ? value : null;
      },
      'MCP task owner runtime',
      100000,
    );
    assert.match(identity.sessionId, /^\d{4}-\d\d-\d\d\/sess_/);
    await select('MCP task owner');
    await page.getByRole('textbox', { name: 'Message WrongStack', exact: true }).waitFor();
    await call(owner.id, 'prefs.update', { yolo: false, yoloPlus: false, autonomy: 'off' }, [
      'key.operation_result',
    ]);
    await openTasks();
    await panel().getByRole('heading', { name: 'No recorded MCP tasks.', exact: true }).waitFor();
    assert.equal(
      peer.methods.filter((method) => method === 'tools/call').length,
      0,
      'Opening task metadata creates no remote work',
    );
    await panel().getByRole('button', { name: 'Back to conversation', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Message WrongStack', exact: true })
      .fill(
        '[native-mcp-task-start] Start the isolated MCP build and keep it working until I cancel it.',
      );
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await waitFor(
      async () => {
        await approveVisible();
        return peer.methods.includes('tools/call');
      },
      'Real MCP task invocation with canonical session approval',
      60000,
    );
    await openTasks();
    const task = panel().locator('.mcp-task-list > article');
    await task.getByRole('heading', { name: 'native_tasks / build', exact: true }).waitFor();
    const receipt = await task.getAttribute('data-mcp-task');
    assert.ok(receipt && receipt !== 'remote-native-task-not-a-public-receipt');
    assert.equal(
      (await panel().innerText()).includes('remote-native-task-not-a-public-receipt'),
      false,
    );
    assert.equal(
      await task.getByRole('button', { name: 'Resume observation', exact: true }).isDisabled(),
      true,
      'An active observer cannot be duplicated',
    );
    await page.screenshot({
      path: join(artifactDir, 'native-mcp-task-working.png'),
      fullPage: true,
    });
    const other = await rpc('session.open', {
      projectId: project.id,
      kind: 'agent',
      title: 'MCP task other session',
    });
    sessionIds.push(other.id);
    await waitFor(
      async () => (await rpc('engine.identity', { id: other.id })).sessionId,
      'Second MCP session ready',
      100000,
    );
    await select('MCP task other session');
    await openTasks();
    await panel().getByRole('heading', { name: 'No recorded MCP tasks.', exact: true }).waitFor();
    assert.equal(
      await panel().locator(`[data-mcp-task="${receipt}"]`).count(),
      0,
      'Another session cannot see this receipt',
    );
    assert.equal(peer.methods.filter((method) => method === 'tools/call').length, 1);
    await select('MCP task owner');
    if (!(await panel().count())) await openTasks();
    await panel().locator(`[data-mcp-task="${receipt}"]`).waitFor();
    await waitFor(
      async () => {
        const snapshot = await rpc('snapshot');
        return snapshot.layout && JSON.parse(snapshot.layout).selected === owner.id;
      },
      'Owner selection reaches durable native layout before reload',
      10000,
    );
    await page.reload();
    await page.getByRole('textbox', { name: 'Message WrongStack', exact: true }).waitFor();
    await openTasks();
    await panel().locator(`[data-mcp-task="${receipt}"]`).waitFor();
    assert.equal(
      (await rpc('engine.identity', { id: owner.id })).sessionId,
      identity.sessionId,
      'UI reload keeps the actual task owner',
    );
    await page.setViewportSize({ width: 800, height: 640 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({
      path: join(artifactDir, 'native-mcp-task-compact.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1480, height: 960 });
    await panel().getByRole('button', { name: 'Request task cancellation', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Cancel MCP task', exact: true });
    await confirm.getByRole('button', { name: 'Keep MCP task running', exact: true }).click();
    assert.equal(peer.methods.filter((method) => method === 'tasks/cancel').length, 0);
    await panel().getByRole('button', { name: 'Request task cancellation', exact: true }).click();
    await confirm
      .getByRole('button', { name: 'Confirm MCP cancellation request', exact: true })
      .click();
    await waitFor(
      async () => {
        const review = confirm.getByRole('button', { name: /Review pending session requests/ });
        if (await review.count()) await review.click();
        await approveVisible();
        return peer.methods.includes('tasks/cancel');
      },
      'Canonical permission review and actual remote task cancellation',
      60000,
    );
    if (!(await panel().count())) await openTasks();
    const cancelled = panel().locator(`[data-mcp-task="${receipt}"]`);
    await cancelled
      .locator('.mcp-task-status')
      .filter({ hasText: 'Cancelled' })
      .waitFor({ timeout: 60000 });
    await cancelled
      .getByText('Terminal status collected by this conversation.', { exact: true })
      .waitFor();
    assert.equal(
      peer.methods.filter((method) => method === 'tools/call').length,
      1,
      'Metadata, reload, isolation and cancellation never rerun the tool',
    );
    assert.equal(peer.methods.filter((method) => method === 'tasks/cancel').length, 1);
    await panel().getByLabel('Search session MCP tasks', { exact: true }).fill('not-this-task');
    await panel().getByRole('heading', { name: 'No matching tasks.', exact: true }).waitFor();
    await panel().getByLabel('Search session MCP tasks', { exact: true }).fill('');
    await panel().getByLabel('MCP task status', { exact: true }).selectOption('working');
    await panel().getByRole('heading', { name: 'No matching tasks.', exact: true }).waitFor();
    await panel().getByLabel('MCP task status', { exact: true }).selectOption('cancelled');
    await cancelled.waitFor();
    await page.screenshot({
      path: join(artifactDir, 'native-mcp-task-cancelled.png'),
      fullPage: true,
    });
    await panel().getByLabel('MCP task status', { exact: true }).selectOption('all');
    await panel().getByRole('button', { name: 'Back to conversation', exact: true }).click();
    await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
    peer.failPolls(true);
    await page
      .getByRole('textbox', { name: 'Message WrongStack', exact: true })
      .fill(
        '[native-mcp-task-recover] Start a second isolated MCP build; recover observation after a temporary polling failure.',
      );
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await waitFor(
      async () => {
        await approveVisible();
        return peer.methods.filter((method) => method === 'tools/call').length === 2;
      },
      'Second real remote task invocation',
      60000,
    );
    await openTasks();
    const recoverable = panel()
      .locator('.mcp-task-list > article')
      .filter({ hasText: 'No current observer.' });
    await recoverable
      .getByRole('button', { name: 'Resume observation', exact: true })
      .waitFor({ timeout: 60000 });
    const recoveredId = await recoverable.getAttribute('data-mcp-task');
    assert.ok(recoveredId && recoveredId !== receipt);
    await waitFor(
      async () =>
        recoverable.getByRole('button', { name: 'Resume observation', exact: true }).isEnabled(),
      'Observation lease releases after the real poll error',
      60000,
    );
    peer.failPolls(false);
    peer.completeLatest();
    await recoverable.getByRole('button', { name: 'Resume observation', exact: true }).click();
    const recovered = panel().locator(`[data-mcp-task="${recoveredId}"]`);
    await waitFor(
      async () => {
        const review = panel().getByRole('button', { name: /Review pending session requests/ });
        if (await review.count()) await review.click();
        await approveVisible();
        if (!(await panel().count())) await openTasks();
        return (await recovered.innerText()).includes('Result collected by this conversation.');
      },
      'Canonical observation recovery collects the original result',
      60000,
    );
    await recovered.locator('.mcp-task-status').filter({ hasText: 'Completed' }).waitFor();
    assert.equal(
      peer.methods.filter((method) => method === 'tools/call').length,
      2,
      'Recovery observes the existing task without replaying either tool',
    );
    assert.equal(peer.methods.filter((method) => method === 'tasks/cancel').length, 1);
    await page.screenshot({
      path: join(artifactDir, 'native-mcp-task-recovered.png'),
      fullPage: true,
    });
    peer.requireInputNext();
    await panel().getByRole('button', { name: 'Back to conversation', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Message WrongStack', exact: true });
    await input.waitFor();
    await input.fill(
      '[native-mcp-task-input] Start an isolated MCP build and ask which branch to use.',
    );
    await waitFor(
      () => page.getByRole('button', { name: 'Send message', exact: true }).isEnabled(),
      'Conversation ready for the elicitation task',
      60000,
    );
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await waitFor(
      async () => {
        await approveVisible();
        return peer.methods.filter((method) => method === 'tools/call').length === 3;
      },
      'Third actual invocation for task elicitation',
      60000,
    );
    const form = page.getByRole('article', {
      name: 'MCP server "native_tasks" is asking for input',
      exact: true,
    });
    await form.waitFor({ timeout: 60000 });
    await openTasks();
    const needsInput = panel()
      .locator('.mcp-task-list > article')
      .filter({ hasText: 'Needs input' });
    await needsInput.waitFor();
    const inputReceipt = await needsInput.getAttribute('data-mcp-task');
    assert.equal(peer.answers.length, 0, 'Task metadata never auto-answers the remote question');
    await needsInput
      .getByRole('button', {
        name: 'Return to the conversation to answer its pending question',
        exact: true,
      })
      .click();
    await form
      .getByRole('textbox', { name: 'Build branch', exact: true })
      .fill('desktop-native-proof');
    await page.screenshot({ path: join(artifactDir, 'native-mcp-task-input.png'), fullPage: true });
    await form.getByRole('button', { name: 'Send to native_tasks', exact: true }).click();
    await waitFor(() => peer.answers.length === 1, 'Native answer reaches tasks/update', 60000);
    assert.deepEqual(peer.answers[0], {
      branch: { action: 'accept', content: { branch: 'desktop-native-proof' } },
    });
    await form.waitFor({ state: 'detached' });
    await openTasks();
    await panel()
      .locator(`[data-mcp-task="${inputReceipt}"]`)
      .getByText('Result collected by this conversation.', { exact: true })
      .waitFor({ timeout: 60000 });
    assert.equal(peer.methods.filter((method) => method === 'tools/call').length, 3);
    assert.equal(peer.methods.filter((method) => method === 'tasks/update').length, 1);
    await call('@profile', 'mcp.remove', { name: 'native_tasks' });
    assert.equal(page.context().pages().length, 1);
    console.log(
      'PASS: actual session-owned modern MCP task create/receipt/poll, root dated ID, read-only metadata, second-session isolation, reload, active-observer guard, reviewed cancellation, polling-error recovery and native elicitation answer/result without tool replay',
    );
  } finally {
    await writeFile(
      join(artifactDir, 'native-mcp-task-methods.json'),
      JSON.stringify(peer.methods, null, 2),
    );
    await peer.close();
  }
}
