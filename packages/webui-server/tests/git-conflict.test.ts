import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { handleGitConflict } from '../src/server/git-conflict.js';
import { handleShellGitRoute } from '../src/server/shell-git-routes.js';

it('reviews real index stages and resolves only the reviewed text conflict with stale/marker refusal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wrongstack-conflict-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  const commit = () =>
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'core.hooksPath=disabled',
      'commit',
      '-am',
      'fixture',
    );
  let reply: Record<string, any> = {};
  const ws = {
    readyState: 1,
    send: (text: string) => {
      reply = JSON.parse(text).payload;
    },
  };
  const invoke = async (type: string, payload: Record<string, unknown>) => {
    await handleShellGitRoute(
      ws as never,
      { type, payload: { ...payload, requestId: 'merge-proof' } } as never,
      {
        gitConflict: (
          socket: import('ws').WebSocket,
          message: import('../src/server/types.js').WSClientMessage,
        ) => handleGitConflict(socket, root, message.payload, type === 'git.conflict.resolve'),
      } as never,
    );
    expect(reply.requestId).toBe('merge-proof');
    return reply;
  };
  try {
    git('init', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    await writeFile(join(root, 'conflict.txt'), 'base\n');
    git('add', '.');
    commit();
    git('checkout', '-b', 'other');
    await writeFile(join(root, 'conflict.txt'), 'theirs\n');
    commit();
    git('checkout', 'main');
    await writeFile(join(root, 'conflict.txt'), 'ours\n');
    commit();
    expect(() => git('merge', '--no-edit', 'other')).toThrow();
    expect(git('ls-files', '--unmerged').trim().split('\n')).toHaveLength(3);
    const view = await invoke('git.conflict', { path: 'conflict.txt' });
    expect(view).toMatchObject({ base: 'base\n', ours: 'ours\n', theirs: 'theirs\n' });
    expect(view.working).toContain('<<<<<<<');
    const before = await readFile(join(root, 'conflict.txt'), 'utf8');
    expect(
      (
        await invoke('git.conflict.resolve', {
          path: 'conflict.txt',
          revision: view.revision,
          text: before,
        })
      ).error,
    ).toMatch(/markers/);
    await writeFile(join(root, 'conflict.txt'), before + 'external change\n');
    expect(
      (
        await invoke('git.conflict.resolve', {
          path: 'conflict.txt',
          revision: view.revision,
          text: 'merged\n',
        })
      ).error,
    ).toMatch(/changed since review/);
    expect(git('ls-files', '-u', '--', 'conflict.txt')).not.toBe('');
    const fresh = await invoke('git.conflict', { path: 'conflict.txt' });
    expect(
      (
        await invoke('git.conflict.resolve', {
          path: 'conflict.txt',
          revision: fresh.revision,
          text: 'merged\n',
        })
      ).ok,
    ).toBe(true);
    expect(await readFile(join(root, 'conflict.txt'), 'utf8')).toBe('merged\n');
    expect(git('show', ':conflict.txt')).toBe('merged\n');
    expect(git('ls-files', '-u', '--', 'conflict.txt')).toBe('');
    expect((await invoke('git.conflict', { path: 'conflict.txt' })).error).toMatch(
      /no supported unresolved/,
    );
    expect((await invoke('git.conflict', { path: '../outside' })).ok).toBe(false);
    const inputGit = (args: string[], input: string) =>
      execFileSync('git', args, { cwd: root, input, encoding: 'utf8', windowsHide: true });
    const blobs = ['a', 'b', 'c'].map((letter) =>
      inputGit(['hash-object', '-w', '--stdin'], letter.repeat(300000) + '\n').trim(),
    );
    git('update-index', '--force-remove', '--', 'conflict.txt');
    inputGit(
      ['update-index', '--index-info'],
      blobs.map((hash, index) => `100644 ${hash} ${index + 1}\tconflict.txt\n`).join(''),
    );
    await writeFile(join(root, 'conflict.txt'), 'w'.repeat(300000) + '\n');
    const indexBeforeLimit = git('ls-files', '-u', '--', 'conflict.txt');
    expect((await invoke('git.conflict', { path: 'conflict.txt' })).error).toMatch(/1 MiB/);
    expect(git('ls-files', '-u', '--', 'conflict.txt')).toBe(indexBeforeLimit);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
