import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { type ContentRouteContext, handleContentRoute } from '../src/server/content-routes';

const owned: string[] = [];
afterEach(async () => {
  for (const root of owned.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'file-content-search-'));
  owned.push(root);
  const frames: { type: string; payload: Record<string, unknown> }[] = [];
  const ws = {
    readyState: 1,
    send: (text: string) => frames.push(JSON.parse(text)),
  } as unknown as WebSocket;
  const context = { getProjectRoot: () => root } as ContentRouteContext;
  const search = async (payload: Record<string, unknown>) => {
    frames.length = 0;
    const requestId = crypto.randomUUID();
    expect(
      await handleContentRoute(context, ws, {
        type: 'files.search',
        payload: { ...payload, requestId, sessionId: 'search-owner' },
      } as never),
    ).toBe(true);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      type: 'files.search',
      payload: { requestId, sessionId: 'search-owner' },
    });
    return frames[0]!.payload;
  };
  return { root, search };
}
it('finds literal line matches with paths and positions and keeps project/scope/ignore boundaries', async () => {
  const { root, search } = await setup();
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'ignored'));
  await writeFile(join(root, '.gitignore'), 'ignored/\n');
  await writeFile(join(root, 'src/a.ts'), 'first\nconst Needle = "literal.*";\nneedle\n');
  await writeFile(join(root, 'ignored/secret.ts'), 'needle');
  await writeFile(join(root, '.env'), 'needle');
  await writeFile(join(root, 'outside-scope.ts'), 'needle');
  const result = await search({ query: 'needle', path: 'src' });
  expect(result['partial']).toBe(false);
  expect(result['hits']).toEqual([
    { path: 'src/a.ts', line: 2, column: 7, preview: 'const Needle = "literal.*";' },
    { path: 'src/a.ts', line: 3, column: 1, preview: 'needle' },
  ]);
  expect((await search({ query: 'literal.*', path: 'src', matchCase: true }))['hits']).toHaveLength(
    1,
  );
  expect((await search({ query: 'Needle', path: 'src', matchCase: true }))['hits']).toHaveLength(1);
  expect((await search({ query: 'needle' }))['hits']).toHaveLength(3);
  expect((await search({ query: 'needle', includeIgnored: true }))['hits']).toHaveLength(4);
  expect((await search({ query: 'absent' }))['hits']).toEqual([]);
  expect((await search({ query: 'needle', path: '..' }))['error']).toBeTypeOf('string');
  expect((await search({ query: '' }))['error']).toBeTypeOf('string');
});
it('reports bounded partial results and omitted non-text/large/link files without disclosing external content', async () => {
  const { root, search } = await setup();
  const outside = await mkdtemp(join(tmpdir(), 'file-search-external-'));
  owned.push(outside);
  await writeFile(join(outside, 'external.ts'), 'external-needle');
  await symlink(
    outside,
    join(root, 'external-link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await writeFile(join(root, 'a.ts'), 'needle\nneedle\nneedle\n');
  await writeFile(join(root, 'binary'), Buffer.from([0, 110, 101, 101, 100, 108, 101]));
  await writeFile(join(root, 'large.ts'), 'x'.repeat(1024 * 1024 + 1));
  const limited = await search({ query: 'needle', limit: 1 });
  expect(limited['hits']).toHaveLength(1);
  expect(limited['partial']).toBe(true);
  expect(limited['reasons']).toContain('matches');
  const complete = await search({ query: 'needle' });
  expect(complete['hits']).toHaveLength(3);
  expect(complete['skipped']).toMatchObject({ binary: 1, oversized: 1, links: 1 });
  expect(complete['partial']).toBe(true);
  expect((await search({ query: 'external-needle', path: 'external-link' }))['error']).toBeTypeOf(
    'string',
  );
});
