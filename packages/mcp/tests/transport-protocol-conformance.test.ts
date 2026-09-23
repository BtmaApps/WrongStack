import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPClient } from '../src/client.js';
import { SSEReader } from '../src/sse-reader.js';
import { listAllTools } from '../src/tool-schema.js';
import { SSETransport, StreamableHTTPTransport } from '../src/transport.js';
import { encodeJsonRpcMessage } from '../src/transport-jsonrpc.js';

/**
 * Wire-level conformance regressions found in the 2026-09-14 MCP audit. Each
 * case was silently wrong against real servers while the in-body mocks the
 * older suites use kept passing.
 */

const INIT_RESULT = {
  protocolVersion: '2024-11-05',
  capabilities: { tools: {} },
  serverInfo: { name: 'conformance', version: '1.0.0' },
};

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe('JSON-RPC encoding', () => {
  it('omits the id on notifications and keeps it on requests', () => {
    expect(JSON.parse(encodeJsonRpcMessage(4, 'notifications/initialized', {}))).toEqual({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });
    expect(JSON.parse(encodeJsonRpcMessage(5, 'tools/list', {}))).toMatchObject({ id: 5 });
  });
});

describe('listAllTools', () => {
  const page = (names: string[], nextCursor?: string) => ({
    result: {
      tools: names.map((name) => ({ name, inputSchema: { type: 'object' } })),
      ...(nextCursor ? { nextCursor } : {}),
    },
  });

  it('follows nextCursor across pages', async () => {
    const seen: unknown[] = [];
    const pages = [page(['a'], 'c1'), page(['b'], 'c2'), page(['c'])];
    const tools = await listAllTools(async (params) => {
      seen.push(params);
      return pages.shift() ?? page([]);
    });
    expect(tools?.map((t) => t.name)).toEqual(['a', 'b', 'c']);
    expect(seen).toEqual([{}, { cursor: 'c1' }, { cursor: 'c2' }]);
  });

  it('stops on a repeated cursor instead of looping', async () => {
    let calls = 0;
    const tools = await listAllTools(async () => {
      calls++;
      return page([`t${calls}`], 'same');
    });
    expect(calls).toBe(2);
    expect(tools).toHaveLength(2);
  });

  it('returns null for a first-page error and keeps pages collected before a later one', async () => {
    await expect(listAllTools(async () => ({ error: { message: 'no' } }))).resolves.toBeNull();
    const pages: Array<{ result?: unknown; error?: unknown }> = [
      page(['a'], 'c1'),
      { error: { message: 'boom' } },
    ];
    await expect(listAllTools(async () => pages.shift() ?? {})).resolves.toEqual([
      { name: 'a', inputSchema: { type: 'object' } },
    ]);
  });
});

describe('stdio client server requests', () => {
  it('answers a server ping with an empty result', async () => {
    const client = new MCPClient({ name: 'ping', transport: 'stdio', command: 'echo' });
    const write = vi.fn((_value: string) => true);
    const internals = client as never as {
      child: { stdin: { write: (value: string) => boolean } };
      onLine: (line: string) => void;
    };
    internals.child = { stdin: { write } };
    internals.onLine(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }));
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      jsonrpc: '2.0',
      id: 9,
      result: {},
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('StreamableHTTPTransport', () => {
  it('rejects a response whose id belongs to another request', async () => {
    const transport = new StreamableHTTPTransport({ name: 's', url: 'https://mcp.example.com/' });
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 999_999, result: { stolen: true } }),
    ) as never as typeof fetch;
    await expect(transport.request('resources/list', {})).rejects.toThrow(/id mismatch/);
  });

  it('paginates tools/list and sends notifications without an id', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: INIT_RESULT });
      }
      if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
      const cursor = (body.params as { cursor?: string }).cursor;
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: cursor
          ? { tools: [{ name: 'second', inputSchema: { type: 'object' } }] }
          : { tools: [{ name: 'first', inputSchema: { type: 'object' } }], nextCursor: 'p2' },
      });
    }) as never as typeof fetch;

    const transport = new StreamableHTTPTransport({ name: 's', url: 'https://mcp.example.com/' });
    await transport.connect();
    expect(transport.listTools().map((tool) => tool.name)).toEqual(['first', 'second']);
    const initialized = bodies.find((body) => body.method === 'notifications/initialized');
    expect(initialized).toBeDefined();
    expect(initialized).not.toHaveProperty('id');
    const initialize = bodies.find((body) => body.method === 'initialize');
    expect((initialize?.params as { capabilities?: unknown } | undefined)?.capabilities).toEqual(
      {},
    );
    await transport.close();
  });
});

describe('SSEReader endpoint event', () => {
  it('dispatches the endpoint URL separately from JSON messages', () => {
    const reader = new SSEReader();
    const endpoints: string[] = [];
    const messages: unknown[] = [];
    reader.onEndpoint((endpoint) => endpoints.push(endpoint));
    reader.onMessage((message) => messages.push(message));
    reader.feed('event: endpoint\ndata: /messages?sessionId=abc\n\ndata: {"jsonrpc":"2.0"}\n\n');
    expect(endpoints).toEqual(['/messages?sessionId=abc']);
    expect(messages).toEqual([{ jsonrpc: '2.0' }]);
  });
});

/** A spec-compliant legacy SSE server: endpoint event, 202 POSTs, responses on the stream. */
function compliantSseServer(endpoint: string) {
  const encoder = new TextEncoder();
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  const push = (text: string) => stream.enqueue(encoder.encode(text));
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (!init?.method || init.method === 'GET') {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
            push(`event: endpoint\ndata: ${endpoint}\n\n`);
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posts.push({ url: target, body });
    if (typeof body.id === 'number') {
      const result =
        body.method === 'initialize'
          ? INIT_RESULT
          : body.method === 'tools/list'
            ? { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }
            : body.method === 'tools/call'
              ? { content: [{ type: 'text', text: 'streamed' }] }
              : {};
      setTimeout(
        () => push(`data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`),
        1,
      );
    }
    return new Response('Accepted', { status: 202 });
  });
  return { fetchImpl, posts };
}

describe('SSETransport legacy HTTP+SSE conformance', () => {
  it('POSTs to the announced endpoint and reads 202 responses from the stream', async () => {
    const server = compliantSseServer('/messages?sessionId=abc');
    globalThis.fetch = server.fetchImpl as never as typeof fetch;
    const transport = new SSETransport({ name: 'legacy', url: 'https://mcp.example.com/sse' });

    await transport.connect();
    expect(transport.getState()).toBe('connected');
    expect(transport.listTools().map((tool) => tool.name)).toEqual(['echo']);
    await expect(transport.callTool('echo', {})).resolves.toEqual({
      content: [{ type: 'text', text: 'streamed' }],
      isError: false,
    });
    expect(
      server.posts.every((post) => post.url === 'https://mcp.example.com/messages?sessionId=abc'),
    ).toBe(true);
    expect(
      server.posts.find((post) => post.body.method === 'notifications/initialized')?.body,
    ).not.toHaveProperty('id');
    await transport.close();
  });

  it('refuses a cross-origin endpoint and keeps POSTing to the configured URL', async () => {
    const server = compliantSseServer('https://evil.example.net/steal');
    globalThis.fetch = server.fetchImpl as never as typeof fetch;
    const transport = new SSETransport({ name: 'legacy', url: 'https://mcp.example.com/sse' });
    await transport.connect();
    expect(server.posts.length).toBeGreaterThan(0);
    expect(server.posts.every((post) => post.url === 'https://mcp.example.com/sse')).toBe(true);
    await transport.close();
  });

  it('keeps the session connected after a timed-out call or a 5xx', async () => {
    const transport = new SSETransport({
      name: 'slow',
      url: 'https://mcp.example.com/sse',
      requestTimeoutMs: 20,
    });
    const internals = transport as never as { state: string; abortController: AbortController };
    internals.state = 'connected';
    internals.abortController = new AbortController();
    const disconnected = vi.fn();
    transport.onDisconnect(disconnected);

    // 202 with the response never arriving on the stream → request timeout.
    globalThis.fetch = vi.fn(
      async () => new Response('', { status: 202 }),
    ) as never as typeof fetch;
    await expect(transport.request('tools/call', {})).rejects.toThrow(/timed out/);

    globalThis.fetch = vi.fn(
      async () => new Response('busy', { status: 503 }),
    ) as never as typeof fetch;
    await expect(transport.request('tools/call', {})).rejects.toThrow(/HTTP 503/);

    expect(disconnected).not.toHaveBeenCalled();
    expect(transport.getState()).toBe('connected');
  });
});
