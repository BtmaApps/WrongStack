import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkSandbox, type Sandbox } from './fixtures.js';

// The guard reads this once at module load; this fork owns a loopback server.
const previousPrivate = process.env['WRONGSTACK_FETCH_ALLOW_PRIVATE'];
process.env['WRONGSTACK_FETCH_ALLOW_PRIVATE'] = '1';
const { fetchTool } = await import('../src/fetch.js');
const { readUrlContentTool } = await import('../src/read-url-content.js');

let base = '';
let sandbox: Sandbox;
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const type = url.searchParams.get('type') ?? 'text/plain';
  res.writeHead(200, { 'content-type': type });
  if (url.pathname === '/html') res.end('<h1>Guide</h1><p>Hello</p>');
  else if (url.pathname === '/json') res.end('{"ok":true}');
  else if (url.pathname === '/binary') res.end(Buffer.from([0, 1, 2, 255]));
  else res.end('hello');
});

beforeAll(async () => {
  sandbox = await mkSandbox();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind TCP');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await sandbox.cleanup();
  if (previousPrivate === undefined) delete process.env['WRONGSTACK_FETCH_ALLOW_PRIVATE'];
  else process.env['WRONGSTACK_FETCH_ALLOW_PRIVATE'] = previousPrivate;
});

const opts = () => ({ signal: new AbortController().signal });
const tools = [fetchTool, readUrlContentTool] as const;
const urlFor = (kind: string, type: string) => `${base}/${kind}?type=${encodeURIComponent(type)}`;

// RFC 9110 §8.3.1: type and subtype tokens are case-insensitive.
describe.each(tools)('$name case-insensitive media types', (tool) => {
  it.each(['image/png', 'Image/PNG', 'Application/Octet-Stream', 'Audio/MPEG', 'Video/MP4'])(
    'refuses binary %s',
    async (type) => {
      await expect(
        tool.execute({ url: urlFor('binary', type) }, sandbox.ctx, opts()),
      ).rejects.toThrow(/refusing to read binary/);
    },
  );

  it.each(['text/html; charset=utf-8', 'Text/HTML; charset=UTF-8', 'TEXT/HTML'])(
    'converts HTML %s and preserves the original header',
    async (type) => {
      const out = await tool.execute({ url: urlFor('html', type) }, sandbox.ctx, opts());
      expect(out.content).toContain('# Guide');
      expect(out.content).not.toContain('<h1>');
      expect(out.content_type).toBe(type);
    },
  );

  it.each(['application/json', 'Application/JSON'])('pretty-prints JSON %s', async (type) => {
    const out = await tool.execute({ url: urlFor('json', type) }, sandbox.ctx, opts());
    expect(out.content).toBe('{\n  "ok": true\n}');
    expect(out.content_type).toBe(type);
  });

  it('preserves plain text', async () => {
    const out = await tool.execute({ url: urlFor('text', 'text/plain') }, sandbox.ctx, opts());
    expect(out.content).toBe('hello');
  });
});

it.each(['application/xhtml+xml', 'Application/XHTML+XML'])(
  'read_url_content converts XHTML %s',
  async (type) => {
    const out = await readUrlContentTool.execute(
      { url: urlFor('html', type) },
      sandbox.ctx,
      opts(),
    );
    expect(out.content).toContain('# Guide');
    expect(out.content_type).toBe(type);
  },
);

it('fetch preserves explicitly requested raw mixed-case HTML', async () => {
  const out = await fetchTool.execute(
    { url: urlFor('html', 'Text/HTML'), format: 'raw' },
    sandbox.ctx,
    opts(),
  );
  expect(out.content).toBe('<h1>Guide</h1><p>Hello</p>');
  expect(out.content_type).toBe('Text/HTML');
});
