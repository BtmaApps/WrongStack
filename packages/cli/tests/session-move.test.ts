import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DefaultSessionStore } from '@wrongstack/core/storage';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeSessionMove, moveSessionTo } from '../src/session-move.js';

let tmp: string;
let globalRoot: string;

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cli-session-move-')));
  globalRoot = path.join(tmp, 'home');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore', windowsHide: true });
}

async function storeFor(projectRoot: string): Promise<DefaultSessionStore> {
  const dir = resolveWstackPaths({ projectRoot, globalRoot }).projectSessions;
  await fs.mkdir(dir, { recursive: true });
  return new DefaultSessionStore({ dir, projectRoot });
}

async function closedSession(store: DefaultSessionStore, checkout: string): Promise<string> {
  const writer = await store.create({ id: '', model: 'm', provider: 'p', checkout });
  await writer.append({ type: 'user_input', ts: new Date().toISOString(), content: 'hello' });
  await writer.close();
  return writer.id;
}

describe('moveSessionTo', () => {
  it('re-stamps a session for another git worktree of the same repository', async () => {
    const main = path.join(tmp, 'repo');
    await fs.mkdir(main, { recursive: true });
    git(main, 'init', '-q');
    git(
      main,
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    );
    const worktree = path.join(tmp, 'repo-feature');
    git(main, 'worktree', 'add', '-q', worktree);

    const store = await storeFor(main);
    const id = await closedSession(store, main);

    const result = await moveSessionTo({ store, sessionId: id, targetPath: worktree, globalRoot });

    expect(result.kind).toBe('worktree');
    expect((await store.list(5))[0]?.checkout).toBe(path.resolve(worktree));
    expect(describeSessionMove(result)).toContain('/resume lists it there');
  });

  it('moves a session to another project, where a store opened on that project lists it', async () => {
    const a = path.join(tmp, 'project-a');
    const b = path.join(tmp, 'project-b');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });
    const store = await storeFor(a);
    const id = await closedSession(store, a);

    const result = await moveSessionTo({ store, sessionId: id, targetPath: b, globalRoot });

    expect(result).toMatchObject({ kind: 'project', fromProject: path.resolve(a) });
    expect(await store.list(5)).toEqual([]);
    const there = await storeFor(b);
    expect((await there.list(5)).map((s) => s.id)).toEqual([id]);
    expect(describeSessionMove(result)).toContain(`wstack resume ${id}`);
  });

  it('refuses a path that is not a directory', async () => {
    const store = await storeFor(path.join(tmp, 'x'));
    await expect(
      moveSessionTo({
        store,
        sessionId: 'nope',
        targetPath: path.join(tmp, 'missing'),
        globalRoot,
      }),
    ).rejects.toThrow(/Not a directory/);
  });
});
