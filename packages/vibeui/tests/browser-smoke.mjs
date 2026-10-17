import { strict as assert } from 'node:assert';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { WebSocketServer } from 'ws';
import { createHttpServer } from '../../webui-server/src/server/http-server.ts';

// Serve the real exported Next application through the production HTTP/CSP path.
// The loopback fixture implements the real protocol without making paid model calls.
const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const output = fileURLToPath(new URL('../../../.temp_files/vibeui/', import.meta.url));
await mkdir(output, { recursive: true });
const server = createHttpServer({ host: '127.0.0.1', distDir, apiToken: 'vibeui-smoke-token' });
const wss = new WebSocketServer({ server });
const received = [];
const clients = new Set();
let connections = 0;
let selectedModel = 'fixture-model';
let effort = 'auto';
let sessionName = 'A place to start';
let workingMode = 'default';
let preferences = {
  yolo: false,
  yoloPlus: false,
  autonomy: 'suggest',
  nextStepsMode: 'optional',
  contextAutoCompact: true,
  contextStrategy: 'hybrid',
  contextMode: 'balanced',
  tokenSavingTier: 'auto',
  maxIterations: 20,
  autoProceedMaxIterations: 10,
  subagentsAllowed: true,
  subagentCompanionsAllowed: true,
  showModelReasoning: true,
  refinerProvider: '',
  refinerModel: '',
};
let promptLibrary = [
  {
    slug: 'review-target',
    title: 'Review a target',
    description: 'Reusable code review',
    category: 'quality',
    favorite: false,
    content: 'Review {{target}}',
    variables: [{ name: 'target', required: true }],
  },
];
let fixtureTools = [
  {
    name: 'read_file',
    owner: 'core',
    description: 'Read a project file',
    permission: 'read',
    mutating: false,
    disabled: false,
    params: ['path'],
  },
  {
    name: 'write_file',
    owner: 'core',
    description: 'Write project files',
    permission: 'write',
    mutating: true,
    disabled: true,
    params: ['path', 'content'],
  },
];
let mcpEnabled = true;
let rejectMcpDisable = true;
let instructionRevision = 1;
let instructionText = 'Original shared instructions';
let rejectInstructionSave = true;
let compacted = false;
let providerAccounts = [
  {
    id: 'fixture',
    type: 'fixture',
    family: 'openai',
    baseUrl: 'http://127.0.0.1:9999/v1',
    models: ['fixture-model'],
    apiKeys: [
      { label: 'main', maskedKey: 'fx...last', isActive: true },
      { label: 'provider', maskedKey: 'fx...next', isActive: false },
    ],
  },
];
const frame = (socket, type, payload) => {
  if (socket.readyState === 1) socket.send(JSON.stringify({ type, payload }));
};
const session = (socket, sessionId = 'session-one', replayMessages) =>
  frame(socket, 'session.start', {
    sessionId,
    provider: 'fixture',
    model: selectedModel,
    mode: workingMode,
    appVersion: '1.1.7',
    reasoningEffortLevels: ['low', 'high'],
    effortSupported: true,
    projectReasoningEffort: 'high',
    projectName: 'VibeUI Studio',
    cwd: 'D:/workspace/studio',
    maxContext: selectedModel === 'small-model' ? 4096 : 128000,
    ...(replayMessages ? { replayMessages } : {}),
  });
wss.on('connection', (socket) => {
  let responseTimer;
  connections++;
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
  session(socket);
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    received.push(message);
    const p = message.payload ?? {};
    if (message.type === 'ping') frame(socket, 'pong', {});
    if (message.type === 'prompts.list')
      frame(socket, 'prompts.list', { enabled: true, prompts: promptLibrary });
    if (message.type === 'prompts.content') {
      const prompt = promptLibrary.find((item) => item.slug === p.slug);
      frame(socket, 'prompts.content', { ...prompt, slug: p.slug, found: Boolean(prompt) });
    }
    if (message.type === 'prompts.favorite') {
      promptLibrary = promptLibrary.map((item) =>
        item.slug === p.slug ? { ...item, favorite: p.favorite } : item,
      );
      frame(socket, 'prompts.favorite', { success: true, slug: p.slug, favorite: p.favorite });
    }
    if (message.type === 'prompts.create') {
      promptLibrary.push({
        slug: 'saved-from-vibeui',
        title: p.title,
        content: p.content,
        category: p.category,
        variables: [],
        favorite: false,
      });
      frame(socket, 'prompts.created', { success: true, slug: 'saved-from-vibeui' });
    }
    if (message.type === 'skills.content') {
      frame(socket, 'skills.content', { name: 'wrong-skill', body: 'Wrong skill content' });
      frame(socket, 'skills.content', {
        name: p.name,
        body: '# Testing instructions\nVerify behavior before claiming success.',
      });
    }
    if (message.type === 'tools.list')
      frame(socket, 'tools.list', { requestId: p.requestId, tools: fixtureTools });
    if (message.type === 'tool.enable' || message.type === 'tool.disable') {
      fixtureTools = fixtureTools.map((tool) =>
        tool.name === p.name ? { ...tool, disabled: message.type === 'tool.disable' } : tool,
      );
      frame(socket, message.type === 'tool.enable' ? 'tool.enabled' : 'tool.disabled', {
        name: p.name,
        ok: true,
      });
    }
    if (message.type === 'mcp.list')
      frame(socket, 'mcp.list', {
        servers: [
          {
            name: 'docs-service',
            status: mcpEnabled ? 'connected' : 'stopped',
            enabled: mcpEnabled,
            transport: 'http',
            tools: ['search_docs'],
            description: 'Project documentation tools',
          },
        ],
      });
    if (message.type === 'mcp.disable' || message.type === 'mcp.enable') {
      if (message.type === 'mcp.disable' && rejectMcpDisable) {
        rejectMcpDisable = false;
        frame(socket, 'mcp.operation_result', { success: false, message: 'Connection is in use.' });
      } else {
        mcpEnabled = message.type === 'mcp.enable';
        frame(socket, 'mcp.operation_result', { success: true, message: 'Connection updated.' });
      }
    }
    if (message.type === 'mcp.restart')
      frame(socket, 'mcp.operation_result', { success: true, message: 'Connection restarted.' });
    if (message.type === 'memory.list')
      frame(socket, 'memory.list', {
        requestId: p.requestId,
        text: '## Project memory\nUse Bun for package scripts.\nKeep interfaces focused.',
      });
    if (message.type === 'user_instructions.get')
      frame(socket, 'user_instructions', {
        text: instructionText,
        mtimeMs: instructionRevision,
        exists: true,
      });
    if (message.type === 'user_instructions.save') {
      if (rejectInstructionSave) {
        rejectInstructionSave = false;
        instructionText = 'Updated outside this editor';
        instructionRevision = 2;
        frame(socket, 'user_instructions', {
          error: 'Instructions changed on disk. Reload before saving.',
        });
      } else {
        assert.equal(p.baseMtimeMs, instructionRevision);
        instructionText = p.text;
        instructionRevision++;
        frame(socket, 'user_instructions', {
          text: instructionText,
          mtimeMs: instructionRevision,
          saved: true,
        });
      }
    }
    if (message.type === 'abort') {
      clearTimeout(responseTimer);
      setTimeout(
        () =>
          frame(socket, 'run.result', { sessionId: p.sessionId, status: 'aborted', iterations: 1 }),
        100,
      );
    }
    if (message.type === 'prefs.get')
      frame(socket, 'prefs.updated', {
        sessionId: p.sessionId,
        reasoningEffort: effort,
        ...preferences,
      });
    if (message.type === 'prefs.update') {
      if (p.reasoningEffort) effort = p.reasoningEffort;
      preferences = { ...preferences, ...p };
      delete preferences.sessionId;
      frame(socket, 'prefs.updated', {
        ...preferences,
        sessionId: p.sessionId,
        reasoningEffort: effort,
      });
    }
    if (message.type === 'autonomy.switch') {
      preferences.autonomy = p.mode;
      frame(socket, 'prefs.updated', { sessionId: p.sessionId, autonomy: p.mode });
    }
    if (message.type === 'modes.list')
      frame(socket, 'modes.list', {
        sessionId: p.sessionId,
        activeId: workingMode,
        modes: [
          { id: 'default', name: 'Default', description: 'General coding agent' },
          { id: 'plan', name: 'Plan', description: 'Plan before making changes' },
        ],
      });
    if (message.type === 'mode.switch') {
      workingMode = p.id;
      session(socket, p.sessionId);
    }
    if (message.type === 'skills.list') {
      frame(socket, 'skills.list', {
        requestId: 'stale-request',
        skills: [{ name: 'wrong-skill', description: 'Must be ignored' }],
      });
      frame(socket, 'skills.list', {
        requestId: p.requestId,
        enabled: true,
        skills: [
          { name: 'testing', description: 'Write and verify behavioral tests' },
          { name: 'design-system-foundry', description: 'Create a cohesive design system' },
        ],
      });
    }
    if (message.type === 'context.debug')
      frame(socket, 'context.debug', {
        sessionId: p.sessionId,
        mode: 'balanced',
        total: 2400,
        systemPrompt: 1000,
        tools: { count: 1, total: 400, breakdown: [{ name: 'read_file', tokens: 400 }] },
        messages: { total: 1000, count: 1, breakdown: [] },
        residency: { retained: 1200 },
        retention: { strategy: 'balanced' },
      });
    if (message.type === 'context.editor.open') {
      frame(socket, 'context.editor.snapshot', {
        sessionId: 'foreign-session',
        revision: 'wrong',
        messages: [{ role: 'user', content: 'Foreign secret should not appear' }],
      });
      frame(socket, 'context.editor.snapshot', {
        sessionId: p.sessionId,
        revision: 'snapshot-1',
        messages: [
          {
            role: 'user',
            content: compacted ? 'Compacted runtime context' : 'Runtime-only context entry',
          },
        ],
        readonlyContext: {
          systemPromptTokens: 1000,
          toolSchemaTokens: 400,
          toolCount: 1,
          totalTokens: 2400,
          messageTokens: 1000,
        },
        readonlyContent: {
          systemPrompt: [{ type: 'text', text: 'Actual session instructions from the runtime' }],
          tools: [
            {
              name: 'read_file',
              description: 'Read project files',
              inputSchema: { type: 'object' },
            },
          ],
        },
      });
    }
    if (message.type === 'stats.get')
      frame(socket, 'stats.get', {
        sessionId: p.sessionId,
        usage: { input: 12345, output: 678, total: 13023 },
        cache: { readTokens: 90000, writeTokens: 7000, hitRatio: 0.75, last: { hitRatio: 0.8 } },
        currentRequest: { cacheRead: 1200 },
      });
    if (message.type === 'context.compact') {
      frame(socket, 'context.compacted', { sessionId: 'foreign-session', before: 6000, after: 1 });
      setTimeout(() => {
        compacted = true;
        frame(socket, 'context.compacted', {
          sessionId: p.sessionId,
          before: 6000,
          after: 2500,
          saved: 3500,
        });
      }, 400);
    }
    if (message.type === 'model.switch') {
      selectedModel = p.model;
      session(socket, p.sessionId);
    }
    if (message.type === 'model.refine') {
      frame(socket, 'model.refine_result', {
        sessionId: p.sessionId,
        requestId: 'stale-refinement',
        refined: 'Stale result must be ignored',
      });
      frame(socket, 'model.refine_result', {
        sessionId: p.sessionId,
        requestId: p.requestId,
        ...(p.text === 'Fail refinement'
          ? { error: 'Fixture refiner unavailable' }
          : {
              refined: 'Explain the project clearly.',
              english: 'Explain the project in English.',
              refinedWith: { provider: 'fixture', model: 'refiner-model' },
            }),
      });
    }
    if (message.type === 'files.tree')
      frame(socket, 'files.tree', {
        sessionId: p.sessionId,
        root: 'D:/workspace/studio',
        tree: [
          {
            name: 'src',
            path: 'src',
            type: 'directory',
            children: [{ name: 'app.tsx', path: 'src/app.tsx', type: 'file' }],
          },
          { name: 'notes.md', path: 'notes.md', type: 'file' },
        ],
      });
    if (message.type === 'session.rename') {
      sessionName = p.name;
      frame(socket, 'key.operation_result', { success: true, message: 'Session renamed.' });
      frame(socket, 'sessions.list', {
        sessions: [
          { id: 'session-one', title: sessionName, startedAt: '2026-10-17T10:00:00Z' },
          { id: 'session-two', title: 'Second session', startedAt: '2026-10-17T09:00:00Z' },
        ],
      });
    }
    if (message.type === 'user.input_submit')
      frame(socket, 'user.input_resolved', {
        sessionId: p.sessionId,
        requestId: p.response.requestId,
      });
    if (message.type === 'files.read')
      frame(socket, 'files.read', { ...p, content: 'A concise project report.' });
    if (message.type === 'session.subscribe')
      frame(socket, 'session.run_state', { sessionId: p.sessionIds[0], isRunning: false });
    if (message.type === 'providers.list')
      frame(socket, 'provider.catalog', {
        providers: [
          {
            id: 'fixture',
            name: 'Local fixture',
            hasApiKey: true,
            family: 'openai',
            apiBase: 'http://127.0.0.1:9999/v1',
          },
        ],
      });
    if (message.type === 'providers.saved')
      frame(socket, 'providers.saved', { providers: providerAccounts });
    if (message.type === 'auth.oauth.list')
      frame(socket, 'auth.oauth.providers', {
        providers: [
          {
            id: 'fixture-chatgpt',
            providerId: 'openai-codex',
            label: 'OpenAI / ChatGPT',
            description: 'Sign in with your existing subscription',
          },
        ],
      });
    if (message.type === 'auth.oauth.start')
      frame(socket, 'auth.oauth.status', {
        kind: p.kind,
        providerId: p.providerId,
        phase: 'awaiting_browser',
        authorizeUrl: 'https://example.com/oauth',
        bound: false,
      });
    if (message.type === 'auth.oauth.code')
      frame(socket, 'auth.oauth.status', {
        kind: p.kind,
        phase: 'success',
        message: 'Fixture account signed in.',
      });
    if (message.type === 'provider.add') {
      if (p.id !== 'bad-provider')
        providerAccounts.push({
          id: p.id,
          type: p.type || p.family,
          family: p.family,
          baseUrl: p.baseUrl,
          models: p.models || [],
          apiKeys: p.apiKey ? [{ label: 'default', maskedKey: 'fx...new', isActive: true }] : [],
        });
      frame(socket, 'key.operation_result', {
        requestId: p.requestId,
        success: p.id !== 'bad-provider',
        message:
          p.id === 'bad-provider' ? 'Fixture credential validation failed.' : 'Provider saved.',
      });
    }
    if (message.type === 'key.delete') {
      providerAccounts = providerAccounts.map((provider) =>
        provider.id === p.providerId
          ? { ...provider, apiKeys: provider.apiKeys.filter((key) => key.label !== p.label) }
          : provider,
      );
      frame(socket, 'key.operation_result', {
        requestId: p.requestId,
        success: true,
        message: 'Key removed.',
      });
    }
    if (message.type === 'provider.models' && p.providerId === 'fixture')
      frame(socket, 'provider.models', {
        provider: 'fixture',
        models: [
          { id: 'fixture-model', name: 'Fixture model', contextWindow: 128000 },
          { id: 'small-model', name: 'Small model', contextWindow: 4096 },
        ],
      });
    if (message.type === 'sessions.list')
      frame(socket, 'sessions.list', {
        sessions: [
          { id: 'session-one', title: sessionName, startedAt: '2026-10-17T10:00:00Z' },
          { id: 'session-two', title: 'Second session', startedAt: '2026-10-17T09:00:00Z' },
        ],
      });
    if (message.type === 'git.changes')
      frame(socket, 'git.changes', {
        files: [{ path: 'src/app.tsx', status: 'M', added: 12, deleted: 3 }],
        dirs: {},
        repoPrefix: '',
      });
    if (message.type === 'git.diff')
      frame(socket, 'git.diff', {
        path: p.path,
        oldText: 'export const greeting = "hello";',
        newText: 'export const greeting = "hello, world";',
      });
    if (message.type === 'todos.get')
      frame(socket, 'todos.updated', {
        sessionId: p.sessionId,
        todos: [{ id: 'todo', content: 'Build a focused workspace', status: 'in_progress' }],
      });
    if (message.type === 'plan.get')
      frame(socket, 'plan.updated', {
        sessionId: p.sessionId,
        plan: { items: [{ id: 'plan', title: 'Connect the conversation', status: 'done' }] },
      });
    if (message.type === 'files.list')
      frame(socket, 'files.list', { files: ['src/app.tsx', 'src/styles.css'] });
    if (message.type === 'session.resume')
      session(socket, p.id, [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Restored answer' },
      ]);
    if (message.type === 'session.new') session(socket, `new-session-${connections}`, []);
    if (message.type === 'user_message') {
      if (p.content === 'Fail safely') {
        frame(socket, 'tool.started', {
          sessionId: p.sessionId,
          id: 'interrupted-tool',
          name: 'write_file',
          input: {},
        });
        setTimeout(
          () =>
            frame(socket, 'error', {
              sessionId: p.sessionId,
              message: 'Fixture provider failed',
              phase: 'provider',
            }),
          700,
        );
        return;
      }
      frame(socket, 'provider.text_delta', {
        sessionId: p.sessionId,
        messageId: `reply-${p.id}`,
        text: 'Building a calmer ',
      });
      frame(socket, 'tool.started', {
        sessionId: p.sessionId,
        id: `tool-${p.id}`,
        name: 'read_file',
        input: { path: 'src/app.tsx' },
      });
      responseTimer = setTimeout(
        () => {
          frame(socket, 'provider.text_delta', {
            sessionId: p.sessionId,
            messageId: `reply-${p.id}`,
            text: 'workspace.',
          });
          frame(socket, 'tool.executed', {
            sessionId: p.sessionId,
            id: `tool-${p.id}`,
            name: 'read_file',
            ok: true,
            output: 'File inspected.',
            durationMs: 12,
          });
          frame(socket, 'provider.response', {
            sessionId: p.sessionId,
            content: [
              {
                type: 'text',
                text: 'Building a calmer workspace.\n<nextsteps>\n1. Review keyboard navigation\n2. Check mobile layout\n</nextsteps>',
              },
            ],
            stopReason: 'end_turn',
          });
          frame(socket, 'run.result', { sessionId: p.sessionId, status: 'done', iterations: 1 });
        },
        p.content === 'Start before steering' ? 3000 : 700,
      );
    }
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(10_000);
  const captureNarrowDialog = async (name) => {
    const viewport = page.viewportSize();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      const dialog = page.getByRole('dialog');
      const close = dialog.getByRole('button', { name: 'Close dialog', exact: true });
      const box = await close.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 844, `${name}: close fits on mobile`);
      assert.equal(
        await dialog.evaluate((element) => element.scrollWidth > element.clientWidth),
        false,
        `${name}: no modal overflow`,
      );
      await page.screenshot({
        path: join(output, `mobile-${name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    } finally {
      await page.setViewportSize(viewport);
    }
  };
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Send message', exact: true }).waitFor();
  await page.getByText('What are we building').waitFor();
  await page.getByText('Ready', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'fixture-model' }).waitFor();
  await page.getByRole('button', { name: 'fixture-model' }).click();
  await page.getByRole('option', { name: /Small model/ }).click();
  await page.getByRole('heading', { name: 'A smaller context window' }).waitFor();
  await page.getByRole('button', { name: 'Keep current model', exact: true }).click();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search models', exact: true }).fill('Small');
  await page.getByRole('combobox', { name: 'Search models', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Switch model', exact: true }).click();
  await page.getByRole('button', { name: 'small-model', exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Reasoning effort', exact: true }).selectOption('high');
  await page.waitForFunction(
    () => document.querySelector('select[aria-label="Reasoning effort"]')?.value === 'high',
  );
  assert.ok(
    received.some(
      (m) =>
        m.type === 'prefs.update' &&
        m.payload.sessionId === 'session-one' &&
        m.payload.reasoningEffort === 'high',
    ),
  );
  await page.getByRole('button', { name: 'Agent settings', exact: true }).click();
  const settings = page.getByRole('dialog');
  for (const mode of ['plus', 'on', 'plus', 'off']) {
    await settings.getByRole('combobox', { name: 'YOLO mode', exact: true }).selectOption(mode);
    await page.waitForFunction(
      (value) => document.querySelector('select[aria-label="YOLO mode"]')?.value === value,
      mode,
    );
    const update = received.filter((frame) => frame.type === 'prefs.update').at(-1);
    assert.equal(update.payload.sessionId, 'session-one');
    assert.equal(update.payload.yolo, mode !== 'off');
    assert.equal(update.payload.yoloPlus, mode === 'plus');
    const summary = await page
      .getByRole('button', { name: 'Agent settings', exact: true, includeHidden: true })
      .textContent();
    assert.equal(summary.includes('YOLO+'), mode === 'plus');
    if (mode === 'plus')
      await settings
        .getByText('Approve all calls, including subagents. Explicit deny rules still apply.', {
          exact: true,
        })
        .waitFor();
  }
  await settings.getByRole('combobox', { name: 'YOLO mode', exact: true }).selectOption('on');
  await page.waitForFunction(
    () => document.querySelector('select[aria-label="YOLO mode"]')?.value === 'on',
  );
  await settings.getByRole('combobox', { name: 'Autonomy', exact: true }).selectOption('auto');
  await page.waitForFunction(
    () => document.querySelector('select[aria-label="Autonomy"]')?.value === 'auto',
  );
  await settings.getByRole('combobox', { name: 'Autonomy', exact: true }).selectOption('suggest');
  await settings
    .getByRole('combobox', { name: 'Next steps policy', exact: true })
    .selectOption('required');
  await settings.getByRole('combobox', { name: 'Working mode', exact: true }).selectOption('plan');
  await page.waitForFunction(
    () => document.querySelector('select[aria-label="Working mode"]')?.value === 'plan',
  );
  for (const [label, palette] of [
    ['Forest', 'sage'],
    ['Amber', 'amber'],
    ['Violet', 'violet'],
    ['Ocean', 'ocean'],
  ]) {
    await settings.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-palette'), palette);
    await settings.getByRole('button', { name: 'Light', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.screenshot({
      path: join(output, `settings-light-${palette}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await settings.getByRole('button', { name: 'Dark', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  }
  assert.equal(await page.locator('html').getAttribute('data-palette'), 'ocean');
  await settings.getByRole('combobox', { name: 'YOLO mode', exact: true }).selectOption('off');
  await page.waitForFunction(
    () => document.querySelector('select[aria-label="YOLO mode"]')?.value === 'off',
  );
  await settings.getByText('VibeUI v1.1.7 · WrongStack v1.1.7', { exact: true }).waitFor();
  await page.screenshot({
    path: join(output, 'runtime-settings.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await captureNarrowDialog('runtime-settings');
  await settings.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page
    .locator('.workspace-navigation')
    .getByRole('button', { name: 'Providers', exact: true })
    .click();
  const accounts = page.getByRole('dialog');
  await accounts.getByText('fx...last', { exact: true }).waitFor();
  await accounts
    .getByRole('button', { name: 'Delete key provider from fixture', exact: true })
    .click();
  await accounts.getByRole('button', { name: 'Confirm removal', exact: true }).click();
  await accounts.getByText('Key removed.', { exact: true }).waitFor();
  assert.ok(received.some((m) => m.type === 'key.delete' && m.payload.label === 'provider'));
  assert.equal(
    received.some((m) => m.type === 'provider.remove'),
    false,
    'A key named provider must never remove its account',
  );
  await accounts.getByRole('tab', { name: 'API key', exact: true }).click();
  await accounts
    .getByRole('combobox', { name: 'API key provider', exact: true })
    .selectOption('fixture');
  await accounts.getByRole('textbox', { name: 'Provider alias', exact: true }).fill('bad-provider');
  await accounts
    .getByRole('textbox', { name: 'New provider API key', exact: true })
    .fill('fixture-secret');
  await accounts.getByRole('button', { name: 'Save provider', exact: true }).click();
  await accounts.getByText('Fixture credential validation failed.', { exact: true }).waitFor();
  await accounts
    .getByRole('textbox', { name: 'Provider alias', exact: true })
    .fill('second-account');
  await accounts.getByRole('button', { name: 'Save provider', exact: true }).click();
  await accounts.getByText('second-account', { exact: true }).waitFor();
  assert.equal(
    (await accounts.innerText()).includes('fixture-secret'),
    false,
    'Credentials must stay masked',
  );
  await accounts.getByRole('tab', { name: 'Custom endpoint', exact: true }).click();
  await accounts.getByRole('textbox', { name: 'Provider alias', exact: true }).fill('local-test');
  await accounts
    .getByRole('textbox', { name: 'Provider model IDs', exact: true })
    .fill('local-one, local-two');
  await accounts.getByRole('button', { name: 'Save provider', exact: true }).click();
  await accounts.getByText('local-test', { exact: true }).waitFor();
  assert.deepEqual(
    received.find((m) => m.type === 'provider.add' && m.payload.id === 'local-test').payload.models,
    ['local-one', 'local-two'],
  );
  await accounts.getByRole('tab', { name: 'Subscription login', exact: true }).click();
  await accounts.getByRole('button', { name: 'Sign in to OpenAI / ChatGPT', exact: true }).click();
  await accounts.getByRole('link', { name: 'Open sign-in page', exact: false }).waitFor();
  assert.equal(
    await accounts
      .getByRole('link', { name: 'Open sign-in page', exact: false })
      .getAttribute('href'),
    'https://example.com/oauth',
  );
  await accounts
    .getByRole('textbox', { name: 'Authorization code', exact: true })
    .fill('fixture-code');
  await accounts.getByRole('button', { name: 'Submit code', exact: true }).click();
  await accounts.getByText('Fixture account signed in.', { exact: true }).waitFor();
  await accounts.getByRole('tab', { name: 'Subscription login', exact: true }).click();
  await accounts
    .getByRole('textbox', { name: 'Account alias', exact: true })
    .fill('cancelled-sign-in');
  await accounts.getByRole('button', { name: 'Sign in to OpenAI / ChatGPT', exact: true }).click();
  await accounts.getByRole('link', { name: 'Open sign-in page', exact: false }).waitFor();
  await page.screenshot({
    path: join(output, 'providers-accounts.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await captureNarrowDialog('providers-accounts');
  await accounts.getByRole('button', { name: 'Close dialog', exact: true }).click();
  assert.ok(
    received.some((m) => m.type === 'auth.oauth.cancel' && m.payload.kind === 'fixture-chatgpt'),
  );
  for (const [type, key, value] of [
    ['autonomy.switch', 'mode', 'auto'],
    ['prefs.update', 'yolo', true],
    ['mode.switch', 'id', 'plan'],
  ])
    assert.ok(
      received.some(
        (m) => m.type === type && m.payload.sessionId === 'session-one' && m.payload[key] === value,
      ),
    );
  await page.getByRole('button', { name: 'View context', exact: true }).click();
  const context = page.getByRole('dialog');
  await context.getByText('Session input', { exact: true }).waitFor();
  await context.getByText(/12[,.]345/).waitFor();
  assert.equal(
    received.some((m) => m.type === 'context.editor.open'),
    false,
    'Simple context must not load full conversation contents',
  );
  await page.screenshot({
    path: join(output, 'context-simple.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await captureNarrowDialog('context-simple');
  await context.getByRole('button', { name: 'Extended', exact: true }).click();
  await context.locator('summary').filter({ hasText: 'Runtime-only context entry' }).waitFor();
  assert.equal(await context.getByText('Foreign secret should not appear').count(), 0);
  await context.getByText(/90[,.]000 tokens/).waitFor();
  await context
    .getByRole('textbox', { name: 'Search context', exact: true })
    .fill('missing context');
  await context.getByText('No matching context messages.', { exact: true }).waitFor();
  await context.getByRole('textbox', { name: 'Search context', exact: true }).fill('');
  await context
    .locator('summary')
    .filter({ hasText: /^System instructions$/ })
    .click();
  await context
    .getByText('Actual session instructions from the runtime', { exact: true })
    .waitFor();
  await page.screenshot({
    path: join(output, 'context-window.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await context.getByRole('button', { name: 'Compact now', exact: true }).click();
  await context.getByRole('button', { name: 'Compacting…', exact: true }).waitFor();
  await context.locator('summary').filter({ hasText: 'Compacted runtime context' }).waitFor();
  assert.ok(
    received.some((m) => m.type === 'context.compact' && m.payload.sessionId === 'session-one'),
  );
  await context.getByRole('button', { name: 'Close dialog', exact: true }).click();
  for (const client of clients)
    frame(client, 'tool.confirm_needed', {
      sessionId: 'session-one',
      id: 'permission',
      toolName: 'write_file',
      input: { path: 'src/app.tsx' },
      suggestedPattern: 'write_file',
    });
  await page.getByRole('heading', { name: 'Your permission is needed' }).waitFor();
  await page.getByRole('button', { name: 'Allow once', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Your permission is needed' })
    .waitFor({ state: 'hidden' });
  assert.ok(
    received.some(
      (m) =>
        m.type === 'tool.confirm_result' &&
        m.payload.id === 'permission' &&
        m.payload.decision === 'yes',
    ),
  );
  for (const client of clients)
    frame(client, 'user.input_requested', {
      sessionId: 'session-one',
      request: {
        id: 'question',
        title: 'Choose a direction',
        tabs: [
          {
            id: 'tab',
            label: 'Direction',
            questions: [
              {
                id: 'q',
                prompt: 'Which version?',
                kind: 'single_select',
                required: true,
                allowCustomResponse: false,
                options: [{ id: 'small', label: 'Keep it small' }],
              },
            ],
          },
        ],
      },
    });
  await page.getByRole('heading', { name: 'Choose a direction', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Send answer', exact: true }).click();
  await page.getByText('Please answer the required questions.').waitFor();
  await page.getByRole('radio', { name: 'Keep it small', exact: true }).check();
  await page.getByRole('button', { name: 'Send answer', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Choose a direction', exact: true })
    .waitFor({ state: 'hidden' });
  await page.screenshot({
    path: `${output}/desktop-dark.png`,
    fullPage: true,
    animations: 'disabled',
  });
  const message = page.getByRole('textbox', { name: 'Message', exact: true });
  await message.fill('Fail refinement');
  await page.getByRole('button', { name: 'Refine prompt', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByText('Fixture refiner unavailable', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Keep original', exact: true }).click();
  assert.equal(await message.inputValue(), 'Fail refinement');
  await message.fill('Explain $tes');
  await page.getByRole('option', { name: /\$testing/ }).waitFor();
  assert.equal(await page.getByRole('option', { name: /wrong-skill/ }).count(), 0);
  await message.press('Tab');
  assert.equal(await message.inputValue(), 'Explain $testing ');
  await message.fill(`${await message.inputValue()}@app`);
  await page.getByRole('button', { name: 'src/app.tsx', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6N0AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Remove pixel.png', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Refine prompt', exact: true }).click();
  await page.getByRole('textbox', { name: 'Refined prompt', exact: true }).waitFor();
  await page.getByText('Refined with fixture / refiner-model', { exact: true }).waitFor();
  await page.screenshot({
    path: join(output, 'prompt-refiner.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await captureNarrowDialog('prompt-refiner');
  await page.getByRole('button', { name: 'Use refined', exact: true }).click();
  assert.equal(await message.inputValue(), '$testing\n\nExplain the project clearly.');
  assert.equal(
    received.filter((m) => m.type === 'user_message').length,
    0,
    'Refining must never send a chat message',
  );
  await page.getByRole('button', { name: 'Remove pixel.png', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Remove src/app.tsx', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('button', { name: 'Queue message', exact: true }).waitFor();
  await message.fill('And explain the tests');
  await page.getByRole('button', { name: 'Queue message', exact: true }).click();
  await page.getByText('And explain the tests', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: 'Resume queue', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.message-assistant').length === 2 &&
      !document.querySelector('.working-line'),
  );
  assert.equal(received.filter((m) => m.type === 'user_message').length, 2);
  assert.equal(
    received.find((m) => m.type === 'user_message').payload.images[0].mediaType,
    'image/png',
  );
  assert.equal(
    received.find((m) => m.type === 'user_message').payload.content,
    '$testing\n\nExplain the project clearly.\n@src/app.tsx',
  );
  await page.getByRole('button', { name: 'Review keyboard navigation', exact: false }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="Message"]')?.value ===
      'Review keyboard navigation',
  );
  assert.equal(
    received.filter((m) => m.type === 'user_message').length,
    2,
    'Selecting next steps restores a draft without automatic execution',
  );
  await message.fill('Fail safely');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await message.fill('Keep queued after error');
  await page.getByRole('button', { name: 'Queue message', exact: true }).click();
  await message.fill('Second queued task');
  await page.getByRole('button', { name: 'Queue message', exact: true }).click();
  await page.getByRole('button', { name: 'Resume queue', exact: true }).waitFor();
  assert.equal(
    received.filter((m) => m.type === 'user_message').length,
    3,
    'A failed run must not drain queued messages',
  );
  await page.getByRole('button', { name: 'Move queued message 2 up', exact: true }).click();
  await page.getByRole('button', { name: 'Edit queued message 2', exact: true }).click();
  assert.equal(await message.inputValue(), 'Keep queued after error');
  await page.getByRole('button', { name: 'Resume queue', exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('.working-line') && !document.querySelector('.message-queue'),
  );
  assert.equal(
    received.filter((m) => m.type === 'user_message').at(-1).payload.content,
    'Second queued task',
  );
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.working-line'));
  assert.equal(received.filter((m) => m.type === 'user_message').length, 5);
  await message.fill('Start before steering');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('button', { name: 'View context', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Compact now', exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Compact now', exact: true })
      .isDisabled(),
    true,
    'Cannot compact during an active run',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('combobox', { name: 'Message delivery', exact: true }).selectOption('steer');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(output, 'mobile-queue.png'),
    fullPage: true,
    animations: 'disabled',
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Running composer controls must fit mobile',
  );
  await page.setViewportSize({ width: 1512, height: 982 });
  await message.fill('Change direction now');
  await page.getByRole('button', { name: 'Steer message', exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('.working-line') && !document.querySelector('.message-queue'),
  );
  assert.equal(
    received.filter((m) => m.type === 'user_message').at(-1).payload.content,
    'Change direction now',
  );
  assert.equal(
    received.filter((m) => m.type === 'user_message').length,
    7,
    'Steering dispatches exactly once after the aborted-run boundary',
  );
  assert.ok(received.some((m) => m.type === 'abort' && m.payload.sessionId === 'session-one'));
  await page.getByRole('button', { name: 'Session actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename session', exact: true }).click();
  await page.getByRole('textbox', { name: 'Session name', exact: true }).fill('Focused workspace');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('.header-project strong')?.textContent === 'Focused workspace',
  );
  await page.getByRole('button', { name: 'Session actions', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export conversation', exact: true }).click();
  const download = await downloadPromise;
  assert.equal(await download.failure(), null, 'Conversation download must complete');
  await download.saveAs(join(output, 'conversation.md'));
  assert.ok(
    (await readFile(join(output, 'conversation.md'), 'utf8')).includes('Keep queued after error'),
  );
  await page.getByRole('button', { name: 'src/app.tsx', exact: false }).click();
  await page.getByText('export const greeting = "hello, world";', { exact: false }).waitFor();
  await page.screenshot({
    path: join(output, 'diff-modal.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await captureNarrowDialog('diff-modal');
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
  await page.getByText('Build a focused workspace').waitFor();
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await page.getByText('read_file', { exact: true }).first().waitFor();
  for (const client of clients) {
    frame(client, 'subagent.event', {
      sessionId: 'session-one',
      subagentId: 'idle-worker',
      kind: 'spawned',
      name: 'Idle worker',
      model: 'idle-model',
    });
    frame(client, 'subagent.event', {
      sessionId: 'session-one',
      subagentId: 'worker-review',
      kind: 'spawned',
      name: 'Reviewer',
      provider: 'fixture',
      model: 'worker-model',
      description: 'Inspect the project for regressions',
    });
    frame(client, 'subagent.event', {
      sessionId: 'session-one',
      subagentId: 'worker-review',
      kind: 'task_started',
    });
    frame(client, 'agent.timeline.message', {
      sessionId: 'session-one',
      subagentId: 'worker-review',
      agentName: 'Reviewer',
      kind: 'text',
      content: 'Inspecting the runtime boundary.',
      ts: '2026-10-17T12:00:00Z',
    });
  }
  await page.getByRole('button', { name: 'View agents', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /Idle worker/ }).count(), 0);
  await page.getByRole('checkbox', { name: /^Show inactive/ }).check();
  await page.getByRole('button', { name: /Idle worker/ }).waitFor();
  await page.getByRole('checkbox', { name: /^Show inactive/ }).uncheck();
  await page.getByRole('button', { name: /Reviewer.*Inspect the project/ }).click();
  await page.getByRole('dialog').getByText('worker-model', { exact: true }).waitFor();
  const agentDialogBox = await page.getByRole('dialog').boundingBox();
  assert.ok(
    agentDialogBox && agentDialogBox.width >= 1000,
    'Agent detail gives desktop output a wide reading area',
  );
  await page
    .getByRole('dialog')
    .locator('.agent-latest')
    .getByText('Inspecting the runtime boundary.', { exact: true })
    .waitFor();
  await page.screenshot({
    path: join(output, 'agent-monitor.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await captureNarrowDialog('agent-monitor');
  assert.equal(
    await page
      .getByRole('dialog')
      .locator('.agent-deeper')
      .evaluate((el) => el.hasAttribute('open')),
    false,
    'Verbose activity stays collapsed',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  for (const client of clients)
    frame(client, 'tool.executed', {
      sessionId: 'session-one',
      id: 'artifact-tool',
      name: 'present_artifact',
      ok: true,
      durationMs: 2,
      output: JSON.stringify({
        type: 'artifact.presentation',
        version: 2,
        id: 'notes',
        sessionId: 'session-one',
        path: 'notes.md',
        title: 'Project notes',
        kind: 'text',
      }),
    });
  await page.getByRole('button', { name: 'Project notes', exact: true }).click();
  await page.getByText('A concise project report.', { exact: true }).waitFor();
  await page.locator('.header-actions').getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search project files', exact: true }).fill('app');
  await page.getByRole('button', { name: 'src/app.tsx', exact: true }).click();
  await page.getByRole('dialog').getByText('A concise project report.', { exact: true }).waitFor();
  const fileContentBox = await page.getByRole('dialog').locator('.file-content').boundingBox();
  const fileDirectoryBox = await page.getByRole('dialog').locator('.files-directory').boundingBox();
  assert.ok(
    fileContentBox.x < fileDirectoryBox.x,
    'File content belongs on the left and directory on the right',
  );
  await page.screenshot({
    path: join(output, 'files-modal.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await captureNarrowDialog('files-modal');
  await page.getByRole('button', { name: 'Reference in message', exact: true }).click();
  await page.getByRole('button', { name: 'Remove src/app.tsx', exact: true }).click();
  const chatCountBeforeResources = received.filter((m) => m.type === 'user_message').length;
  await page
    .locator('.workspace-navigation')
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const hub = page.getByRole('dialog');
  await hub.getByRole('button', { name: /Review a target/ }).click();
  await hub.getByRole('textbox', { name: 'Prompt variable target', exact: true }).waitFor();
  assert.equal(
    await hub.getByRole('button', { name: 'Use prompt in draft', exact: true }).isDisabled(),
    true,
  );
  await hub.getByRole('button', { name: 'Favorite', exact: true }).click();
  await hub.getByRole('button', { name: 'Unfavorite', exact: true }).waitFor();
  await hub
    .getByRole('textbox', { name: 'Prompt variable target', exact: true })
    .fill('src/app.tsx');
  await page.screenshot({
    path: join(output, 'resource-prompts.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await hub.getByRole('button', { name: 'Use prompt in draft', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('textarea[aria-label="Message"]')?.value === 'Review src/app.tsx',
  );
  await message.fill('');
  await page
    .locator('.workspace-navigation')
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await hub.getByRole('button', { name: 'Save a prompt', exact: true }).click();
  await hub.getByRole('textbox', { name: 'Prompt title', exact: true }).fill('review target');
  await hub
    .getByRole('textbox', { name: 'Saved prompt text', exact: true })
    .fill('Must not overwrite');
  assert.equal(
    await hub.getByRole('button', { name: 'Save to library', exact: true }).isDisabled(),
    true,
    'Existing prompt identifiers must not be overwritten',
  );
  await hub.getByRole('textbox', { name: 'Prompt title', exact: true }).fill('Saved from VibeUI');
  await hub
    .getByRole('textbox', { name: 'Saved prompt text', exact: true })
    .fill('Inspect the current changes and verify behavior.');
  await hub.getByRole('button', { name: 'Save to library', exact: true }).click();
  await hub.getByRole('button', { name: /Saved from VibeUI/ }).waitFor();
  await hub.getByRole('tab', { name: 'Skills', exact: true }).click();
  await hub.getByRole('button', { name: /testing.*Write and verify/ }).click();
  await hub.getByRole('heading', { name: 'Testing instructions', exact: true }).waitFor();
  assert.equal(await hub.getByText('Wrong skill content').count(), 0);
  await hub.getByRole('button', { name: 'Mention this skill', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('textarea[aria-label="Message"]')?.value === '$testing',
  );
  await message.fill('');
  await page
    .locator('.workspace-navigation')
    .getByRole('button', { name: 'Tools & MCP', exact: true })
    .click();
  await hub.getByRole('button', { name: /write_file/ }).click();
  await hub.getByRole('button', { name: 'Enable tool', exact: true }).click();
  await hub.getByRole('button', { name: 'Disable tool', exact: true }).waitFor();
  await hub.getByRole('tab', { name: 'MCP', exact: true }).click();
  await hub.getByRole('button', { name: /docs-service/ }).click();
  await hub.getByRole('button', { name: 'Disable connection', exact: true }).click();
  await hub.getByText('Connection is in use.', { exact: true }).waitFor();
  await hub.getByRole('button', { name: 'Disable connection', exact: true }).click();
  await hub.getByRole('button', { name: 'Enable connection', exact: true }).waitFor();
  await page.screenshot({
    path: join(output, 'resource-mcp.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await hub.getByRole('button', { name: 'Enable connection', exact: true }).click();
  await hub.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await hub.getByRole('tab', { name: 'Memory', exact: true }).click();
  await hub.getByText('Use Bun for package scripts.', { exact: false }).waitFor();
  await hub.getByRole('textbox', { name: 'Search resources', exact: true }).fill('focused');
  await hub.getByText('Keep interfaces focused.', { exact: true }).waitFor();
  await hub.getByRole('button', { name: 'Close dialog', exact: true }).click();
  assert.equal(
    received.filter((m) => m.type === 'user_message').length,
    chatCountBeforeResources,
    'Resource actions must never submit chat',
  );
  await page.keyboard.press('Control+p');
  await page.getByRole('combobox', { name: 'Search actions', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('combobox', { name: 'Search actions', exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.type('Personal instructions');
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Personal instructions text', exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="Personal instructions text"]')?.value ===
      'Original shared instructions',
  );
  await page
    .getByRole('textbox', { name: 'Personal instructions text', exact: true })
    .fill('Local draft must survive conflict');
  await page.getByRole('button', { name: 'Save instructions', exact: true }).click();
  await page
    .getByText('Instructions changed on disk. Reload before saving.', { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('textbox', { name: 'Personal instructions text', exact: true })
      .inputValue(),
    'Local draft must survive conflict',
  );
  await page.getByRole('button', { name: 'Reload saved version', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="Personal instructions text"]')?.value ===
      'Updated outside this editor',
  );
  await page
    .getByRole('textbox', { name: 'Personal instructions text', exact: true })
    .fill('Verified shared instructions');
  await page.getByRole('button', { name: 'Save instructions', exact: true }).click();
  await page.getByText('Instructions saved.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.keyboard.press('Control+Shift+f');
  await page
    .getByRole('textbox', { name: 'Search conversation text', exact: true })
    .fill('Change direction now');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /You.*Change direction now/ })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('dialog')
    .locator('summary')
    .filter({ hasText: /^Context & efficiency$/ })
    .click();
  await page.getByRole('combobox', { name: 'Context policy', exact: true }).selectOption('frugal');
  await page.waitForFunction(
    () => document.querySelector('select[aria-label="Context policy"]')?.value === 'frugal',
  );
  await page
    .getByRole('dialog')
    .locator('summary')
    .filter({ hasText: /^Execution & delegation$/ })
    .click();
  await page.getByRole('spinbutton', { name: 'Iteration limit', exact: true }).fill('40');
  await page.getByRole('button', { name: 'Apply iteration limit', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="Iteration limit"]')?.value === '40',
  );
  assert.ok(
    received.some(
      (m) =>
        m.type === 'prefs.update' &&
        m.payload.sessionId === 'session-one' &&
        m.payload.maxIterations === 40,
    ),
  );
  await page
    .getByRole('dialog')
    .locator('summary')
    .filter({ hasText: /^Refiner & reasoning$/ })
    .click();
  await page
    .getByRole('combobox', { name: 'Refiner model', exact: true })
    .selectOption('fixture\tfixture-model');
  await page.waitForFunction(
    () =>
      document.querySelector('select[aria-label="Refiner model"]')?.value ===
      'fixture\tfixture-model',
  );
  await page.screenshot({
    path: join(output, 'advanced-settings.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.screenshot({
    path: `${output}/desktop-conversation.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await message.fill('Draft kept through reload');
  await page.reload();
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="Message"]')?.value ===
      'Draft kept through reload',
  );
  // An ordinary remote close must reconnect and hydrate the canonical transcript.
  const before = connections;
  for (const client of clients) client.close(1000, 'fixture restart');
  await page.getByText('Restored answer', { exact: true }).waitFor({ timeout: 15000 });
  assert.ok(connections > before);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.screenshot({
    path: `${output}/desktop-light.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Close workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Open sessions', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('.session-sidebar')?.getBoundingClientRect().left >= 0,
  );
  await page.screenshot({
    path: join(output, 'mobile-navigation.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Second session', exact: false }).click();
  await page.getByText('Restored answer', { exact: true }).waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.session-row.active')?.textContent?.includes('Second session'),
  );
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('.session-row.active')?.textContent?.includes('Second session'),
  );
  await page.getByText('Restored answer', { exact: true }).waitFor();
  await page.screenshot({
    path: `${output}/mobile-light.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Open sessions', exact: true }).click();
  await page
    .locator('.workspace-navigation')
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Review a target/ })
    .click();
  await page.getByRole('textbox', { name: 'Prompt variable target', exact: true }).waitFor();
  await page
    .getByRole('textbox', { name: 'Prompt variable target', exact: true })
    .fill('mobile.ts');
  await page
    .getByRole('button', { name: 'Use prompt in draft', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(output, 'mobile-resources.png'),
    fullPage: true,
    animations: 'disabled',
  });
  // The close action stays reachable after scrolling a long modal on narrow screens.
  for (const width of [320, 390, 768, 1512]) {
    await page.setViewportSize({ width, height: 720 });
    await page
      .getByRole('button', { name: 'Use prompt in draft', exact: true })
      .scrollIntoViewIfNeeded();
    const bounds = await page.getByRole('dialog').evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const close = dialog
        .querySelector('button[aria-label="Close dialog"]')
        ?.getBoundingClientRect();
      return {
        fits:
          rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        closeVisible: Boolean(close && close.top >= rect.top && close.bottom <= rect.bottom),
        horizontalOverflow: dialog.scrollWidth > dialog.clientWidth,
      };
    });
    assert.equal(bounds.fits, true, `Dialog fits at ${width}px`);
    assert.equal(bounds.closeVisible, true, `Close stays visible after scrolling at ${width}px`);
    assert.equal(
      bounds.horizontalOverflow,
      false,
      `Dialog has no horizontal overflow at ${width}px`,
    );
    if (width === 320 || width === 768) {
      await page.screenshot({
        path: join(output, `resources-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Resources must fit on mobile',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Use prompt in draft', exact: true })
    .click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false, 'Mobile must not overflow horizontally');
  assert.deepEqual(errors, [], 'No browser, hydration or CSP errors');
  console.log(
    JSON.stringify(
      {
        passed: true,
        connections,
        userMessages: received.filter((m) => m.type === 'user_message').length,
        screenshots: output,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  for (const client of clients) client.terminate();
  await new Promise((resolve) => wss.close(resolve));
  await new Promise((resolve) => server.close(resolve));
}
