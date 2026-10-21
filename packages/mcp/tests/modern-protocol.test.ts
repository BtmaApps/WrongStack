import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  modernRequestHeaders,
  toolHeaderBindings,
  validateModernHeaders,
} from '../src/modern-http-headers.js';
import { MCPServer } from '../src/server-dispatch.js';
import { serveHttp } from '../src/server-http.js';
import { StreamableHTTPTransport } from '../src/transport-streamable.js';

const meta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'fixture-client', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};
const schema = {
  type: 'object',
  properties: { tenant: { type: 'string', 'x-mcp-header': 'Tenant' } },
};
const host = () => ({
  listTools: () => [{ name: 'echo', inputSchema: schema }],
  callTool: vi.fn(async (_name: string, args: Record<string, unknown>) => ({
    content: JSON.stringify(args),
    isError: false,
  })),
});
const handles: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const handle of handles.splice(0).reverse()) await handle.close();
});

describe('modern MCP core', () => {
  it('isolates cancellation for concurrent HTTP requests that reuse a JSON-RPC id', async () => {
    const waiting = new Map<string, () => void>();
    const aborted: string[] = [];
    const server = await serveHttp(
      new MCPServer({
        host: {
          listTools: () => [{ name: 'wait', inputSchema: { type: 'object' } }],
          callTool: async (_name, args, options) =>
            new Promise((resolve) => {
              const label = String(args['label']);
              const finish = () => resolve({ content: label, isError: false });
              waiting.set(label, finish);
              options?.signal?.addEventListener(
                'abort',
                () => {
                  aborted.push(label);
                  finish();
                },
                { once: true },
              );
            }),
        },
      }),
    );
    handles.push(server);
    const controller = new AbortController();
    const request = (label: string, signal?: AbortSignal) =>
      fetch(server.url, {
        method: 'POST',
        signal: signal ?? null,
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': 'tools/call',
          'Mcp-Name': 'wait',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 41,
          method: 'tools/call',
          params: { name: 'wait', arguments: { label }, _meta: meta },
        }),
      });
    const first = request('first', controller.signal).catch(() => undefined);
    const second = request('second');
    try {
      await vi.waitFor(() => expect(waiting.size).toBe(2));
      expect(aborted).toEqual([]);
      controller.abort();
      await vi.waitFor(() => expect(aborted).toEqual(['first']));
      waiting.get('second')!();
      expect(await (await second).json()).toMatchObject({
        result: { resultType: 'complete', isError: false },
      });
      await first;
    } finally {
      for (const finish of waiting.values()) finish();
    }
  });
  it.each([-32020, -32021, -32022])(
    'never downgrades a recognized modern error %s',
    async (code) => {
      const methods: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        const request = JSON.parse(String(init?.body));
        methods.push(request.method);
        return Response.json(
          {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code,
              message: 'Modern request rejected',
              data: { supported: ['2099-01-01'], requested: '2026-07-28' },
            },
          },
          { status: 400 },
        );
      });
      const client = new StreamableHTTPTransport({
        name: 'future',
        url: 'https://example.test/mcp',
      });
      handles.push(client);
      await expect(client.connect()).rejects.toThrow('Modern request rejected');
      expect(methods).toEqual(['server/discover']);
    },
  );

  it('speaks the modern HTTP wire format to an independent peer and excludes invalid header tools', async () => {
    const methods: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const headers = new Headers(init?.headers);
      expect(headers.get('MCP-Protocol-Version')).toBe('2026-07-28');
      expect(headers.get('Mcp-Method')).toBe(request.method);
      expect(headers.has('Mcp-Session-Id')).toBe(false);
      expect(request.params._meta['io.modelcontextprotocol/clientInfo'].name).toBe('wrongstack');
      expect(request.params._meta['io.modelcontextprotocol/clientCapabilities']).toEqual({});
      methods.push(request.method);
      if (request.method === 'server/discover')
        return Response.json(
          {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              resultType: 'complete',
              supportedVersions: ['2026-07-28'],
              capabilities: { tools: {} },
            },
          },
          { headers: { 'Mcp-Session-Id': 'must-ignore' } },
        );
      if (request.method === 'tools/list')
        return Response.json({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            resultType: 'complete',
            tools: [
              { name: 'echo', inputSchema: { properties: { nested: schema } } },
              {
                name: 'invalid',
                inputSchema: { properties: { a: { type: 'number', 'x-mcp-header': 'A' } } },
              },
            ],
          },
        });
      expect(request.method).toBe('tools/call');
      expect(headers.get('Mcp-Name')).toBe('echo');
      expect(headers.get('Mcp-Param-Tenant')).toBe('=?base64?xLBzdGFuYnVs?=');
      return new Response(
        [
          { jsonrpc: '2.0', id: 9001, method: 'elicitation/create', params: {} },
          {
            jsonrpc: '2.0',
            id: request.id,
            result: { resultType: 'complete', content: [{ type: 'text', text: 'okay' }] },
          },
        ]
          .map((message) => `data: ${JSON.stringify(message)}\n\n`)
          .join(''),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    });
    const client = new StreamableHTTPTransport({
      name: 'wire',
      url: 'https://example.test/mcp',
      headers: {
        'mcp-method': 'stale',
        'mcp-session-id': 'must-ignore',
        'mcp-param-tenant': 'stale',
        Accept: 'text/plain',
      },
    });
    handles.push(client);
    await client.connect();
    expect(client.listTools().map((tool) => tool.name)).toEqual(['echo']);
    expect((await client.callTool('echo', { nested: { tenant: 'İstanbul' } })).isError).toBe(false);
    expect(methods).toEqual(['server/discover', 'tools/list', 'tools/call']);
  });

  it('disconnects on a modern authorization failure even when it contains a JSON-RPC error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === 'ping')
        return Response.json(
          { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: 'forbidden' } },
          { status: 403 },
        );
      return Response.json({
        jsonrpc: '2.0',
        id: request.id,
        result:
          request.method === 'server/discover'
            ? { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: {} }
            : { resultType: 'complete', tools: [] },
      });
    });
    const client = new StreamableHTTPTransport({ name: 'auth', url: 'https://example.test/mcp' });
    handles.push(client);
    await client.connect();
    expect((await client.request('ping', {})).error?.message).toBe('forbidden');
    expect(client.getState()).toBe('disconnected');
  });
  it('discovers without initialize and serves complete results with per-request validation', async () => {
    const backend = host();
    const server = new MCPServer({ host: backend });
    const request = async (method: string, params: object) =>
      JSON.parse(
        (await server.handleMessage(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })))!,
      );
    expect((await request('server/discover', { _meta: meta })).result).toMatchObject({
      resultType: 'complete',
      supportedVersions: ['2026-07-28', '2024-11-05'],
    });
    expect(
      (await request('tools/call', { name: 'echo', arguments: { tenant: 'team' }, _meta: meta }))
        .result,
    ).toMatchObject({ resultType: 'complete', isError: false });
    expect(
      (
        await request('tools/list', {
          _meta: { ...meta, 'io.modelcontextprotocol/protocolVersion': '2099-01-01' },
        })
      ).error,
    ).toMatchObject({
      code: -32022,
      data: { requested: '2099-01-01', supported: ['2026-07-28', '2024-11-05'] },
    });
    expect(
      (
        await request('tools/call', {
          name: 'echo',
          _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
        })
      ).error.code,
    ).toBe(-32602);
    expect(backend.callTool).toHaveBeenCalledTimes(1);
    // The old path still uses its actual implemented handshake revision.
    expect(
      (await request('initialize', { protocolVersion: '2024-11-05' })).result.protocolVersion,
    ).toBe('2024-11-05');
  });

  it('connects over real stateless HTTP and mirrors Unicode and nested tool parameters', async () => {
    const backend = host();
    const server = await serveHttp(new MCPServer({ host: backend }));
    handles.push(server);
    const client = new StreamableHTTPTransport({ name: 'fixture', url: server.url });
    handles.push(client);
    await client.connect();
    expect(client.getServerMetadata()?.protocolVersion).toBe('2026-07-28');
    const result = await client.callTool('echo', { tenant: ' İstanbul ' });
    expect(result.isError).toBe(false);
    expect(backend.callTool).toHaveBeenCalledWith(
      'echo',
      { tenant: ' İstanbul ' },
      expect.anything(),
    );
  });

  it('rejects header/body mismatches before executing and returns modern HTTP error statuses', async () => {
    const backend = host();
    const server = await serveHttp(new MCPServer({ host: backend }));
    handles.push(server);
    const send = async (method: string, params: object, extra: Record<string, string> = {}) => {
      const response = await fetch(server.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': method,
          ...extra,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { _meta: meta, ...params } }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { error: { code: number } },
      };
    };
    const mismatch = await send(
      'tools/call',
      { name: 'echo', arguments: { tenant: 'a' } },
      { 'Mcp-Name': 'echo', 'Mcp-Param-Tenant': 'b' },
    );
    expect(mismatch).toMatchObject({ status: 400, body: { error: { code: -32020 } } });
    expect(await send('unknown', {})).toMatchObject({
      status: 404,
      body: { error: { code: -32601 } },
    });
    const unsupported = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2099-01-01',
        'Mcp-Method': 'tools/list',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: { _meta: { ...meta, 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } },
      }),
    });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: { code: -32022 } });
    expect(backend.callTool).not.toHaveBeenCalled();
  });

  it.each(['İstanbul', ' leading', 'trailing ', 'a\r\nb', '=?base64?literal?=', 'plain'])(
    'roundtrips header value %j',
    (value) => {
      const params = { _meta: meta, name: value, arguments: { tenant: value } };
      const headers = modernRequestHeaders('tools/call', params, schema);
      expect(() =>
        validateModernHeaders('tools/call', params, new Headers(headers), schema),
      ).not.toThrow();
      const encoded = /^=\?base64\?(.+)\?=$/.exec(headers['Mcp-Name']!);
      expect(
        encoded ? Buffer.from(encoded[1]!, 'base64').toString('utf8') : headers['Mcp-Name'],
      ).toBe(value);
    },
  );
  it('rejects invalid schema header annotations and malformed encodings', () => {
    for (const invalid of [
      { type: 'string', 'x-mcp-header': 'Root' },
      { properties: { a: { type: 'number', 'x-mcp-header': 'A' } } },
      { properties: { a: { type: 'string', 'x-mcp-header': 'Bad\nHeader' } } },
      {
        properties: {
          a: { type: 'string', 'x-mcp-header': 'A' },
          b: { type: 'string', 'x-mcp-header': 'a' },
        },
      },
      { allOf: [{ properties: { a: { type: 'string', 'x-mcp-header': 'A' } } }] },
    ])
      expect(() => toolHeaderBindings(invalid)).toThrow();
    expect(toolHeaderBindings({ properties: { nested: schema } })[0]?.path).toEqual([
      'nested',
      'tenant',
    ]);
    expect(() =>
      validateModernHeaders(
        'tools/call',
        { _meta: meta, name: 'echo', arguments: {} },
        new Headers({
          ...modernRequestHeaders('tools/call', { name: 'echo' }),
          'Mcp-Name': '=?base64?bogus?=',
        }),
        schema,
      ),
    ).toThrow();
  });
});
