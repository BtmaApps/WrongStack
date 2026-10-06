/**
 * WS-024 / WS-026 — the MCP HTTP transport and the `tools/call` contract.
 *
 * `serveHttp` binds a loopback port that executes tools. Any page in the
 * user's browser can reach a loopback port, so the transport needs the same
 * guards a local control-plane needs — and it had none of them:
 *
 *   - `GET` on any path answered 200 with the server identity BEFORE the token
 *     check, so an unauthenticated caller could fingerprint the server.
 *   - No `Origin` check, so a foreign page's request was indistinguishable
 *     from a local client's.
 *   - No `Host` check, so a DNS-rebinding name pointing at 127.0.0.1 made a
 *     foreign page same-origin.
 *   - No `Content-Type` requirement, so a POST could be a CORS *simple*
 *     request — no preflight, nothing to refuse — and drive tool execution.
 *   - `auth !== expected`, a short-circuiting compare that leaks the token
 *     prefix to a caller that can time responses.
 *
 * WS-026: `tools/call` forwarded `arguments` to the host after checking only
 * that it was an object, so every `enum`, `required`, and bound in the
 * `inputSchema` this server publishes on `tools/list` was advisory. Enforcement
 * now runs through the shared `validateAgainstSchema`, which covers
 * type/enum/required, numeric bounds (minimum/maximum), and strict-closed
 * objects (`additionalProperties: false`) — boundaries the WS-026 block below
 * pins explicitly rather than leaving to assumption.
 */
import * as http from 'node:http';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MCPServer,
  type MCPServerCallResult,
  type MCPServerTool,
  type ServeHttpHandle,
  serveHttp,
  serveStdio,
} from '../src/server.js';

const TOOL: MCPServerTool = {
  name: 'write_note',
  description: 'test tool',
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['read', 'write'] },
      count: { type: 'number', minimum: 1, maximum: 10 },
      path: { type: 'string', maxLength: 100 },
      tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 },
    },
    required: ['mode', 'path'],
    patternProperties: { '^opt_': { type: 'string' } },
    additionalProperties: false,
  },
};

let received: Array<Record<string, unknown>> = [];
let handle: ServeHttpHandle | undefined;

function makeServer(): MCPServer {
  received = [];
  return new MCPServer({
    host: {
      listTools: () => [TOOL],
      callTool: (_name, args): Promise<MCPServerCallResult> => {
        received.push(args);
        return Promise.resolve({ content: 'ok', isError: false });
      },
    },
  });
}

/**
 * Bind errors that say nothing about the guard under test.
 *
 * Every case here binds its own ephemeral listener, and a full-suite run does
 * that thousands of times alongside every other server-spawning test. Windows
 * answers with ENOBUFS once its socket table is momentarily full; the port
 * picked by `port: 0` can also be taken between the pick and the bind. Both are
 * the machine being busy, not the transport being wrong, so retry rather than
 * report a red guard test.
 */
const TRANSIENT_BIND_CODES = new Set(['ENOBUFS', 'EADDRINUSE', 'EADDRNOTAVAIL', 'EACCES']);

async function start(token?: string, host?: string): Promise<ServeHttpHandle> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      handle = await serveHttp(makeServer(), { port: 0, host, ...(token ? { token } : {}) });
      return handle;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === undefined || !TRANSIENT_BIND_CODES.has(code)) throw error;
      lastError = error;
      // Back off so the OS can reclaim descriptors before the next attempt.
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

function callBody(args: Record<string, unknown>): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'write_note', arguments: args },
  });
}

const VALID = { mode: 'read', path: 'a.txt' };

/** POST with an explicit Host header, which `fetch` will not let us set. */
function rawPost(h: ServeHttpHandle, hostHeader: string, body: string): Promise<number> {
  return rawPostWithHeaders(h, { host: hostHeader }, body);
}

/** POST with raw headers (Host, Origin, …) that `fetch` refuses to set. */
function rawPostWithHeaders(
  h: ServeHttpHandle,
  headers: Record<string, string>,
  body: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: h.host,
        port: h.port,
        path: '/',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

describe('MCP HTTP transport guards (WS-024)', () => {
  it('refuses a foreign browser Origin', async () => {
    const h = await start();
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: callBody(VALID),
    });
    expect(res.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('refuses an Origin header that fails URL parsing', async () => {
    // `new URL(origin)` throws for a malformed origin, and the guard must
    // fail closed (server.ts:732-733) rather than treat it as absent.
    const h = await start();
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'not a url' },
      body: callBody(VALID),
    });
    expect(res.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('refuses a non-http(s) Origin scheme', async () => {
    // `ftp://` parses but is not a scheme this server can be addressed by, so
    // the guard rejects it (server.ts:735).
    const h = await start();
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'ftp://evil.example' },
      body: callBody(VALID),
    });
    expect(res.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('refuses an Origin-bearing request that smuggles structure through the Host header', async () => {
    // A Host header with userinfo, a path, or a query is structure smuggling
    // (server.ts:768): the Origin passes, but the Host cannot name a bare
    // authority, so the host guard rejects it.
    const h = await start();
    const status = await rawPostWithHeaders(
      h,
      { host: `127.0.0.1:${h.port}/smuggle`, origin: `http://127.0.0.1:${h.port}` },
      callBody(VALID),
    );
    expect(status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('accepts a +json content type with parameters', async () => {
    // `application/problem+json` satisfies the JSON content-type gate via the
    // `endsWith('+json')` branch (server.ts:778-779).
    const h = await start();
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/problem+json; charset=utf-8' },
      body: callBody(VALID),
    });
    expect(res.status).toBe(200);
  });

  it('refuses a request with a blank Host header', async () => {
    // A blank Host header trims to empty, failing the host guard's `!rawHost`
    // check (server.ts:759). With no Origin sent, originIsAcceptable returns
    // true at server.ts:728, so the Host guard is the one that rejects.
    const h = await start();
    const status = await rawPostWithHeaders(h, { host: ' ' }, callBody(VALID));
    expect(status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('refuses an Origin-bearing request with a blank Host header', async () => {
    // With an Origin present AND a blank Host, the origin guard's own
    // `!rawHost` check fires (server.ts:737) before the Host guard runs.
    const h = await start();
    const status = await rawPostWithHeaders(
      h,
      { host: ' ', origin: `http://127.0.0.1:${h.port}` },
      callBody(VALID),
    );
    expect(status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('refuses a POST with an empty content-type header', async () => {
    // isJsonContentType('') fails closed (server.ts:777) — an empty content
    // type is treated exactly like a non-JSON one.
    const h = await start();
    const status = await rawPostWithHeaders(h, { 'content-type': '' }, callBody(VALID));
    expect(status).toBe(415);
    expect(received).toHaveLength(0);
  });

  it('refuses a non-loopback origin hostname on a loopback bind', async () => {
    // The Origin and Host agree with each other, but the hostname is not
    // loopback while the bind is — isLoopbackHostname() fails
    // (server.ts:748), so the origin is refused.
    const h = await start();
    const status = await rawPostWithHeaders(
      h,
      { host: 'evil.example', origin: 'http://evil.example' },
      callBody(VALID),
    );
    expect(status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('accepts a same-origin loopback Origin', async () => {
    const h = await start();
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: h.url.replace(/\/$/, '') },
      body: callBody(VALID),
    });
    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
  });

  it('accepts a request with no Origin — non-browser clients never send one', async () => {
    const h = await start();
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: callBody(VALID),
    });
    expect(res.status).toBe(200);
  });

  it('refuses a rebound Host header', async () => {
    // `fetch` refuses to set Host (undici forbids it), so this goes through
    // the raw client — which is what a rebinding attacker's browser does
    // anyway: the browser sets Host from the name it resolved.
    const h = await start();
    const status = await rawPost(h, 'evil.example', callBody(VALID));
    expect(status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('accepts a loopback Host header', async () => {
    const h = await start();
    const status = await rawPost(h, `127.0.0.1:${h.port}`, callBody(VALID));
    expect(status).toBe(200);
  });

  it('refuses a Host header that fails URL parsing (hostHeaderIsAcceptable catch)', async () => {
    // `127.0.0.1:abc` has a non-numeric port, so `new URL('http://…')` throws
    // and the guard returns false instead of trusting the header.
    const h = await start();
    const status = await rawPost(h, '127.0.0.1:abc', callBody(VALID));
    expect(status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('refuses a malformed Host header when an Origin is present (originIsAcceptable catch)', async () => {
    // The Origin parses, but the Host header fails URL construction, so the
    // same-origin comparison aborts via the catch (server.ts:744-745).
    const h = await start();
    const status = await rawPostWithHeaders(
      h,
      { host: '127.0.0.1:abc', origin: `http://127.0.0.1:${h.port}` },
      callBody(VALID),
    );
    expect(status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('accepts the Host header on a non-loopback bind (operator-chosen hostname)', async () => {
    // 127.0.0.2 is loopback traffic but not in isLoopbackHost's allowlist, so
    // serveHttp treats it as a non-loopback bind that requires a token — which
    // exercises the operator-decision branch (server.ts:772). The request
    // sends no authorization header, so the host check must pass (no 403) and
    // the token check rejects (401).
    const h = await start('tok', '127.0.0.2');
    const status = await rawPostWithHeaders(h, { host: `127.0.0.2:${h.port}` }, callBody(VALID));
    expect(status).toBe(401);
  });

  it('accepts a same-origin Origin on a non-loopback bind (server.ts:748)', async () => {
    // The Origin and Host agree with each other and with the non-loopback
    // bind, so originIsAcceptable takes the `: true` branch at server.ts:748
    // instead of the loopback-hostname check. The missing token still
    // produces 401, proving both guards passed.
    const h = await start('tok', '127.0.0.2');
    const status = await rawPostWithHeaders(
      h,
      {
        host: `127.0.0.2:${h.port}`,
        origin: `http://127.0.0.2:${h.port}`,
      },
      callBody(VALID),
    );
    expect(status).toBe(401);
  });

  it('refuses a simple-request POST that carries no JSON content type', async () => {
    // `text/plain` is CORS-simple: no preflight, so nothing would have refused
    // it. This is the drive-by tool execution path.
    const h = await start();
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: callBody(VALID),
    });
    expect(res.status).toBe(415);
    expect(received).toHaveLength(0);
  });

  it('accepts application/json with parameters', async () => {
    const h = await start();
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: callBody(VALID),
    });
    expect(res.status).toBe(200);
  });

  it('requires the token on GET, not only on POST', async () => {
    const h = await start('s3cret');
    const anonymous = await fetch(h.url);
    expect(anonymous.status).toBe(401);

    const authorized = await fetch(h.url, { headers: { authorization: 'Bearer s3cret' } });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({ status: 'ok' });
  });

  it('refuses a token of the right length but wrong bytes', async () => {
    const h = await start('s3cret');
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer s3crea' },
      body: callBody(VALID),
    });
    expect(res.status).toBe(401);
  });

  it('never emits CORS headers a cross-origin reader could use', async () => {
    const h = await start();
    const res = await fetch(h.url);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});

type JsonRpcBody = { error?: { code: number; message: string }; result?: unknown };

/**
 * SEP-1303: an argument violating the advertised `inputSchema` is a tool
 * EXECUTION error — `isError: true` in the result — so the model reads it and
 * can retry with corrected arguments. A JSON-RPC error would keep the refusal
 * inside the transport and out of the model's view.
 */
function expectToolRefusal(body: JsonRpcBody): void {
  expect(body.error).toBeUndefined();
  expect((body.result as { isError?: boolean; content?: unknown }).isError).toBe(true);
}

function toolRefusalText(body: JsonRpcBody): string {
  const result = body.result as { content?: { text?: string }[] };
  return (result.content ?? []).map((block) => block.text ?? '').join('\n');
}

describe('MCP tools/call schema enforcement (WS-026)', () => {
  async function call(args: Record<string, unknown>): Promise<{
    status: number;
    body: { error?: { code: number; message: string }; result?: unknown };
  }> {
    const h = handle ?? (await start());
    const res = await fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: callBody(args),
    });
    return { status: res.status, body: (await res.json()) as never };
  }

  it('rejects a value outside a declared enum', async () => {
    const { body } = await call({ mode: '../../etc/passwd', path: 'a.txt' });
    expectToolRefusal(body);
    expect(toolRefusalText(body)).toContain('mode');
    expect(received).toHaveLength(0);
  });

  it('rejects a missing required property', async () => {
    const { body } = await call({ mode: 'read' });
    expectToolRefusal(body);
    expect(received).toHaveLength(0);
  });

  // SCOPE, pinned deliberately: the shared `validateAgainstSchema` — which
  // also gates the agent's own tool executor — checks type/enum/required,
  // numeric bounds, strict-closed objects (`additionalProperties: false`),
  // string lengths (`minLength`/`maxLength`), the `additionalProperties`
  // subschema form, `patternProperties`, `pattern`, array lengths
  // (`minItems`/`maxItems`/`uniqueItems`), and the combinators
  // `allOf`/`anyOf`/`oneOf` (all landed 2026-09-11); before those landed,
  // out-of-range numbers, smuggled unknown keys, length-violating strings,
  // mis-typed map values, over-long arrays, and combinator-violating
  // arguments passed every gate in the product. Still advisory per the
  // 2026-09-11 usage survey: `const` and `$ref` — declared only in the
  // techstack rulebook, which validates with its own `validateRulebook` —
  // pinned in the core validator suite rather than left to assumption.
  it('enforces additionalProperties: false', async () => {
    const { body } = await call({ ...VALID, injected: 'yes' });
    expectToolRefusal(body);
    expect(toolRefusalText(body)).toContain('injected');
    expect(toolRefusalText(body)).toContain('unknown property');
    expect(received).toHaveLength(0);
  });

  it('enforces string lengths (maxLength)', async () => {
    const { body } = await call({ ...VALID, path: 'x'.repeat(101) });
    expectToolRefusal(body);
    expect(toolRefusalText(body)).toContain('path');
    expect(toolRefusalText(body)).toContain('expected string length <= 100, got 101');
    expect(received).toHaveLength(0);
  });

  it('enforces patternProperties on matching keys', async () => {
    const { body } = await call({ ...VALID, opt_flag: 1 });
    expectToolRefusal(body);
    expect(toolRefusalText(body)).toContain('opt_flag');
    expect(received).toHaveLength(0);
  });

  it('treats pattern-governed keys as known (not unknown)', async () => {
    const before = received.length;
    const { body } = await call({ ...VALID, opt_flag: 'v' });
    expect(body.error).toBeUndefined();
    expect(received.length).toBe(before + 1);
  });

  it('enforces array lengths (maxItems)', async () => {
    const { body } = await call({ ...VALID, tags: ['a', 'b', 'c'] });
    expectToolRefusal(body);
    expect(toolRefusalText(body)).toContain('tags');
    expect(toolRefusalText(body)).toContain('expected array length <= 2, got 3');
    expect(received).toHaveLength(0);
  });

  it('enforces numeric bounds (minimum/maximum)', async () => {
    const { body } = await call({ ...VALID, count: 999 });
    expectToolRefusal(body);
    expect(toolRefusalText(body)).toContain('count');
    expect(toolRefusalText(body)).toContain('expected number <= 10, got 999');
    expect(received).toHaveLength(0);
  });

  it('accepts arguments at the exact numeric bounds (inclusive)', async () => {
    const before = received.length;
    for (const count of [1, 10]) {
      const { body } = await call({ ...VALID, count });
      expect(body.error).toBeUndefined();
    }
    expect(received.length).toBe(before + 2);
  });

  it('rejects a wrong type, which the shared validator does check', async () => {
    const { body } = await call({ ...VALID, count: 'not-a-number' });
    expectToolRefusal(body);
    expect(received).toHaveLength(0);
  });

  it('passes valid arguments straight through', async () => {
    const { body } = await call(VALID);
    expect(body.error).toBeUndefined();
    expect(received).toEqual([VALID]);
  });

  it('delivers the refusal as a tool result, not a protocol error (SEP-1303)', async () => {
    // A JSON-RPC error never reaches the model, so a bad `mode` would be
    // unrecoverable: the model cannot correct an argument it was never told
    // about. -32603 specifically would also make a caller retry forever.
    const { body } = await call({ mode: 'nope', path: 'a.txt' });
    expectToolRefusal(body);
    expect(toolRefusalText(body)).toContain('mode');
  });

  it('caps the echoed schema errors at MAX_REPORTED_SCHEMA_ERRORS', async () => {
    // A tool with more failing constraints than the echo cap must report the
    // first five and a "+N more" suffix (server.ts:290-298).
    const wideTool: MCPServerTool = {
      name: 'wide',
      description: 'many required fields',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' },
          d: { type: 'string' },
          e: { type: 'string' },
          f: { type: 'string' },
          g: { type: 'string' },
        },
        required: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      },
    };
    handle = await serveHttp(
      new MCPServer({
        host: {
          listTools: () => [wideTool],
          callTool: () => Promise.resolve({ content: 'ok', isError: false }),
        },
      }),
      { port: 0 },
    );
    const res = await fetch(handle.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'wide', arguments: {} },
      }),
    });
    const body = (await res.json()) as { error?: { code: number; message: string } };
    expectToolRefusal(body);
    expect(toolRefusalText(body)).toMatch(/\(\+2 more\)$/);
  });
});

/**
 * WS-028: `serveStdio` decoded each stdin chunk on its own
 * (`chunk.toString('utf8')`). Chunks split at arbitrary BYTE offsets, so a
 * multi-byte character straddling two `data` events was turned into U+FFFD.
 * U+FFFD is a legal character inside a JSON string, so the request still
 * parsed and the tool ran with silently corrupted arguments — no parse error
 * to notice. A streaming decoder now holds the partial sequence until its
 * continuation bytes arrive, matching the upstream SSE reader.
 */
describe('MCP stdio framing — multi-byte UTF-8 across chunk boundaries', () => {
  /** Echoes its `text` argument, so the delivered value is directly observable. */
  function echoServer(): MCPServer {
    return new MCPServer({
      host: {
        listTools: () => [
          {
            name: 'echo',
            description: 'echoes text',
            inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
          },
        ],
        callTool: (_name, args): Promise<MCPServerCallResult> =>
          Promise.resolve({ content: String(args['text'] ?? ''), isError: false }),
      },
    });
  }

  function requestLine(text: string): string {
    return `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text } },
    })}\n`;
  }

  async function runStdio(chunks: readonly Buffer[]): Promise<string> {
    const stdin = new PassThrough();
    const written: string[] = [];
    const stdout = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        written.push(chunk.toString('utf8'));
        callback();
      },
    });
    const handle = serveStdio(echoServer(), { stdin, stdout });
    for (const chunk of chunks) stdin.write(chunk);
    stdin.end();
    await handle.done;
    return written.join('');
  }

  // 2-byte 'é', 3-byte '→', 3-byte '✓': any split is a real corruption.
  const PAYLOAD = 'héllo → ✓';

  it('delivers arguments intact when a chunk boundary splits a character', async () => {
    const bytes = Buffer.from(requestLine(PAYLOAD), 'utf8');
    // The split point MUST be computed over bytes: `String.indexOf(0xE2)`
    // would search for the UTF-16 code unit U+00E2, miss, and quietly deliver
    // the whole line in one chunk — a test that passes for the wrong reason.
    const leadByte = Buffer.from('→', 'utf8')[0]!;
    const lead = bytes.indexOf(leadByte);
    expect(lead, 'split point must land inside the payload').toBeGreaterThan(0);

    const response = await runStdio([bytes.subarray(0, lead + 1), bytes.subarray(lead + 1)]);

    expect(response).toContain(PAYLOAD);
    // A split that mangled the argument would still return ok:true — assert
    // the corruption mode directly so the failure is unmistakable.
    expect(response).not.toContain('�');
  });

  it('delivers arguments intact when several characters are split', async () => {
    const bytes = Buffer.from(requestLine(PAYLOAD), 'utf8');
    // Split at every byte offset in turn: each one that lands mid-character
    // must still round-trip.
    for (let cut = 1; cut < bytes.length; cut++) {
      const response = await runStdio([bytes.subarray(0, cut), bytes.subarray(cut)]);
      expect(response, `split at byte ${cut}`).toContain(PAYLOAD);
    }
  });

  it('CONTROL: the same bytes in a single chunk are unaffected', async () => {
    const response = await runStdio([Buffer.from(requestLine(PAYLOAD), 'utf8')]);
    expect(response).toContain(PAYLOAD);
  });

  it('CONTROL: an ASCII payload split across chunks is unaffected', async () => {
    const ascii = 'plain-ascii-argument';
    const bytes = Buffer.from(requestLine(ascii), 'utf8');
    const mid = Math.floor(bytes.length / 2);
    const response = await runStdio([bytes.subarray(0, mid), bytes.subarray(mid)]);
    expect(response).toContain(ascii);
  });

  it('CONTROL: multiple lines across chunk boundaries all dispatch', async () => {
    const stdin = new PassThrough();
    const written: string[] = [];
    const stdout = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        written.push(chunk.toString('utf8'));
        callback();
      },
    });
    const handle = serveStdio(echoServer(), { stdin, stdout });
    const first = Buffer.from(requestLine(PAYLOAD), 'utf8');
    const second = Buffer.from(requestLine('second-line ✓'), 'utf8');
    // One line split mid-character, then a second whole line in the same chunk.
    const lead = first.indexOf(Buffer.from('→', 'utf8')[0]!);
    stdin.write(first.subarray(0, lead + 1));
    stdin.write(Buffer.concat([first.subarray(lead + 1), second]));
    stdin.end();
    await handle.done;

    const out = written.join('');
    expect(out).toContain(PAYLOAD);
    expect(out).toContain('second-line ✓');
  });
});
