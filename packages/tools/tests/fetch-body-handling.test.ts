import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The guard reads this once at module load, so it must be set before import.
process.env['WRONGSTACK_FETCH_ALLOW_PRIVATE'] = '1';
const { fetchTool } = await import('../src/fetch.js');
const { readUrlContentTool } = await import('../src/read-url-content.js');
const { mkSandbox, newSignal } = await import('./fixtures.js');

/**
 * Body handling found by the 2026-09-15 tool audit against a real local
 * server (the existing suites mock `guardedFetch`, so none of these were
 * reachable there).
 */
let base = '';
let largeClosedEarly = false;
const server: Server = createServer((req, res) => {
  if (req.url === '/empty') {
    res.writeHead(204);
    res.end();
  } else if (req.url === '/page') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<html><head><title>T</title><style>.x{}</style></head><body><script>evil()</script><h1>Hello</h1><p>A &amp; B</p></body></html>',
    );
  } else if (req.url === '/binary') {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(Buffer.from([0, 1, 2, 255]));
  } else if (req.url === '/huge') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    let sent = 0;
    const chunk = 'x'.repeat(64 * 1024);
    res.on('close', () => {
      if (sent < 64 * 1024 * 1024) largeClosedEarly = true;
    });
    const pump = () => {
      while (sent < 64 * 1024 * 1024) {
        sent += chunk.length;
        if (!res.write(chunk)) return void res.once('drain', pump);
      }
      res.end();
    };
    pump();
  } else {
    res.writeHead(404);
    res.end();
  }
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('fetch body handling', () => {
  it('returns empty content for a 204 without a content-type instead of refusing it as binary', async () => {
    const sb = await mkSandbox();
    try {
      const out = await fetchTool.execute({ url: `${base}/empty` }, sb.ctx, {
        signal: newSignal(),
      });
      expect(out.status).toBe(204);
      expect(out.content).toBe('');
    } finally {
      await sb.cleanup();
    }
  });

  it('format "text" strips HTML to plain text rather than returning raw markup', async () => {
    const sb = await mkSandbox();
    try {
      const text = await fetchTool.execute({ url: `${base}/page`, format: 'text' }, sb.ctx, {
        signal: newSignal(),
      });
      expect(text.content).toContain('Hello');
      expect(text.content).toContain('A & B');
      expect(text.content).not.toMatch(/<|evil\(\)|\.x\{\}/);
      const raw = await fetchTool.execute({ url: `${base}/page`, format: 'raw' }, sb.ctx, {
        signal: newSignal(),
      });
      expect(raw.content).toContain('<script>evil()</script>');
    } finally {
      await sb.cleanup();
    }
  });
});

describe('read_url_content body handling', () => {
  it('refuses binary content-types like fetch does', async () => {
    await expect(
      readUrlContentTool.execute({ url: `${base}/binary` }, {} as never, { signal: newSignal() }),
    ).rejects.toThrow(/binary/);
  });

  it('stops reading at maxBytes instead of buffering the whole body', async () => {
    const out = await readUrlContentTool.execute(
      { url: `${base}/huge`, maxBytes: 1024 },
      {} as never,
      { signal: newSignal() },
    );
    expect(out.content).toContain('[Content truncated at 1024 bytes]');
    expect(Buffer.byteLength(out.content)).toBeLessThan(2048);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(largeClosedEarly).toBe(true);
  });
});
