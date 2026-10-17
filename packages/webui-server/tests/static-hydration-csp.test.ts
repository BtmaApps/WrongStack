import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createHttpServer } from '../src/server/http-server.js';

const inline = 'self.__next_f.push([1,"hydration"]);';
let directory: string;
let server: ReturnType<typeof createHttpServer>;
let origin: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vibeui-csp-'));
  await writeFile(
    join(directory, 'index.html'),
    `<html><head></head><body><script src="/_next/static/app.js"></script><script>${inline}</script></body></html>`,
  );
  await mkdir(join(directory, '_next/static'), { recursive: true });
  await writeFile(join(directory, '_next/static/app.js'), 'export {};');
  server = createHttpServer({ host: '127.0.0.1', distDir: directory, apiToken: 'test-token' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No bound port');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
it.each(['/', '/session/client-route'])(
  'serves hydration hashes without enabling arbitrary inline scripts on %s',
  async (route) => {
    const response = await fetch(origin + route);
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(response.status).toBe(200);
    expect(csp).toContain(`'sha256-${createHash('sha256').update(inline).digest('base64')}'`);
    expect(csp.split(';').find((part) => part.includes('script-src'))).not.toContain(
      "'unsafe-inline'",
    );
    expect(csp).not.toContain(createHash('sha256').update('alert("untrusted")').digest('base64'));
  },
);
it('serves Next hashed assets with the right MIME type and immutable caching', async () => {
  const response = await fetch(`${origin}/_next/static/app.js`);
  expect(response.headers.get('content-type')).toBe('application/javascript');
  expect(response.headers.get('cache-control')).toContain('immutable');
});
