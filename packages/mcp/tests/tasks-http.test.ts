import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPClient } from '../src/client.js';

const extension = 'io.modelcontextprotocol/tasks';
const capabilitiesKey = 'io.modelcontextprotocol/clientCapabilities';
const taskId = 'task/build:42';
const base = () => ({
  taskId,
  status: 'working',
  createdAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
  ttlMs: 60_000,
  pollIntervalMs: 1,
});
const form = {
  method: 'elicitation/create',
  params: {
    message: 'Choose branch',
    requestedSchema: {
      type: 'object',
      properties: { branch: { type: 'string' } },
      required: ['branch'],
    },
  },
};
type Message = { id: number; method: string; params: Record<string, any> };
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function peer(handle: (message: Message) => unknown, advertised = true) {
  const calls: Message[] = [];
  const headers: Array<Record<string, string | string[] | undefined>> = [];
  const times: number[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const bytes of req) raw += bytes.toString();
    const message: Message = JSON.parse(raw);
    calls.push(message);
    headers.push(req.headers);
    times.push(performance.now());
    let result: unknown;
    if (message.method === 'server/discover')
      result = {
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          ...(advertised ? { extensions: { [extension]: {} } } : {}),
        },
      };
    else if (message.method === 'tools/list')
      result = {
        resultType: 'complete',
        tools: [{ name: 'build', inputSchema: { type: 'object' } }],
      };
    else result = handle(message);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        ...(result && typeof result === 'object' && 'rpcError' in result
          ? { error: result.rpcError }
          : { result }),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const options = {
    name: 'task-peer',
    transport: 'streamable-http' as const,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`,
    allowPrivateNetworks: true,
    requestTimeoutMs: 2000,
  };
  const client = new MCPClient(options);
  cleanup.push(() => client.close());
  return { calls, headers, times, client, options };
}

describe('modern MCP Tasks over real HTTP', () => {
  it('finishes MRTR, then polls and answers task inputs once despite stale polls', async () => {
    const task = base();
    let polls = 0;
    const p = await peer((message) => {
      if (message.method === 'tools/call')
        return message.params.inputResponses
          ? { resultType: 'task', ...task }
          : {
              resultType: 'input_required',
              requestState: 'exact-state',
              inputRequests: { before: form },
            };
      if (message.method === 'tasks/update') return { resultType: 'complete' };
      polls++;
      return polls <= 2
        ? {
            resultType: 'complete',
            ...task,
            status: 'input_required',
            inputRequests: {
              branch: polls === 1 ? form : { params: form.params, method: form.method },
            },
          }
        : {
            resultType: 'complete',
            ...task,
            status: 'completed',
            result: {
              content: [{ type: 'text', text: 'Built main' }],
              structuredContent: { branch: 'main' },
            },
          };
    });
    const requester = { requestUserInput: vi.fn() };
    const elicitation = vi.fn(async (request) => {
      expect(request.requester).toBe(requester);
      return { action: 'accept' as const, content: { branch: 'main' } };
    });
    const client = new MCPClient({ ...p.options, elicitation });
    cleanup.push(() => client.close());
    await client.connect();
    const statuses: string[] = [];
    const result = await client.callTool(
      'build',
      { preserve: 'yes' },
      {
        requester,
        tasks: {
          onStatus: (state) => {
            statuses.push(state.status);
          },
        },
      },
    );
    expect(result).toMatchObject({
      content: [{ text: 'Built main' }],
      structuredContent: { branch: 'main' },
    });
    expect(elicitation).toHaveBeenCalledTimes(2);
    expect(p.calls.filter((c) => c.method === 'tools/call')).toHaveLength(2);
    expect(
      p.calls.filter((c) => c.method === 'tasks/update').map((c) => c.params.inputResponses),
    ).toEqual([{ branch: { action: 'accept', content: { branch: 'main' } } }]);
    expect(statuses[0]).toBe('working');
    expect(statuses.at(-1)).toBe('completed');
    for (const [index, call] of p.calls.entries()) {
      expect(p.headers[index]?.['mcp-method']).toBe(call.method);
      expect(p.headers[index]?.['mcp-protocol-version']).toBe('2026-07-28');
      if (call.method.startsWith('tasks/')) {
        expect(p.headers[index]?.['mcp-name']).toBe(taskId);
        expect(call.params._meta[capabilitiesKey].extensions[extension]).toEqual({});
      }
    }
    const toolCalls = p.calls.filter((c) => c.method === 'tools/call');
    expect(toolCalls[1]?.params).toMatchObject({
      arguments: { preserve: 'yes' },
      requestState: 'exact-state',
    });
    expect(new Set(p.calls.map((c) => c.id)).size).toBe(p.calls.length);
    const gets = p.calls.flatMap((c, i) => (c.method === 'tasks/get' ? [p.times[i]!] : []));
    expect(gets[1]! - gets[0]!).toBeGreaterThanOrEqual(80);
  });

  it('requests task cancellation once on user abort without replaying the tool or claiming a final remote state', async () => {
    const task = { ...base(), pollIntervalMs: 10_000 };
    const p = await peer((message) =>
      message.method === 'tools/call'
        ? { resultType: 'task', ...task }
        : { resultType: 'complete' },
    );
    await p.client.connect();
    const abort = new AbortController();
    const promise = p.client.callTool(
      'build',
      {},
      { signal: abort.signal, tasks: { onStatus: () => abort.abort() } },
    );
    await expect(promise).rejects.toMatchObject({ name: 'AbortError', taskId });
    expect(p.calls.filter((c) => c.method === 'tasks/cancel')).toHaveLength(1);
    expect(p.calls.filter((c) => c.method === 'tools/call')).toHaveLength(1);
    expect(p.calls.some((c) => c.method.startsWith('notifications/'))).toBe(false);
  });

  it('bounds a task wait independently of per-RPC timeout and cancels on expiry', async () => {
    const p = await peer(() => ({ resultType: 'task', ...base(), pollIntervalMs: 60_000 }));
    await p.client.connect();
    await expect(
      p.client.callTool('build', {}, { tasks: { timeoutMs: 80 } }),
    ).rejects.toMatchObject({ name: 'TimeoutError', taskId });
    expect(p.calls.filter((c) => c.method === 'tasks/cancel')).toHaveLength(1);
  });

  it('can resume a saved task on a fresh connection without invoking the tool again', async () => {
    const task = base();
    const p = await peer((message) =>
      message.method === 'tools/call'
        ? { resultType: 'task', ...task }
        : {
            resultType: 'complete',
            ...task,
            status: 'completed',
            result: { content: [{ type: 'text', text: 'Resumed' }] },
          },
    );
    await p.client.connect();
    let savedId = '';
    await expect(
      p.client.callTool(
        'build',
        {},
        {
          tasks: {
            onStatus: (state) => {
              savedId = state.taskId;
              throw new Error('Host suspended');
            },
          },
        },
      ),
    ).rejects.toThrow('Host suspended');
    await p.client.close();
    const next = new MCPClient(p.options);
    cleanup.push(() => next.close());
    await next.connect();
    expect(await next.waitForTask(savedId)).toMatchObject({ content: [{ text: 'Resumed' }] });
    expect(p.calls.filter((c) => c.method === 'tools/call')).toHaveLength(1);
    expect(p.calls.some((c) => c.method === 'tasks/cancel')).toBe(false);
  });

  it.each([false, true])(
    'refuses unnegotiated task creation (advertised=%s, explicitly disabled when true)',
    async (advertised) => {
      const p = await peer(() => ({ resultType: 'task', ...base() }), advertised);
      await p.client.connect();
      await expect(
        p.client.callTool('build', {}, advertised ? { tasks: false } : undefined),
      ).rejects.toThrow();
      const call = p.calls.find((c) => c.method === 'tools/call')!;
      expect(call.params._meta[capabilitiesKey].extensions).toBeUndefined();
      expect(p.calls.some((c) => c.method === 'tasks/get')).toBe(false);
    },
  );

  it.each(['failed', 'cancelled', 'wrong-id', 'not-found'])(
    'surfaces %s without retrying the original operation',
    async (status) => {
      const task = base();
      const p = await peer((message) => {
        if (message.method === 'tools/call') return { resultType: 'task', ...task };
        if (status === 'not-found') return { rpcError: { code: -32602, message: 'No such task' } };
        return {
          resultType: 'complete',
          ...task,
          taskId: status === 'wrong-id' ? 'another-task' : taskId,
          status: status === 'wrong-id' ? 'working' : status,
          ...(status === 'failed' ? { error: { code: -32603, message: 'Build failed' } } : {}),
        };
      });
      await p.client.connect();
      await expect(p.client.callTool('build', {})).rejects.toThrow();
      expect(p.calls.filter((c) => c.method === 'tools/call')).toHaveLength(1);
      expect(p.calls.filter((c) => c.method === 'tasks/get')).toHaveLength(1);
    },
  );

  it('returns completed tool isError distinctly from a task execution error', async () => {
    const task = base();
    const p = await peer((message) =>
      message.method === 'tools/call'
        ? { resultType: 'task', ...task }
        : {
            resultType: 'complete',
            ...task,
            status: 'completed',
            result: { isError: true, content: [{ type: 'text', text: 'Invalid branch' }] },
          },
    );
    await p.client.connect();
    expect(await p.client.callTool('build', {})).toMatchObject({
      isError: true,
      content: [{ text: 'Invalid branch' }],
    });
    expect((await p.client.getTask(taskId)).status).toBe('completed');
  });

  it('does not hold cancellation behind a host status callback that ignores its signal', async () => {
    const p = await peer((m) =>
      m.method === 'tools/call' ? { resultType: 'task', ...base() } : { resultType: 'complete' },
    );
    await p.client.connect();
    await expect(
      p.client.callTool(
        'build',
        {},
        { tasks: { timeoutMs: 80, onStatus: () => new Promise(() => {}) } },
      ),
    ).rejects.toMatchObject({ name: 'TimeoutError', taskId });
    expect(p.calls.filter((c) => c.method === 'tasks/cancel')).toHaveLength(1);
  });

  it('closes a waiting task promptly without attempting another request on the closed connection', async () => {
    const p = await peer(() => ({ resultType: 'task', ...base(), pollIntervalMs: 60_000 }));
    await p.client.connect();
    await expect(
      p.client.callTool('build', {}, { tasks: { onStatus: () => p.client.close() } }),
    ).rejects.toMatchObject({ name: 'AbortError', taskId });
    expect(
      p.calls.filter((c) => c.method === 'tasks/get' || c.method === 'tasks/cancel'),
    ).toHaveLength(0);
  });

  it('acknowledges a manual cancel separately from subsequently observed status', async () => {
    const p = await peer((m) =>
      m.method === 'tasks/cancel'
        ? { resultType: 'complete' }
        : { resultType: 'complete', ...base() },
    );
    await p.client.connect();
    await expect(p.client.cancelTask(taskId)).resolves.toBeUndefined();
    expect((await p.client.getTask(taskId)).status).toBe('working');
  });

  it.each(['resources/read', 'prompts/get'])(
    'does not opt %s into task creation',
    async (method) => {
      const p = await peer(() => ({ resultType: 'task', ...base() }));
      await p.client.connect();
      await expect(
        method === 'resources/read'
          ? p.client.readResource('memo://build')
          : p.client.getPrompt('build'),
      ).rejects.toThrow();
      const call = p.calls.find((c) => c.method === method)!;
      expect(call.params._meta[capabilitiesKey].extensions).toBeUndefined();
      expect(p.calls.some((c) => c.method === 'tasks/get')).toBe(false);
    },
  );

  it('rejects invalid wait policy before invoking a mutating tool', async () => {
    const p = await peer(() => ({ resultType: 'task', ...base() }));
    await p.client.connect();
    await expect(
      p.client.callTool('build', {}, { tasks: { timeoutMs: Number.NaN } }),
    ).rejects.toThrow('timeoutMs');
    expect(p.calls.some((c) => c.method === 'tools/call')).toBe(false);
  });
});
