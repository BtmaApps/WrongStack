import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { handleGitConflict } from '../src/server/git-conflict.js';

const owned: string[] = [];
afterEach(async () => {
  for (const root of owned.splice(0)) await rm(root, { recursive: true, force: true });
});
type Files = Record<string, string | Buffer | null>;
async function conflict(base: Files, ours: Files, theirs: Files) {
  const root = await mkdtemp(join(tmpdir(), 'wrongstack-conflict-variants-'));
  owned.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  const apply = async (files: Files) => {
    for (const [path, value] of Object.entries(files)) {
      const file = join(root, path);
      if (value === null) await rm(file, { force: true });
      else {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, value);
      }
    }
    git('add', '-A', '--', '.');
    git('commit', '-m', 'fixture');
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', join(root, 'disabled-hooks'));
  await apply({ 'seed.txt': 'seed\n', ...base });
  git('checkout', '-b', 'other');
  await apply(theirs);
  git('checkout', 'main');
  await apply(ours);
  expect(() => git('merge', '--no-edit', 'other')).toThrow();
  const invoke = async (path: string, resolution?: Record<string, unknown>) => {
    let reply: Record<string, any> = {};
    await handleGitConflict(
      {
        readyState: 1,
        send: (data: string) => {
          reply = JSON.parse(data).payload;
        },
      } as never,
      root,
      { path, ...resolution },
      !!resolution,
    );
    return reply;
  };
  return { root, git, invoke };
}
it('shows a truly absent base for add/add and preserves the explicitly selected side', async () => {
  const { root, git, invoke } = await conflict(
    {},
    { 'added.txt': 'ours\n' },
    { 'added.txt': 'theirs\n' },
  );
  const view = await invoke('added.txt');
  expect(view.base).toBeNull();
  expect(view.sides.base.exists).toBe(false);
  expect(view.sides.ours.exists).toBe(true);
  expect(view.sides.theirs.exists).toBe(true);
  expect((await invoke('added.txt', { revision: view.revision, choice: 'base' })).ok).toBe(false);
  expect((await invoke('added.txt', { revision: view.revision, choice: 'ours' })).ok).toBe(true);
  expect(git('show', ':added.txt')).toBe('ours\n');
  expect(await readFile(join(root, 'added.txt'), 'utf8')).toBe('ours\n');
});
it('refuses implicit deleted-side selection and resolves explicit deletion with missing working parents', async () => {
  const { root, git, invoke } = await conflict(
    { 'deep/deleted.txt': 'base\n' },
    { 'deep/deleted.txt': null },
    { 'deep/deleted.txt': 'theirs modified\n' },
  );
  const view = await invoke('deep/deleted.txt');
  expect(view.sides.ours.exists).toBe(false);
  expect(view.theirs).toBe('theirs modified\n');
  expect(
    (await invoke('deep/deleted.txt', { revision: view.revision, choice: 'ours' })).error,
  ).toContain('explicit deletion');
  await rm(join(root, 'deep'), { recursive: true, force: true });
  expect(
    (await invoke('deep/deleted.txt', { revision: view.revision, choice: 'delete' })).error,
  ).toContain('changed since review');
  const fresh = await invoke('deep/deleted.txt');
  expect(fresh.workingInfo.exists).toBe(false);
  expect(
    (await invoke('deep/deleted.txt', { revision: fresh.revision, choice: 'delete' })).outcome,
  ).toBe('deleted');
  expect(git('ls-files', '--', 'deep/deleted.txt')).toBe('');
});
it('copies binary sides byte-for-byte and never accepts lossy text replacement', async () => {
  const base = Buffer.from([0, 1, 255]),
    ours = Buffer.from([0, 2, 254]),
    theirs = Buffer.from([0, 3, 253]);
  const { root, git, invoke } = await conflict(
    { 'asset.bin': base },
    { 'asset.bin': ours },
    { 'asset.bin': theirs },
  );
  const view = await invoke('asset.bin');
  expect(view.binary).toBe(true);
  expect(view.ours).toBeNull();
  expect(view.sides.theirs.bytes).toBe(3);
  expect(
    (await invoke('asset.bin', { revision: view.revision, choice: 'text', text: 'fake text' })).ok,
  ).toBe(false);
  expect((await invoke('asset.bin', { revision: view.revision, choice: 'theirs' })).ok).toBe(true);
  expect(await readFile(join(root, 'asset.bin'))).toEqual(theirs);
  expect(execFileSync('git', ['show', ':asset.bin'], { cwd: root, windowsHide: true })).toEqual(
    theirs,
  );
  expect(git('ls-files', '-u')).toBe('');
});
it('restores a selected side through missing working directories and preserves its executable index mode', async () => {
  const { root, git, invoke } = await conflict(
    { 'deep/restored.txt': 'base\n' },
    { 'deep/restored.txt': null },
    { 'deep/restored.txt': 'restored side\n' },
  );
  const stage = git('ls-files', '-u', '--', 'deep/restored.txt')
    .split('\n')
    .find((line) => / 3\t/.test(line));
  expect(stage).toBeTruthy();
  execFileSync('git', ['update-index', '--index-info'], {
    cwd: root,
    input: stage!.replace(/^100644 /, '100755 ') + '\n',
    windowsHide: true,
  });
  await rm(join(root, 'deep'), { recursive: true, force: true });
  const view = await invoke('deep/restored.txt');
  expect(view.workingInfo.exists).toBe(false);
  expect(view.sides.theirs.mode).toBe('100755');
  expect(
    (await invoke('deep/restored.txt', { revision: view.revision, choice: 'theirs' })).ok,
  ).toBe(true);
  expect(await readFile(join(root, 'deep/restored.txt'), 'utf8')).toBe('restored side\n');
  expect(git('ls-files', '--stage', '--', 'deep/restored.txt')).toMatch(/^100755 /);
});
it('resolves rename/rename conflicts path by path without removing an unselected destination', async () => {
  const body = 'A stable original body\n';
  const { root, git, invoke } = await conflict(
    { 'old.txt': body },
    { 'old.txt': null, 'ours.txt': body },
    { 'old.txt': null, 'theirs.txt': body },
  );
  const old = await invoke('old.txt');
  expect(old.relatedPaths.toSorted()).toEqual(['old.txt', 'ours.txt', 'theirs.txt']);
  expect(old.sides.ours.exists).toBe(false);
  expect(old.sides.theirs.exists).toBe(false);
  const ours = await invoke('ours.txt');
  expect((await invoke('ours.txt', { revision: ours.revision, choice: 'ours' })).ok).toBe(true);
  expect(await readFile(join(root, 'theirs.txt'), 'utf8')).toBe(body);
  expect(git('ls-files', '-u', '--', 'theirs.txt')).not.toBe('');
  expect((await invoke('old.txt', { revision: old.revision, choice: 'delete' })).error).toContain(
    'changed since review',
  );
  const freshOld = await invoke('old.txt');
  expect((await invoke('old.txt', { revision: freshOld.revision, choice: 'delete' })).ok).toBe(
    true,
  );
  const theirs = await invoke('theirs.txt');
  expect((await invoke('theirs.txt', { revision: theirs.revision, choice: 'delete' })).ok).toBe(
    true,
  );
  expect(git('ls-files', '-u')).toBe('');
  expect(git('show', ':ours.txt')).toBe(body);
  expect(git('ls-files', '--', 'old.txt', 'theirs.txt')).toBe('');
});
