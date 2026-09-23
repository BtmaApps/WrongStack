import { once } from 'node:events';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { waitForHttpReady } from '../src/main/runtime-process.js';

async function withStatusServer(
  firstStatus: number,
  check: (url: string, requests: () => number, seenUrls: () => string[]) => Promise<void>,
): Promise<void> {
  let requests = 0;
  const seenUrls: string[] = [];
  const server = http.createServer((req, res) => {
    seenUrls.push(req.url ?? '');
    requests++;
    res.writeHead(requests === 1 ? firstStatus : 200);
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as AddressInfo;
    await check(
      `http://127.0.0.1:${address.port}`,
      () => requests,
      () => seenUrls,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('waitForHttpReady', () => {
  it('accepts a healthy response on the first probe with the desktop token', async () => {
    await withStatusServer(200, async (url, requests, seenUrls) => {
      await waitForHttpReady(url, 'fixture-token', 2_000);
      expect(requests()).toBe(1);
      expect(new URL(seenUrls()[0]!, url).searchParams.get('token')).toBe('fixture-token');
      expect(new URL(seenUrls()[0]!, url).searchParams.get('shell')).toBe('desktop');
    });
  });

  it.each([401, 404])('retries HTTP %i rather than reporting the WebUI ready', async (status) => {
    await withStatusServer(status, async (url, requests) => {
      await waitForHttpReady(url, 'fixture-token', 2_000);
      expect(requests()).toBe(2);
    });
  });
});
