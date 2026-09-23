import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DefaultSessionStore } from '@wrongstack/core/storage';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listSiblingWorktreeSessions,
  withWorktreeSwitch,
} from '../src/boot/worktree-sessions.js';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-wt-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('listSiblingWorktreeSessions', () => {
  it('reads the other worktrees’ session history, not this one’s', async () => {
    const globalRoot = path.join(tmp, 'home');
    const main = path.join(tmp, 'repo');
    const feature = path.join(tmp, 'repo-feature');
    const empty = path.join(tmp, 'repo-empty');
    for (const [root, id] of [
      [main, 'main-session'],
      [feature, 'feature-session'],
    ] as const) {
      const dir = resolveWstackPaths({ projectRoot: root, globalRoot }).projectSessions;
      await fs.mkdir(dir, { recursive: true });
      const writer = await new DefaultSessionStore({ dir, projectRoot: root }).create({
        id,
        model: 'm',
        provider: 'p',
      });
      await writer.append({ type: 'user_input', ts: new Date().toISOString(), content: id });
      await writer.close();
    }

    const sessions = await listSiblingWorktreeSessions({
      projectRoot: main,
      globalRoot,
      listWorktrees: async () => [
        { root: main, branch: 'main', current: true },
        { root: feature, branch: 'feature/x', current: false },
        { root: empty, current: false },
      ],
    });
    expect(sessions.map((s) => [s.summary.id, s.worktree])).toEqual([
      ['feature-session', { root: feature, name: 'repo-feature', branch: 'feature/x' }],
    ]);
  });

  it('is empty for a repository with a single worktree', async () => {
    const sessions = await listSiblingWorktreeSessions({
      projectRoot: tmp,
      globalRoot: tmp,
      listWorktrees: async () => [{ root: tmp, current: true }],
    });
    expect(sessions).toEqual([]);
  });
});

describe('withWorktreeSwitch', () => {
  it('switches to the session’s worktree before resuming it', async () => {
    const calls: string[] = [];
    const resume = vi.fn(async (id: string) => {
      calls.push(`resume ${id}`);
      return id;
    });
    const switchProject = vi.fn(async (root: string) => {
      calls.push(`switch ${root}`);
      return null;
    });
    const wrapped = withWorktreeSwitch(
      resume,
      (id) => (id === 'far' ? { root: '/wt', name: 'wt' } : undefined),
      switchProject,
    );
    await wrapped('near');
    await wrapped('far');
    expect(calls).toEqual(['resume near', 'switch /wt', 'resume far']);
  });

  it('rejects without resuming when the switch fails', async () => {
    const resume = vi.fn(async () => 'x');
    const wrapped = withWorktreeSwitch(
      resume,
      () => ({ root: '/wt', name: 'wt' }),
      async () => 'agents are running',
    );
    await expect(wrapped('far')).rejects.toThrow('Could not switch to worktree wt');
    expect(resume).not.toHaveBeenCalled();
  });
});
