/**
 * `.wrongstack/` and `.wrongstack/atlas/` can arrive with a cloned
 * repository. The atlas writers followed a symlink at either, so a
 * non-mutating tool wrote outside the project.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureAtlasDir, writeAtlasFile } from '../src/codebase-index/atlas-projection.js';

let project = '';
let outside = '';

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-guard-project-'));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-guard-outside-'));
});
afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

/** A directory link that needs no privilege on Windows. */
const linkDir = (target: string, at: string) => fs.symlink(target, at, 'junction');

describe('ensureAtlasDir', () => {
  it('creates .wrongstack/atlas inside the project', async () => {
    const dir = await ensureAtlasDir(project);
    expect(dir).toBe(path.join(await fs.realpath(project), '.wrongstack', 'atlas'));
    expect((await fs.lstat(dir)).isDirectory()).toBe(true);
    expect(await ensureAtlasDir(project)).toBe(dir);
  });

  it('refuses a linked .wrongstack', async () => {
    await linkDir(outside, path.join(project, '.wrongstack'));
    await expect(ensureAtlasDir(project)).rejects.toThrow(/real directory/);
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('refuses a linked .wrongstack/atlas', async () => {
    await fs.mkdir(path.join(project, '.wrongstack'));
    await linkDir(outside, path.join(project, '.wrongstack', 'atlas'));
    await expect(ensureAtlasDir(project)).rejects.toThrow(/real directory/);
  });

  it('refuses a file where the directory belongs', async () => {
    await fs.writeFile(path.join(project, '.wrongstack'), '');
    await expect(ensureAtlasDir(project)).rejects.toThrow(/real directory/);
  });
});

describe('writeAtlasFile', () => {
  it('refuses to write through a linked file', async (ctx) => {
    const dir = await ensureAtlasDir(project);
    const victim = path.join(outside, 'victim.txt');
    await fs.writeFile(victim, 'original');
    try {
      await fs.symlink(victim, path.join(dir, 'FLOWS.md'), 'file');
    } catch {
      ctx.skip(); // file symlinks need a privilege on Windows
    }
    await expect(writeAtlasFile(dir, 'FLOWS.md', 'atlas')).rejects.toThrow(/symlink/);
    expect(await fs.readFile(victim, 'utf8')).toBe('original');
  });

  it('writes and overwrites a plain file', async () => {
    const dir = await ensureAtlasDir(project);
    await writeAtlasFile(dir, 'FLOWS.md', 'one');
    await writeAtlasFile(dir, 'FLOWS.md', 'two');
    expect(await fs.readFile(path.join(dir, 'FLOWS.md'), 'utf8')).toBe('two');
  });
});
