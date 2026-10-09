import { createHash } from 'node:crypto';
import * as realFs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Two agents in one process (each with its own read tracker) edit one file at
 * the same moment. Without a per-file exclusion both read the original and the
 * later write silently drops the other edit. Path lookups answer from a cache
 * filled by a warm-up edit, so an agent reaches its read in microtasks; the
 * first read then waits one macrotask turn for the other agent's read.
 */
const gate = vi.hoisted(() => ({
  target: '',
  warming: false,
  cache: new Map<string, unknown>(),
  reads: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const cached =
    (name: 'realpath' | 'stat' | 'lstat' | 'readdir') =>
    async (...args: unknown[]) => {
      const key = `${name}:${String(args[0])}`;
      if (!gate.warming && gate.cache.has(key)) return gate.cache.get(key);
      const value = await (actual[name] as (...a: unknown[]) => Promise<unknown>)(...args);
      if (gate.warming) gate.cache.set(key, value);
      return value;
    };
  return {
    ...actual,
    realpath: cached('realpath'),
    stat: cached('stat'),
    lstat: cached('lstat'),
    readdir: cached('readdir'),
    readFile: async (...args: unknown[]) => {
      if (
        gate.target &&
        path.resolve(String(args[0])) === gate.target &&
        typeof args[1] !== 'string'
      ) {
        gate.reads++;
        if (gate.reads === 1) await new Promise((resolve) => setImmediate(resolve));
      }
      return (actual.readFile as (...a: unknown[]) => Promise<unknown>)(...args);
    },
  };
});

const { editTool } = await import('../src/edit.js');
const { replaceTool } = await import('../src/replace.js');

const dirs: string[] = [];
afterEach(async () => {
  gate.target = '';
  for (const dir of dirs.splice(0)) await realFs.rm(dir, { recursive: true, force: true });
});

function agentContext(dir: string, file: string, content: string) {
  const hashes = new Map([[file, createHash('sha256').update(content).digest('hex')]]);
  return {
    meta: {},
    session: { id: 's' },
    projectRoot: dir,
    cwd: dir,
    hasRead: () => true,
    lastReadHash: (p: string) => hashes.get(path.resolve(p)),
    recordRead: (p: string, _mtime: number, _source: string, hash?: string) => {
      if (hash) hashes.set(path.resolve(p), hash);
    },
  } as never;
}

describe('edit — concurrent agents on one file', () => {
  it('never lets one agent silently overwrite the other', async () => {
    const dir = await realFs.realpath(
      await realFs.mkdtemp(path.join(os.tmpdir(), 'ws-edit-race-')),
    );
    dirs.push(dir);
    const file = path.join(dir, 'a.txt');
    const original = 'alpha\nbeta\n';
    await realFs.writeFile(file, original);
    gate.target = path.resolve(file);
    gate.warming = true;
    await editTool.execute(
      { path: file, old_string: 'alpha', new_string: 'alpha2' },
      agentContext(dir, gate.target, original),
      {} as never,
    );
    gate.warming = false;
    await realFs.writeFile(file, original);
    gate.reads = 0;

    const run = (oldString: string, newString: string) =>
      editTool
        .execute(
          { path: file, old_string: oldString, new_string: newString },
          agentContext(dir, gate.target, original),
          {} as never,
        )
        .then(
          () => 'ok',
          () => 'error',
        );
    const results = await Promise.all([run('alpha', 'ALPHA'), run('beta', 'BETA')]);
    const content = await realFs.readFile(file, 'utf8');

    if (results.every((result) => result === 'ok')) expect(content).toBe('ALPHA\nBETA\n');
    else expect(results.filter((result) => result === 'ok')).toHaveLength(1);
  });
  it('keeps both replacements when two agents run replace on one file at once', async () => {
    const dir = await realFs.realpath(
      await realFs.mkdtemp(path.join(os.tmpdir(), 'ws-replace-race-')),
    );
    dirs.push(dir);
    const file = path.join(dir, 'a.txt');
    const original = 'alpha@beta@';
    await realFs.writeFile(file, original);
    gate.target = path.resolve(file);
    const replace = (pattern: string, replacement: string) =>
      replaceTool.execute(
        { pattern, replacement, files: file, dry_run: false } as never,
        agentContext(dir, gate.target, original),
        {} as never,
      );
    gate.warming = true;
    await replace('alpha', 'alpha');
    gate.warming = false;
    gate.reads = 0;

    await Promise.all([replace('alpha', 'ALPHA'), replace('beta', 'BETA')]);

    expect(await realFs.readFile(file, 'utf8')).toBe('ALPHA@BETA@');
  });
});
