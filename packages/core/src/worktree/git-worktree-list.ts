/**
 * The user's own git worktrees of the repository at `projectRoot`
 * (`git worktree add ../feature-x`). WrongStack keeps sessions per project
 * directory, so each worktree has its own session history; pickers list them
 * side by side. The checkouts WrongStack manages for subagents
 * (`<repo>/.wrongstack/worktrees/…`) are not the user's and are left out, as
 * are bare repositories and entries git marks prunable (directory gone).
 *
 * @module worktree/git-worktree-list
 */
import * as path from 'node:path';
import { defaultRun, type GitRunner } from './worktree-git.js';

export interface GitWorktreeEntry {
  /** Absolute checkout directory. */
  root: string;
  /** Short branch name; undefined for a detached HEAD. */
  branch?: string | undefined;
  /** The checkout `projectRoot` is in. */
  current: boolean;
}

function samePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Parse `git worktree list --porcelain` output. */
function parseWorktreePorcelain(output: string, projectRoot: string): GitWorktreeEntry[] {
  const records = output.split(/\r?\n\r?\n/);
  const entries: GitWorktreeEntry[] = [];
  let mainRoot: string | undefined;
  for (const record of records) {
    const lines = record.split(/\r?\n/).filter(Boolean);
    const dir = lines.find((l) => l.startsWith('worktree '))?.slice('worktree '.length);
    if (!dir) continue;
    // The first record is always the main worktree.
    mainRoot ??= dir;
    if (lines.includes('bare') || lines.some((l) => l.startsWith('prunable'))) continue;
    if (isInside(dir, path.join(mainRoot, '.wrongstack', 'worktrees'))) continue;
    const ref = lines.find((l) => l.startsWith('branch '))?.slice('branch '.length);
    entries.push({
      root: path.resolve(dir),
      branch: ref?.replace(/^refs\/heads\//, ''),
      current: samePath(dir, projectRoot) || isInside(projectRoot, dir),
    });
  }
  // A nested checkout claims `current` over the checkout that contains it.
  const current = entries.filter((e) => e.current);
  if (current.length > 1) {
    const deepest = current.reduce((a, b) => (b.root.length > a.root.length ? b : a));
    for (const e of current) e.current = e === deepest;
  }
  return entries;
}

/**
 * List the repository's worktrees. Returns `[]` outside a git repository or
 * when git fails: this feeds pickers, never a decision.
 */
export async function listGitWorktrees(
  projectRoot: string,
  runGit: GitRunner = (args, cwd) => defaultRun('git', args, cwd),
): Promise<GitWorktreeEntry[]> {
  try {
    const result = await runGit(['worktree', 'list', '--porcelain'], projectRoot);
    if (result.code !== 0) return [];
    return parseWorktreePorcelain(result.stdout, projectRoot);
  } catch {
    return [];
  }
}
