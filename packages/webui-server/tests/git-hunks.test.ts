import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { handleGitHunks } from '../src/server/git-hunks.js';
import { handleShellGitRoute } from '../src/server/shell-git-routes.js';

it('stages and unstages only the reviewed hunk, refuses stale diffs, and keeps worktree bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wrongstack-hunks-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  const frames: { type: string; payload: Record<string, any> }[] = [];
  const ws = { readyState: 1, send: (text: string) => frames.push(JSON.parse(text)) };
  const invoke = async (type: string, payload: Record<string, unknown>, project = root) => {
    frames.length = 0;
    await handleShellGitRoute(
      ws as never,
      { type, payload: { ...payload, requestId: 'hunk-proof' } } as never,
      {
        gitHunks: (
          socket: import('ws').WebSocket,
          message: import('../src/server/types.js').WSClientMessage,
        ) => handleGitHunks(socket, project, message.payload, message.type === 'git.hunk.apply'),
      } as never,
    );
    expect(frames.at(-1)?.payload.requestId).toBe('hunk-proof');
    return frames.at(-1)!.payload;
  };
  try {
    git('init');
    const original = Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    await writeFile(join(root, 'sample.txt'), original);
    await writeFile(join(root, 'legacy.txt'), Buffer.from([0xff, 10]));
    git('add', '.');
    git(
      '-c',
      'user.name=Native Test',
      '-c',
      'user.email=native@example.invalid',
      '-c',
      'core.hooksPath=disabled',
      'commit',
      '-m',
      'fixture',
    );
    const edited = original
      .replace('line 3\n', 'first change\n')
      .replace('line 39\n', 'second change\n');
    await writeFile(join(root, 'sample.txt'), edited);
    const view = await invoke('git.hunks', { path: 'sample.txt', layer: 'unstaged' });
    expect(view.hunks).toHaveLength(2);
    expect(
      (
        await invoke('git.hunk.apply', {
          path: 'sample.txt',
          layer: 'unstaged',
          patchId: view.patchId,
          hunk: 0,
        })
      ).ok,
    ).toBe(true);
    expect(git('show', ':sample.txt')).toBe(original.replace('line 3\n', 'first change\n'));
    expect(await readFile(join(root, 'sample.txt'), 'utf8')).toBe(edited);
    const stale = await invoke('git.hunks', { path: 'sample.txt', layer: 'unstaged' });
    await writeFile(join(root, 'sample.txt'), edited.replace('second change', 'newer change'));
    expect(
      (
        await invoke('git.hunk.apply', {
          path: 'sample.txt',
          layer: 'unstaged',
          patchId: stale.patchId,
          hunk: 0,
        })
      ).error,
    ).toMatch(/changed since review/);
    const staged = await invoke('git.hunks', { path: 'sample.txt', layer: 'staged' });
    expect(staged.hunks).toHaveLength(1);
    expect(
      (
        await invoke('git.hunk.apply', {
          path: 'sample.txt',
          layer: 'staged',
          patchId: staged.patchId,
          hunk: 0,
        })
      ).ok,
    ).toBe(true);
    expect(git('show', ':sample.txt')).toBe(original);
    expect(await readFile(join(root, 'sample.txt'), 'utf8')).toContain('newer change');
    await mkdir(join(root, 'nested'));
    expect(
      (await invoke('git.hunks', { path: 'sample.txt', layer: 'unstaged' }, join(root, 'nested')))
        .ok,
    ).toBe(false);
    expect((await invoke('git.hunks', { path: '../sample.txt', layer: 'unstaged' })).ok).toBe(
      false,
    );
    expect((await invoke('git.hunks', { path: 'sample.txt', layer: 'wrong' })).ok).toBe(false);
    await writeFile(join(root, 'legacy.txt'), Buffer.from([0xfe, 10]));
    expect((await invoke('git.hunks', { path: 'legacy.txt', layer: 'unstaged' })).error).toMatch(
      /UTF-8/,
    );
    await writeFile(join(root, 'new.txt'), 'New file\n');
    expect((await invoke('git.hunks', { path: 'new.txt', layer: 'unstaged' })).hunks).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
