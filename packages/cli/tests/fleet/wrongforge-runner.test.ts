import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ACPProgressEvent } from '@wrongstack/acp';
import type { SubagentRunContext, TaskSpec } from '@wrongstack/core/types';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAcpSubagentRunner } from '../../src/fleet/host-acp.js';
import {
  chooseModel,
  makeWrongForgeRunner,
  resolveWrongForgeEndpoint,
  WRONGFORGE_READ_SIDE_TOOLS,
} from '../../src/fleet/wrongforge-runner.js';

const KEY = 'wf_test-key-0123456789abcdef';

// The runner caches WrongForge's model list under WRONGSTACK_HOME; keep it off the real one.
let home: string;
let savedHome: string | undefined;
beforeAll(() => {
  savedHome = process.env['WRONGSTACK_HOME'];
  home = mkdtempSync(path.join(tmpdir(), 'wf-wstack-home-'));
  process.env['WRONGSTACK_HOME'] = home;
});
afterAll(() => {
  if (savedHome === undefined) delete process.env['WRONGSTACK_HOME'];
  else process.env['WRONGSTACK_HOME'] = savedHome;
  rmSync(home, { recursive: true, force: true });
});

interface FakeTask {
  id: string;
  status: string;
  result?: unknown;
  error?: unknown;
  cancel_reason?: string | undefined;
}

/** A minimal WrongForge task API: scripted events, then a final record. */
function fakeWrongForge(script: {
  events?: Array<{ type: string; data: Record<string, unknown> }>;
  final?: Partial<FakeTask>;
  submitStatus?: number;
  /** Never finish on its own; only a cancel ends the task. */
  hang?: boolean;
  /** What `/v1/info` advertises; unset = an older server without the route's `features`. */
  features?: string[];
  /** What `/v1/info` lists as served models. */
  models?: string[];
  /** Polls answered as `queued` (silent, behind other work) before the task runs. */
  queuedPolls?: number;
}) {
  const submitted: Record<string, unknown>[] = [];
  const cancels: string[] = [];
  let queuedLeft = script.queuedPolls ?? 0;
  let task: FakeTask | undefined;
  const server = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      send(401, { error: { code: 'unauthorized', message: 'missing or wrong API key' } });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8');
    });
    req.on('end', () => {
      if (req.method === 'POST' && url.pathname === '/v1/tasks') {
        if (script.submitStatus) {
          send(script.submitStatus, { error: { code: 'not_signed_in', message: 'not signed in' } });
          return;
        }
        const parsed = JSON.parse(body) as Record<string, unknown>;
        submitted.push(parsed);
        task = { id: String(parsed['task_id']), status: 'running' };
        send(202, { task, deduplicated: false });
        return;
      }
      if (url.pathname === '/v1/info') {
        return send(200, {
          protocol: 1,
          ...(script.features ? { features: script.features } : {}),
          ...(script.models ? { models: script.models, default_model: script.models[0] } : {}),
        });
      }
      const m = /^\/v1\/tasks\/([^/]+)(\/events|\/cancel)?$/.exec(url.pathname);
      if (!m || !task) return send(404, { error: { code: 'not_found', message: 'no' } });
      if (m[2] === '/cancel') {
        cancels.push(decodeURIComponent(m[1] ?? ''));
        task.status = 'cancelled';
        task.cancel_reason = (JSON.parse(body || '{}') as { reason?: string }).reason;
        return send(200, { task });
      }
      if (m[2] === '/events') {
        const after = Number(url.searchParams.get('after') ?? 0);
        const all = (script.events ?? []).map((e, i) => ({ seq: i + 1, ...e }));
        const events = all.filter((e) => e.seq > after);
        if (queuedLeft > 0) {
          queuedLeft--;
          return send(200, {
            task_id: task.id,
            status: 'queued',
            terminal: false,
            events: [],
            next_after: after,
          });
        }
        if (!script.hang && task.status === 'running')
          Object.assign(task, { status: 'completed', ...script.final });
        const respond = () =>
          send(200, {
            task_id: task?.id,
            status: task?.status,
            terminal: task?.status !== 'running',
            events,
            next_after: events.length ? events[events.length - 1]?.seq : after,
          });
        if (script.hang && task.status === 'running' && events.length === 0) {
          setTimeout(respond, 30);
          return;
        }
        return respond();
      }
      return send(200, { task });
    });
  });
  return new Promise<{
    url: string;
    submitted: typeof submitted;
    cancels: string[];
    close: () => Promise<void>;
  }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        submitted,
        cancels,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function ctx(signal = new AbortController().signal) {
  const recordUsage = vi.fn();
  const markActivity = vi.fn();
  const c = {
    subagentId: 'wrongforge-1a2b3c4d',
    config: { name: 'wrongforge', provider: 'acp' },
    budget: { recordUsage, markActivity },
    signal,
    sessionId: 'sess-1',
    bridge: null,
  } as unknown as SubagentRunContext;
  return { c, recordUsage, markActivity };
}

const task: TaskSpec = { id: 'task-1', description: 'fix the failing test' };
const servers: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

describe('WrongForge runner', () => {
  it('submits with the project workdir and returns the final text, live progress and usage', async () => {
    const wf = await fakeWrongForge({
      events: [
        { type: 'task.started', data: {} },
        { type: 'agent.text', data: { text: 'Two bugs.' } },
        {
          type: 'tool.started',
          data: { tool_call_id: 't1', name: 'bash', input: { command: 'npm test' } },
        },
        {
          type: 'tool.finished',
          data: { tool_call_id: 't1', name: 'bash', ok: false, output: { ok: false, exitCode: 1 } },
        },
        { type: 'agent.todos', data: { todos: [{ content: 'fix it', status: 'in_progress' }] } },
        { type: 'agent.text', data: { text: 'Fixed.' } },
      ],
      final: {
        result: {
          text: 'Fixed.',
          steps: 3,
          tool_calls: 1,
          usage: {
            input_tokens: 10,
            output_tokens: 50,
            cache_read_tokens: 800,
            cache_write_tokens: 100,
          },
        },
      },
    });
    servers.push(wf);
    const live: ACPProgressEvent[] = [];
    const gateway = {
      url: 'http://127.0.0.1:1',
      token: 't'.repeat(20),
      list_path: '/v1/tools',
      call_path: '/v1/tools/{name}/call',
    };
    const runner = makeWrongForgeRunner({
      projectRoot: '/proj',
      endpoint: () => ({ url: wf.url, apiKey: KEY }),
      gateway: async () => gateway,
      publishLive: (_c, _t, e) => live.push(e),
    });
    const { c, recordUsage, markActivity } = ctx();

    const out = await runner(task, c);

    // Steps stay apart; WrongForge's own result.text would read 'Two bugs.Fixed.'.
    expect(out).toEqual({ result: 'Two bugs.\n\nFixed.', iterations: 3, toolCalls: 1 });
    const sent = wf.submitted[0] ?? {};
    expect(sent['workdir']).toBe('/proj');
    expect(sent['prompt']).toBe('fix the failing test');
    expect(sent['session_id']).toBe('ws-wrongforge-1a2b3c4d');
    // An older server (no `features`): its own tools stay on, the gateway stays optional.
    expect(sent['gateway']).toEqual(gateway);
    expect(sent).not.toHaveProperty('builtin_tools');
    expect(sent).not.toHaveProperty('model');
    expect(markActivity).toHaveBeenCalledTimes(6);
    expect(live.map((e) => e.type)).toEqual([
      'thought',
      'message',
      'tool_call',
      'tool_call_update',
      'plan',
      'message',
      'turn_usage',
    ]);
    expect(live[3]).toMatchObject({
      toolCall: { toolCallId: 't1', title: 'bash', status: 'failed' },
    });
    expect(recordUsage).toHaveBeenCalledWith(
      { input: 10, output: 50, cacheRead: 800, cacheWrite: 100 },
      0,
    );
  });

  it('routes writes and shell through the gateway when the server supports builtin_tools', async () => {
    const wf = await fakeWrongForge({
      features: ['builtin_tools'],
      final: { result: { text: 'done', steps: 1, tool_calls: 1 } },
    });
    servers.push(wf);
    const gateway = {
      url: 'http://127.0.0.1:1',
      token: 't'.repeat(20),
      list_path: '/v1/tools',
      call_path: '/v1/tools/{name}/call',
      optional: true,
    };
    const routed = makeWrongForgeRunner({
      projectRoot: '/proj',
      endpoint: () => ({ url: wf.url, apiKey: KEY }),
      gateway: async () => gateway,
    });
    await routed(task, ctx().c);
    const sent = wf.submitted[0] ?? {};
    expect(sent['builtin_tools']).toEqual(WRONGFORGE_READ_SIDE_TOOLS);
    expect(sent['builtin_tools']).not.toContain('bash');
    // Without the gateway the worker could not write at all: it is required now.
    expect(sent['gateway']).toMatchObject({ optional: false });
    expect(String(sent['system_append'])).toContain('wstack_edit');

    // No gateway (it failed to start): nothing is switched off.
    const bare = makeWrongForgeRunner({
      projectRoot: '/proj',
      endpoint: () => ({ url: wf.url, apiKey: KEY }),
      gateway: async () => {
        throw new Error('port in use');
      },
    });
    await bare(task, ctx().c);
    expect(wf.submitted[1]).not.toHaveProperty('builtin_tools');
    expect(wf.submitted[1]).not.toHaveProperty('gateway');
  });

  it('treats waiting in the shared queue as activity, not a stall', async () => {
    const wf = await fakeWrongForge({
      queuedPolls: 3,
      events: [{ type: 'task.queued', data: { waiting_for: 'capacity' } }],
      final: { result: { text: 'done', steps: 1, tool_calls: 0 } },
    });
    servers.push(wf);
    const live: ACPProgressEvent[] = [];
    const runner = makeWrongForgeRunner({
      projectRoot: '/proj',
      endpoint: () => ({ url: wf.url, apiKey: KEY }),
      publishLive: (_c, _t, e) => live.push(e),
    });
    const { c, markActivity } = ctx();
    await expect(runner(task, c)).resolves.toMatchObject({ result: 'done' });
    // 3 silent queued polls + the task.queued event itself.
    expect(markActivity).toHaveBeenCalledTimes(4);
    expect(live[0]).toMatchObject({ type: 'thought', text: expect.stringContaining('capacity') });
  });

  it('turns a failed task into a structured error with the matching kind', async () => {
    const wf = await fakeWrongForge({
      final: { status: 'failed', error: { code: 'max_steps', message: 'step limit 50 reached' } },
    });
    servers.push(wf);
    const runner = makeWrongForgeRunner({
      projectRoot: '/proj',
      endpoint: () => ({ url: wf.url, apiKey: KEY }),
    });
    await expect(runner(task, ctx().c)).rejects.toMatchObject({
      kind: 'budget_iterations',
      message: expect.stringContaining('step limit 50 reached'),
    });
  });

  it('rejects an unreachable server, a wrong key and a signed-out server as such', async () => {
    const wf = await fakeWrongForge({ submitStatus: 503 });
    servers.push(wf);
    const signedOut = makeWrongForgeRunner({
      projectRoot: '/p',
      endpoint: () => ({ url: wf.url, apiKey: KEY }),
    });
    await expect(signedOut(task, ctx().c)).rejects.toMatchObject({ kind: 'provider_auth' });
    const wrongKey = makeWrongForgeRunner({
      projectRoot: '/p',
      endpoint: () => ({ url: wf.url, apiKey: 'x'.repeat(20) }),
    });
    await expect(wrongKey(task, ctx().c)).rejects.toMatchObject({ kind: 'provider_auth' });
    const down = makeWrongForgeRunner({
      projectRoot: '/p',
      endpoint: () => ({ url: 'http://127.0.0.1:9', apiKey: KEY }),
    });
    await expect(down(task, ctx().c)).rejects.toMatchObject({
      kind: 'bridge_failed',
      message: expect.stringContaining('npm run serve'),
    });
    const noKey = makeWrongForgeRunner({ projectRoot: '/p', endpoint: () => undefined });
    await expect(noKey(task, ctx().c)).rejects.toMatchObject({ kind: 'provider_auth' });
  });

  it('cancels the WrongForge task when the delegating side aborts', async () => {
    const wf = await fakeWrongForge({ hang: true });
    servers.push(wf);
    const ac = new AbortController();
    const runner = makeWrongForgeRunner({
      projectRoot: '/p',
      endpoint: () => ({ url: wf.url, apiKey: KEY }),
    });
    const run = runner(task, ctx(ac.signal).c);
    await vi.waitFor(() => expect(wf.submitted).toHaveLength(1));
    ac.abort();
    await expect(run).rejects.toMatchObject({ kind: 'aborted_by_parent' });
    await vi.waitFor(() => expect(wf.cancels).toHaveLength(1));
  });

  it('is what the external-agent route builds for `wrongforge`', async () => {
    const runner = await buildAcpSubagentRunner('wrongforge', { projectRoot: '/proj' });
    expect(typeof runner).toBe('function');
  });
});

describe('WrongForge model choice', () => {
  const info = { models: ['claude-a-1', 'claude-b-2'], defaultModel: 'claude-a-1', features: [] };

  it('forwards a served model, refuses an unserved one with the list, ignores non-choices', () => {
    expect(chooseModel('claude-b-2', 'wrongforge', info)).toEqual({ id: 'claude-b-2' });
    expect(chooseModel('claude-z-9', 'wrongforge', info).error).toContain(
      'serves claude-a-1, claude-b-2 (default claude-a-1)',
    );
    expect(chooseModel(undefined, 'wrongforge', info)).toEqual({});
    expect(chooseModel('wrongforge', 'wrongforge', info)).toEqual({});
    // No list (older server): only a Claude-looking id goes through.
    expect(chooseModel('claude-x-1', 'wrongforge', undefined)).toEqual({ id: 'claude-x-1' });
    expect(chooseModel('gpt-9', 'wrongforge', undefined)).toEqual({});
  });

  it('sends the chosen model and fails fast on one WrongForge does not serve', async () => {
    const wf = await fakeWrongForge({
      models: ['claude-a-1', 'claude-b-2'],
      events: [{ type: 'task.started', data: { model: 'claude-b-2', workdir: '/proj' } }],
      final: { result: { text: 'ok', steps: 1, tool_calls: 0 } },
    });
    servers.push(wf);
    const live: ACPProgressEvent[] = [];
    const runner = makeWrongForgeRunner({
      projectRoot: '/proj',
      endpoint: () => ({ url: wf.url, apiKey: KEY }),
      publishLive: (_c, _t, e) => live.push(e),
    });
    const pick = (model: string) => {
      const { c } = ctx();
      (c.config as { model?: string }).model = model;
      return c;
    };
    await runner(task, pick('claude-b-2'));
    expect(wf.submitted[0]?.['model']).toBe('claude-b-2');
    // Watching: the fleet sees which model and folder the task started with.
    expect(live[0]).toMatchObject({ type: 'thought', text: expect.stringContaining('claude-b-2') });

    await expect(runner(task, pick('claude-nope'))).rejects.toMatchObject({
      message: expect.stringContaining('serves claude-a-1, claude-b-2'),
    });
    expect(wf.submitted).toHaveLength(1);
  });
});

describe('resolveWrongForgeEndpoint', () => {
  it('reads the key WrongForge saved, honouring WRONGFORGE_HOME and a BOM', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'wf-home-'));
    try {
      expect(resolveWrongForgeEndpoint({ WRONGFORGE_HOME: home })).toBeUndefined();
      writeFileSync(path.join(home, 'api-key'), `﻿${KEY}\n`);
      expect(resolveWrongForgeEndpoint({ WRONGFORGE_HOME: home })).toEqual({
        url: 'http://127.0.0.1:8787',
        apiKey: KEY,
      });
      expect(
        resolveWrongForgeEndpoint({ WRONGFORGE_API_KEY: 'short', WRONGFORGE_URL: 'http://h:1/' }),
      ).toBeUndefined();
      expect(
        resolveWrongForgeEndpoint({ WRONGFORGE_API_KEY: KEY, WRONGFORGE_URL: 'http://h:1/' }),
      ).toEqual({ url: 'http://h:1', apiKey: KEY });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
