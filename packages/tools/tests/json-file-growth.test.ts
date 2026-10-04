import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type JsonInput, jsonTool } from '../src/json.js';
import { mkSandbox, type Sandbox } from './fixtures.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, stat: vi.fn(actual.stat) };
});

const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const cap = 16 * 1024 * 1024;
const largeJson = JSON.stringify({ x: 'a'.repeat(cap) });
let sandbox: Sandbox;
beforeEach(async () => {
  sandbox = await mkSandbox();
});
afterEach(async () => {
  vi.mocked(fs.stat).mockClear();
  await sandbox.cleanup();
});

const actions: JsonInput[] = [
  { action: 'parse' },
  { action: 'query', query: 'x' },
  { action: 'validate', schema: { type: 'object' } },
  { action: 'transform', transforms: ['x'] },
];
const opts = () => ({ signal: new AbortController().signal });
const filePath = () => path.join(sandbox.dir, 'data.json');

describe('JSON file byte cap across metadata/read races', () => {
  it.each(actions)('rejects growing file for $action', async (input) => {
    const file = filePath();
    await actual.writeFile(file, '{"x":"small"}');
    let grew = false;
    // Deliver a real metadata snapshot after the real file has grown.
    vi.mocked(fs.stat).mockImplementationOnce(async () => {
      const snapshot = await actual.stat(file);
      expect(snapshot.size).toBeLessThan(cap);
      await actual.writeFile(file, largeJson);
      grew = true;
      return snapshot;
    });
    const error = await jsonTool.execute({ ...input, file }, sandbox.ctx, opts()).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(grew).toBe(true);
    expect((await actual.stat(file)).size).toBeGreaterThan(cap);
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) expect(error.message).toContain('exceeds the 16 MiB');
  });

  it('reads unchanged in-cap JSON', async () => {
    const file = filePath();
    await actual.writeFile(file, '{"ok":true}');
    const out = await jsonTool.execute({ file }, sandbox.ctx, opts());
    expect(out.data).toEqual({ ok: true });
  });

  it('rejects a file already over the cap', async () => {
    const file = filePath();
    await actual.writeFile(file, largeJson);
    await expect(jsonTool.execute({ file }, sandbox.ctx, opts())).rejects.toThrow(
      'exceeds the 16 MiB',
    );
  });

  it('accepts valid JSON exactly at the byte cap', async () => {
    const file = filePath();
    const payload = JSON.stringify('a'.repeat(cap - 2));
    expect(Buffer.byteLength(payload)).toBe(cap);
    await actual.writeFile(file, payload);
    const out = await jsonTool.execute({ file }, sandbox.ctx, opts());
    expect(typeof out.data).toBe('string');
    expect(out.data).toHaveLength(cap - 2);
  });

  it('preserves UTF-8 characters spanning read chunks', async () => {
    const file = filePath();
    const value = '界'.repeat(70000) + '🌍';
    await actual.writeFile(file, JSON.stringify(value));
    const out = await jsonTool.execute({ file }, sandbox.ctx, opts());
    expect(out.data).toBe(value);
  });

  it('propagates a read error when the file disappears after stat', async () => {
    const file = filePath();
    await actual.writeFile(file, '{}');
    vi.mocked(fs.stat).mockImplementationOnce(async () => {
      const snapshot = await actual.stat(file);
      await actual.unlink(file);
      return snapshot;
    });
    await expect(jsonTool.execute({ file }, sandbox.ctx, opts())).rejects.toThrow(
      /could not read file.*ENOENT/,
    );
  });

  it('still reports an empty file as invalid JSON', async () => {
    const file = filePath();
    await actual.writeFile(file, '');
    await expect(jsonTool.execute({ file }, sandbox.ctx, opts())).rejects.toThrow(/parse failed/i);
  });
});
