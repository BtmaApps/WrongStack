import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { type ContentRouteContext, handleContentRoute } from '../src/server/content-routes.js';

it('acknowledges real file mutations and path refusals with the caller request identity', async () => {
  const base = resolve(tmpdir()),
    dir = mkdtempSync(join(base, 'content-file-correlation-'));
  const frames: { type: string; payload: Record<string, unknown> }[] = [];
  const socket = {
    readyState: 1,
    send(this: unknown, value: string) {
      expect(this).toBe(socket);
      frames.push(JSON.parse(value));
    },
  };
  const ctx = {
    getProjectRoot: () => dir,
    onFileWritten: () => {},
    getSkillsContext: () => {
      throw new Error('not a skill request');
    },
    getPromptsContext: () => {
      throw new Error('not a prompt request');
    },
    getDesignContext: () => {
      throw new Error('not a design request');
    },
  } satisfies ContentRouteContext;
  let index = 0;
  const call = async (type: string, payload: Record<string, unknown>, reply: string) => {
    const requestId = `file-operation-${++index}`;
    frames.length = 0;
    await handleContentRoute(
      ctx,
      socket as unknown as WebSocket,
      { type, payload: { ...payload, requestId } } as never,
    );
    const frame = frames.find((frame) => frame.type === reply);
    expect(frame?.payload['requestId']).toBe(requestId);
    return frame!.payload;
  };
  try {
    expect(
      await call('files.create', { filePath: 'native.ts', type: 'file' }, 'files.created'),
    ).toMatchObject({ success: true });
    expect(
      await call(
        'files.write',
        { filePath: 'native.ts', content: 'export const native = true;\n' },
        'files.written',
      ),
    ).toMatchObject({ success: true });
    expect(readFileSync(join(dir, 'native.ts'), 'utf8')).toBe('export const native = true;\n');
    expect(await call('files.tree', {}, 'files.tree')).toMatchObject({
      tree: [{ name: 'native.ts', type: 'file' }],
    });
    expect(
      await call('files.rename', { oldPath: 'native.ts', newPath: 'renamed.ts' }, 'files.renamed'),
    ).toMatchObject({ success: true, newPath: 'renamed.ts' });
    expect(
      await call('files.create', { filePath: 'renamed.ts', type: 'file' }, 'files.created'),
    ).toMatchObject({ success: false });
    expect(
      await call(
        'files.write',
        { filePath: '../forbidden.ts', content: 'must not be written' },
        'files.written',
      ),
    ).toMatchObject({ success: false, error: 'Forbidden' });
    expect(await call('files.delete', { filePath: 'renamed.ts' }, 'files.deleted')).toMatchObject({
      success: true,
    });
    writeFileSync(join(dir, '.gitignore'), 'ignored/\n');
    mkdirSync(join(dir, 'ignored'));
    writeFileSync(join(dir, 'ignored/notes.md'), 'Owned ignored source.');
    expect((await call('files.tree', {}, 'files.tree'))['tree']).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'ignored' })]),
    );
    expect((await call('files.tree', { includeIgnored: true }, 'files.tree'))['tree']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'ignored',
          ignored: true,
          children: [expect.objectContaining({ name: 'notes.md', ignored: true })],
        }),
      ]),
    );
    expect(
      await call('files.tree', { path: '../', includeIgnored: true }, 'files.tree'),
    ).toHaveProperty('error', 'Path outside project root');
  } finally {
    expect(dir.startsWith(base + sep)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  }
});
