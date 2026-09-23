/**
 * `/resume` across git worktrees. WrongStack keeps sessions per project
 * directory, so each of the user's `git worktree`s has its own history. The
 * picker lists the latest sessions of the other worktrees under this one;
 * choosing one switches the TUI to that worktree in place (the F1 project
 * switch) and then resumes it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DefaultSessionStore } from '@wrongstack/core/storage';
import type { SessionSummary } from '@wrongstack/core/types';
import { resolveWstackPaths } from '@wrongstack/core/utils';
import { listGitWorktrees } from '@wrongstack/core/worktree';

export interface WorktreeRef {
  root: string;
  name: string;
  branch?: string | undefined;
}

export interface WorktreeSession {
  summary: SessionSummary;
  worktree: WorktreeRef;
}

/** Sessions shown per other worktree; the picker is about this worktree. */
const PER_WORKTREE = 5;

/**
 * The latest sessions of every other worktree of the repository at
 * `projectRoot`. Best effort: a worktree whose history cannot be read is
 * skipped, and outside a git repository the list is empty.
 */
export async function listSiblingWorktreeSessions(opts: {
  projectRoot: string;
  globalRoot: string;
  perWorktree?: number | undefined;
  listWorktrees?: typeof listGitWorktrees | undefined;
}): Promise<WorktreeSession[]> {
  const worktrees = await (opts.listWorktrees ?? listGitWorktrees)(opts.projectRoot);
  if (worktrees.length < 2) return [];
  const out: WorktreeSession[] = [];
  for (const wt of worktrees) {
    if (wt.current) continue;
    const dir = resolveWstackPaths({ projectRoot: wt.root, globalRoot: opts.globalRoot })
      .projectSessions;
    if (!fs.existsSync(dir)) continue;
    try {
      const store = new DefaultSessionStore({ dir, projectRoot: wt.root });
      const summaries = await store.list(opts.perWorktree ?? PER_WORKTREE);
      const worktree: WorktreeRef = {
        root: wt.root,
        name: path.basename(wt.root) || wt.root,
        ...(wt.branch ? { branch: wt.branch } : {}),
      };
      for (const summary of summaries) out.push({ summary, worktree });
    } catch {
      // unreadable history — leave this worktree out of the picker
    }
  }
  return out;
}

/**
 * Wrap the resume callback: a session that belongs to another worktree
 * (per `lookup`, filled from the last listing) first switches the TUI to that
 * worktree, then resumes there. A failed switch rejects, which the picker
 * shows, and leaves the current project untouched.
 */
export function withWorktreeSwitch<A extends unknown[], R>(
  resume: (sessionId: string, ...rest: A) => Promise<R>,
  lookup: (sessionId: string) => WorktreeRef | undefined,
  switchProject: (root: string, name: string) => Promise<string | null>,
): (sessionId: string, ...rest: A) => Promise<R> {
  return async (sessionId, ...rest) => {
    const target = lookup(sessionId);
    if (target) {
      const error = await switchProject(target.root, target.name);
      if (error) throw new Error(`Could not switch to worktree ${target.name}: ${error}`);
    }
    return resume(sessionId, ...rest);
  };
}
