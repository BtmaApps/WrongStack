/**
 * Per-site regression for the wave-2 dot-dot fix in the HQ static server
 * (hq-static-serve.ts `isInsideDist`): the traversal check used a bare
 * `startsWith('..')`, which misread legal dist-relative names whose first
 * segment begins with `..` (e.g. `..hidden/app.js`) as escapes and
 * refused to serve them. The canonical predicate keeps real `../` climbs
 * out while serving in-root dot-dot names.
 *
 * Driven through the real `serveHqStatic` with a captured response —
 * no HTTP server, no sockets.
 */

import * as fs from 'node:fs/promises';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveHqStatic } from '../src/hq-static-serve.js';

function fakeResponse() {
  const res = {
    statusCode: 0,
    headers: undefined as Record<string, unknown> | undefined,
    body: undefined as Buffer | string | undefined,
    writeHead(code: number, headers: Record<string, unknown>) {
      res.statusCode = code;
      res.headers = headers;
    },
    end(data?: Buffer | string) {
      res.body = data;
    },
  };
  return res;
}

describe('serveHqStatic: legal ..-prefixed dist paths are served', () => {
  let distDir: string;

  beforeEach(async () => {
    distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-hqdist-'));
    await fs.mkdir(path.join(distDir, '..hidden'), { recursive: true });
    await fs.writeFile(path.join(distDir, '..hidden', 'app.js'), 'console.log(1);', 'utf8');
    await fs.writeFile(path.join(distDir, 'normal.js'), 'console.log(2);', 'utf8');
    await fs.writeFile(path.join(distDir, 'index.html'), '<html></html>', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(distDir, { recursive: true, force: true });
  });

  const serve = async (urlPath: string) => {
    const res = fakeResponse();
    const result = await serveHqStatic(
      {} as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      urlPath,
      distDir,
    );
    return { result, res };
  };

  it('serves a real file whose first dist segment starts with `..`', async () => {
    const { result, res } = await serve('/..hidden/app.js');
    expect(result.handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toBe('console.log(1);');
  });

  it('still refuses a real ../ climb out of the dist directory', async () => {
    const outside = path.join(path.dirname(distDir), 'outside-ws5.js');
    await fs.writeFile(outside, 'evil', 'utf8');
    try {
      const { result, res } = await serve('/../outside-ws5.js');
      expect(result.handled).toBe(false);
      expect(res.statusCode).toBe(0);
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it('control: an ordinary dist file still serves', async () => {
    const { result, res } = await serve('/normal.js');
    expect(result.handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toBe('console.log(2);');
  });
});
