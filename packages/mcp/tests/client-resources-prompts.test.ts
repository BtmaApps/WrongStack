import { describe, expect, it, vi } from 'vitest';
import { type JsonRpcResponse, MCPClient } from '../src/client.js';
import type { MCPServerMetadata } from '../src/protocol.js';

type RequestFn = (
  method: string,
  params: unknown,
  timeoutMs?: number,
  opts?: { signal?: AbortSignal | undefined },
) => Promise<JsonRpcResponse>;

function connectedClient(
  capabilities: MCPServerMetadata['capabilities'],
  request: RequestFn,
): MCPClient {
  const client = new MCPClient({ name: 'fixture', transport: 'stdio', command: 'fixture' });
  const internals = client as never as {
    state: 'connected';
    _serverMetadata: MCPServerMetadata;
    request: RequestFn;
  };
  internals.state = 'connected';
  internals._serverMetadata = {
    protocolVersion: '2025-06-18',
    capabilities,
    serverInfo: { name: 'fixture', version: '1.0.0' },
  };
  internals.request = request;
  return client;
}

describe('MCPClient resources and prompts', () => {
  it('supports typed resources and prompts over streamable HTTP', async () => {
    const methods: string[] = [];
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch: typeof globalThis.fetch }).fetch = (async (_url, init) => {
      const request = JSON.parse(String(init?.body ?? '{}')) as {
        id?: number | undefined;
        method: string;
      };
      methods.push(request.method);
      if (request.method === 'notifications/initialized') {
        return new Response('', { status: 202 });
      }
      const result =
        request.method === 'initialize'
          ? {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {}, resources: {}, prompts: {} },
              serverInfo: { name: 'http-fixture', version: '1.0.0' },
            }
          : request.method === 'tools/list'
            ? { tools: [] }
            : request.method === 'resources/list'
              ? { resources: [{ uri: 'https://m.test/guide', name: 'guide' }] }
              : { messages: [{ role: 'assistant', content: { type: 'text', text: 'ready' } }] };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    const client = new MCPClient({
      name: 'http-fixture',
      transport: 'streamable-http',
      url: 'https://m.test/mcp',
    });
    try {
      await client.connect();
      expect(client.getServerMetadata()?.capabilities).toMatchObject({
        resources: {},
        prompts: {},
      });
      await expect(client.listResources()).resolves.toMatchObject({
        resources: [{ name: 'guide' }],
      });
      await expect(client.getPrompt('ready')).resolves.toMatchObject({
        messages: [{ role: 'assistant' }],
      });
      expect(methods).toEqual([
        'initialize',
        'notifications/initialized',
        'tools/list',
        'resources/list',
        'prompts/get',
      ]);
    } finally {
      await client.close();
      (globalThis as { fetch: typeof globalThis.fetch }).fetch = originalFetch;
    }
  });

  it('sends paginated resource methods and parses their results', async () => {
    const request = vi.fn<RequestFn>(async (method) => {
      if (method === 'resources/list') {
        return {
          jsonrpc: '2.0',
          id: 1,
          result: { resources: [{ uri: 'mem://one', name: 'one' }], nextCursor: 'next' },
        };
      }
      return {
        jsonrpc: '2.0',
        id: 2,
        result: { resourceTemplates: [{ uriTemplate: 'mem://{id}', name: 'memory' }] },
      };
    });
    const client = connectedClient({ resources: {} }, request);

    await expect(client.listResources({ cursor: 'page-1' })).resolves.toMatchObject({
      resources: [{ uri: 'mem://one' }],
      nextCursor: 'next',
    });
    await expect(client.listResourceTemplates()).resolves.toMatchObject({
      resourceTemplates: [{ uriTemplate: 'mem://{id}' }],
    });
    expect(request).toHaveBeenNthCalledWith(1, 'resources/list', { cursor: 'page-1' }, undefined, {
      cursor: 'page-1',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'resources/templates/list', {}, undefined, {});
  });

  it('passes cancellation to resources/read', async () => {
    const request = vi.fn<RequestFn>(async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: { contents: [{ uri: 'mem://one', text: 'hello' }] },
    }));
    const client = connectedClient({ resources: {} }, request);
    const controller = new AbortController();

    await client.readResource('mem://one', { signal: controller.signal });

    expect(request).toHaveBeenCalledWith('resources/read', { uri: 'mem://one' }, undefined, {
      signal: controller.signal,
    });
  });

  it('subscribes and unsubscribes only when advertised', async () => {
    const request = vi.fn<RequestFn>(async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    }));
    const client = connectedClient({ resources: { subscribe: true } }, request);

    await client.subscribeResource('mem://one');
    await client.unsubscribeResource('mem://one');
    expect(request).toHaveBeenNthCalledWith(
      1,
      'resources/subscribe',
      { uri: 'mem://one' },
      undefined,
      {},
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      'resources/unsubscribe',
      { uri: 'mem://one' },
      undefined,
      {},
    );

    const unsupportedRequest = vi.fn<RequestFn>();
    const unsupported = connectedClient({ resources: {} }, unsupportedRequest);
    await expect(unsupported.subscribeResource('mem://one')).rejects.toThrow(
      /does not advertise resource subscriptions/,
    );
    expect(unsupportedRequest).not.toHaveBeenCalled();
  });

  it('publishes a resources/updated notification to subscribers', () => {
    const client = connectedClient(
      { resources: { subscribe: true, listChanged: true } },
      vi.fn<RequestFn>(),
    );
    const onUpdated = vi.fn();
    client.addResourceUpdatedListener(onUpdated);
    const onLine = (client as never as { onLine: (line: string) => void }).onLine.bind(client);

    onLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/resources/updated',
        params: { uri: 'mem://one' },
      }),
    );
    expect(onUpdated).toHaveBeenCalledWith('fixture', 'mem://one');

    // A malformed notification is dropped, not thrown: it has no reply.
    onLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/resources/updated' }));
    expect(onUpdated).toHaveBeenCalledTimes(1);

    client.removeResourceUpdatedListener(onUpdated);
    onLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/resources/updated',
        params: { uri: 'mem://two' },
      }),
    );
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('publishes stdio resource and prompt list-change notifications', () => {
    const client = connectedClient(
      { resources: { listChanged: true }, prompts: { listChanged: true } },
      vi.fn<RequestFn>(),
    );
    const onResources = vi.fn();
    const onPrompts = vi.fn();
    client.addResourcesChangedListener(onResources);
    client.addPromptsChangedListener(onPrompts);
    const onLine = (client as never as { onLine: (line: string) => void }).onLine.bind(client);

    onLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' }));
    onLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/prompts/list_changed' }));

    expect(onResources).toHaveBeenCalledWith('fixture');
    expect(onPrompts).toHaveBeenCalledWith('fixture');
    client.removeResourcesChangedListener(onResources);
    client.removePromptsChangedListener(onPrompts);
    onLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' }));
    expect(onResources).toHaveBeenCalledTimes(1);
  });

  it('lists and gets prompts with validated arguments', async () => {
    const request = vi.fn<RequestFn>(async (method) => ({
      jsonrpc: '2.0',
      id: 1,
      result:
        method === 'prompts/list'
          ? { prompts: [{ name: 'review', arguments: [{ name: 'target', required: true }] }] }
          : { messages: [{ role: 'user', content: { type: 'text', text: 'Review src/' } }] },
    }));
    const client = connectedClient({ prompts: {} }, request);

    await expect(client.listPrompts()).resolves.toMatchObject({ prompts: [{ name: 'review' }] });
    await expect(client.getPrompt('review', { target: 'src/' })).resolves.toMatchObject({
      messages: [{ role: 'user' }],
    });
    expect(request).toHaveBeenLastCalledWith(
      'prompts/get',
      { name: 'review', arguments: { target: 'src/' } },
      undefined,
      {},
    );
  });

  it('rejects tools-only servers without issuing resource or prompt requests', async () => {
    const request = vi.fn<RequestFn>();
    const client = connectedClient({ tools: {} }, request);

    await expect(client.listResources()).rejects.toThrow(/does not advertise the resources/);
    await expect(client.listPrompts()).rejects.toThrow(/does not advertise the prompts/);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects invalid input before issuing a request', async () => {
    const request = vi.fn<RequestFn>();
    const client = connectedClient({ resources: {}, prompts: {} }, request);

    await expect(client.readResource('')).rejects.toThrow(/resource URI/);
    await expect(client.listResources({ cursor: '' })).rejects.toThrow(/cursor/);
    await expect(client.getPrompt('', {})).rejects.toThrow(/prompt name/);
    await expect(client.getPrompt('review', { target: 42 as never as string })).rejects.toThrow(
      /prompt argument/,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('surfaces JSON-RPC errors and malformed successful responses', async () => {
    const rpcError = connectedClient({ resources: {} }, async () => ({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32_602, message: 'bad params' },
    }));
    await expect(rpcError.readResource('mem://one')).rejects.toThrow(
      /MCP resources\/read failed: bad params/,
    );

    const malformed = connectedClient({ prompts: {} }, async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: { messages: 'not-an-array' },
    }));
    await expect(malformed.getPrompt('review')).rejects.toThrow(/messages must be an array/);
  });
});
