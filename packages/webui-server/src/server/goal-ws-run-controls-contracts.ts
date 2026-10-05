import { gitStdout } from './git-process.js';

/**
 * List the commits on `branch` since `baseSha` (oldest → newest, the order they
 * landed). Used by `goal.revert` to feed WorktreeManager.revertCommits,
 * which reverses them. Returns [] on any git error.
 */
export async function commitsSince(
  cwd: string,
  baseSha: string,
  branch: string,
): Promise<string[]> {
  const output = await gitStdout(cwd, ['log', '--reverse', '--format=%H', `${baseSha}..${branch}`]);
  if (output === null) return [];
  return output
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
