import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { withWorktreeSwitch, worktreeOfSession } from '../src/boot/worktree-sessions.js';

const main = path.resolve('/repo');
const feature = path.resolve('/repo-feature');
const worktrees = [
  { root: main, branch: 'main', current: true },
  { root: feature, branch: 'feature/x', current: false },
];

describe('worktreeOfSession', () => {
  it('tags a session that ran in another worktree of the repository', () => {
    expect(worktreeOfSession({ checkout: feature }, worktrees)).toEqual({
      root: feature,
      name: 'repo-feature',
      branch: 'feature/x',
    });
  });

  it('leaves this checkout, unknown checkouts and old sessions untagged', () => {
    expect(worktreeOfSession({ checkout: main }, worktrees)).toBeUndefined();
    expect(worktreeOfSession({ checkout: path.resolve('/gone') }, worktrees)).toBeUndefined();
    expect(worktreeOfSession({}, worktrees)).toBeUndefined();
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
