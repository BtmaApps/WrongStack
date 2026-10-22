import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPClient } from '../src/client.js';
import type { ElicitationRequester, MCPClientElicitationHandler } from '../src/elicitation.js';

interface Message {
  id: number;
  method: string;
  params: Record<string, unknown>;
}
const clients: MCPClient[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  vi.restoreAllMocks();
});
const form = {
  method: 'elicitation/create',
  params: {
    message: 'Choose a branch',
    requestedSchema: {
      type: 'object',
      properties: { branch: { type: 'string' } },
      required: ['branch'],
    },
  },
};
const accept = async () => ({ action: 'accept' as const, content: { branch: 'main' } });
async function peer(
  reply: (message: Message) => unknown,
  elicitation?: MCPClientElicitationHandler,
  requestTimeoutMs = 30_000,
) {
  const calls: Message[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const message: Message = JSON.parse(String(init?.body));
    calls.push(message);
    const result =
      message.method === 'server/discover'
        ? {
            resultType: 'complete',
            supportedVersions: ['2026-07-28'],
            capabilities: { tools: {}, resources: {}, prompts: {} },
          }
        : message.method === 'tools/list'
          ? { resultType: 'complete', tools: [] }
          : await reply(message);
    return Response.json({ jsonrpc: '2.0', id: message.id, result });
  });
  const client = new MCPClient({
    name: 'mrtr-peer',
    transport: 'streamable-http',
    url: 'http://127.0.0.1:3123/mcp',
    elicitation,
    requestTimeoutMs,
  });
  clients.push(client);
  await client.connect();
  return { client, calls };
}
describe('MRTR consent, isolation and bounds', () => {
  it('uses one cumulative wire-time budget across retries', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    let round = 0;
    const { client, calls } = await peer(
      () => {
        now += 60;
        return ++round === 1
          ? { resultType: 'input_required', requestState: 'next' }
          : { resultType: 'complete', content: [] };
      },
      undefined,
      100,
    );
    await expect(client.callTool('budget', {})).rejects.toThrow('timed out');
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(2);
  });
  it('excludes the user typing time from the wire budget', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { client } = await peer(
      (message) => {
        now += 20;
        return message.params.inputResponses
          ? { resultType: 'complete', content: [] }
          : { resultType: 'input_required', inputRequests: { choose: form } };
      },
      async () => {
        now += 10_000;
        return accept();
      },
      100,
    );
    await expect(client.callTool('typing', {})).resolves.toMatchObject({ isError: false });
  });
  it('returns URL consent without forwarding form content or opening anything itself', async () => {
    const urlRequest = {
      method: 'elicitation/create',
      params: {
        mode: 'url',
        elicitationId: 'authorization',
        message: 'Complete authorization',
        url: 'https://example.test/authorize',
      },
    };
    const handler = vi.fn(accept);
    const { client, calls } = await peer(
      (message) =>
        message.params.inputResponses
          ? { resultType: 'complete', content: [] }
          : { resultType: 'input_required', inputRequests: { authorize: urlRequest } },
      handler,
    );
    await client.callTool('authorize', {});
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'url', url: 'https://example.test/authorize' }),
    );
    expect(calls.at(-1)!.params.inputResponses).toEqual({ authorize: { action: 'accept' } });
  });
  it('drops state and responses from previous rounds instead of replaying them', async () => {
    let round = 0;
    const { client, calls } = await peer(
      () =>
        ++round === 1
          ? { resultType: 'input_required', requestState: 'state-only' }
          : round === 2
            ? { resultType: 'input_required', inputRequests: { name: form } }
            : { resultType: 'complete', content: [] },
      accept,
    );
    await client.callTool('choose', {});
    const attempts = calls.filter((call) => call.method === 'tools/call');
    expect(attempts[1]!.params.requestState).toBe('state-only');
    expect(attempts[1]!.params).not.toHaveProperty('inputResponses');
    expect(attempts[2]!.params).not.toHaveProperty('requestState');
    expect(attempts[2]!.params.inputResponses).toEqual({
      name: { action: 'accept', content: { branch: 'main' } },
    });
  });
  it('keeps prototype-like response keys as opaque own keys', async () => {
    const { client, calls } = await peer(
      (message) =>
        message.params.inputResponses
          ? { resultType: 'complete', content: [] }
          : {
              resultType: 'input_required',
              inputRequests: Object.fromEntries([['__proto__', form]]),
            },
      accept,
    );
    await client.callTool('choose', {});
    const answers = calls.at(-1)!.params.inputResponses as Record<string, unknown>;
    expect(Object.hasOwn(answers, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(answers, '__proto__')?.value).toEqual({
      action: 'accept',
      content: { branch: 'main' },
    });
    expect(Object.prototype).not.toHaveProperty('branch');
  });
  it('bounds state-only retries instead of entering a runaway loop', async () => {
    const { client, calls } = await peer(() => ({
      resultType: 'input_required',
      requestState: 'same',
    }));
    await expect(client.callTool('loop', {})).rejects.toThrow('exceeded eight rounds');
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(9);
  });
  it.each([
    ['missing state and requests', {}],
    ['array requests', { inputRequests: [] }],
    ['non-string state', { requestState: 42 }],
    ['oversized state', { requestState: 'x'.repeat(256 * 1024) }],
    [
      'unadvertised sampling',
      { inputRequests: { valid: form, invalid: { method: 'sampling/createMessage', params: {} } } },
    ],
    [
      'malformed second form',
      { inputRequests: { valid: form, invalid: { method: 'elicitation/create', params: {} } } },
    ],
    [
      'too many forms',
      {
        inputRequests: Object.fromEntries(
          Array.from({ length: 9 }, (_, index) => [String(index), form]),
        ),
      },
    ],
  ])('refuses %s before any prompt', async (_name, patch) => {
    const handler = vi.fn(accept);
    const { client, calls } = await peer(
      () => ({ resultType: 'input_required', ...(patch as object) }),
      handler,
    );
    await expect(client.callTool('invalid', {})).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(1);
  });
  it('never advertises or fulfills elicitation without a host handler', async () => {
    const { client, calls } = await peer(() => ({
      resultType: 'input_required',
      inputRequests: { choose: form },
    }));
    await expect(client.callTool('choose', {})).rejects.toThrow('unadvertised');
    expect(
      (calls.at(-1)!.params._meta as Record<string, unknown>)[
        'io.modelcontextprotocol/clientCapabilities'
      ],
    ).toEqual({});
  });
  it('refuses interaction on control methods', async () => {
    const handler = vi.fn();
    const { client } = await peer(
      () => ({ resultType: 'input_required', inputRequests: { choose: form } }),
      handler,
    );
    await expect(client.ping()).rejects.toThrow('not permitted for ping');
    expect(handler).not.toHaveBeenCalled();
  });
  it('echoes a decline once and refuses another prompt', async () => {
    const handler = vi.fn(async () => ({ action: 'decline' as const }));
    const { client, calls } = await peer(
      () => ({ resultType: 'input_required', inputRequests: { choose: form } }),
      handler,
    );
    await expect(client.callTool('choose', {})).rejects.toThrow('after the user declined');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)!.params.inputResponses).toEqual({ choose: { action: 'decline' } });
  });
  it('cancels a waiting form promptly even when its host ignores the signal', async () => {
    let shown!: () => void;
    const waiting = new Promise<void>((resolve) => {
      shown = resolve;
    });
    let formSignal: AbortSignal | undefined;
    const { client, calls } = await peer(
      (message) =>
        message.params.name === 'clean'
          ? { resultType: 'complete', content: [] }
          : { resultType: 'input_required', inputRequests: { choose: form } },
      async (request) => {
        formSignal = request.signal;
        shown();
        return new Promise(() => {});
      },
    );
    const abort = new AbortController();
    const rejected = expect(
      client.callTool('choose', {}, { signal: abort.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await waiting;
    abort.abort();
    await rejected;
    expect(formSignal?.aborted).toBe(true);
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(1);
    await expect(client.callTool('clean', {})).resolves.toMatchObject({ isError: false });
  });
  it('closes waiting forms with the connection without another RPC', async () => {
    let shown!: () => void;
    const waiting = new Promise<void>((resolve) => {
      shown = resolve;
    });
    const { client, calls } = await peer(
      () => ({ resultType: 'input_required', inputRequests: { choose: form } }),
      async () => {
        shown();
        return new Promise(() => {});
      },
    );
    const rejected = expect(client.callTool('choose', {})).rejects.toMatchObject({
      name: 'AbortError',
    });
    await waiting;
    await client.close();
    await rejected;
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(1);
  });
  it('keeps the originating requester and opaque state separate for parallel calls', async () => {
    const first: ElicitationRequester = { requestUserInput: vi.fn() },
      second: ElicitationRequester = { requestUserInput: vi.fn() };
    const origins: Array<ElicitationRequester | undefined> = [];
    let finishFirst!: () => void;
    const firstFinished = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const { client, calls } = await peer(
      async (message) => {
        if (message.params.inputResponses) {
          if (message.params.name === 'first') finishFirst();
          return { resultType: 'complete', content: [] };
        }
        if (message.params.name === 'second') await firstFinished;
        return {
          resultType: 'input_required',
          inputRequests: { choose: form },
          requestState: message.params.name,
        };
      },
      async (request) => {
        origins.push(request.requester);
        return accept();
      },
    );
    await Promise.all([
      client.callTool('first', {}, { requester: first }),
      client.callTool('second', {}, { requester: second }),
    ]);
    for (const call of calls.filter((call) => call.params.inputResponses))
      expect(call.params.requestState).toBe(call.params.name);
    expect(origins).toEqual([first, second]);
    for (const call of calls) expect(JSON.stringify(call.params)).not.toContain('requestUserInput');
  });
});
